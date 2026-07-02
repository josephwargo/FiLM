"""
Model Selector tests — MODEL-001 to MODEL-013.

Covers the model catalog endpoint, per-chat model selection, provenance
stamping, retired-model fallback, and Phase 2: the Model Manager
(credentials, enable/disable, Ollama discovery, auth-failure surfacing).
"""
from unittest.mock import MagicMock, patch

from app.services.llm import DEFAULT_MODEL_ID
from app.services.llm import catalog as llm_catalog


def _create_chat(client, title="Test Chat"):
    return client.post("/api/chats", json={"title": title}).json()


def _capturing_service(captured):
    mock = MagicMock()
    mock.generate_response.return_value = "Mock response"

    def fake_get_service(model_id):
        captured["model_id"] = model_id
        return mock

    return fake_get_service


# ── MODEL-001 ─────────────────────────────────────────────────────────────────

def test_models_catalog(client):
    """MODEL-001 [P0 smoke]: GET /api/models returns the catalog with exactly one default."""
    r = client.get("/api/models")
    assert r.status_code == 200
    models = r.json()
    assert len(models) >= 2
    for m in models:
        assert set(m) >= {"id", "name", "provider", "description", "available", "is_default"}
    defaults = [m for m in models if m["is_default"]]
    assert len(defaults) == 1
    assert defaults[0]["id"] == DEFAULT_MODEL_ID
    # GEMINI_API_KEY is set in conftest, so google models report available
    assert all(m["available"] for m in models if m["provider"] == "google")


# ── MODEL-002 ─────────────────────────────────────────────────────────────────

def test_patch_chat_model_and_clear(client):
    """MODEL-002 [P0 smoke]: PATCH sets a per-chat model; empty string clears back to default."""
    chat = _create_chat(client)
    assert chat["model"] is None

    r = client.patch(f"/api/chats/{chat['id']}", json={"model": "gemini-2.5-pro"})
    assert r.status_code == 200
    assert r.json()["model"] == "gemini-2.5-pro"
    assert client.get(f"/api/chats/{chat['id']}").json()["model"] == "gemini-2.5-pro"

    r = client.patch(f"/api/chats/{chat['id']}", json={"model": ""})
    assert r.status_code == 200
    assert r.json()["model"] is None


# ── MODEL-003 ─────────────────────────────────────────────────────────────────

def test_send_uses_chat_model_and_stamps_provenance(client):
    """MODEL-003 [P0 smoke]: Sending routes to the chat's model and stamps it on the assistant message."""
    captured = {}
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"model": "gemini-2.5-pro"})

    with patch("app.routers.chats.get_llm_service", _capturing_service(captured)):
        r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200
    assert captured["model_id"] == "gemini-2.5-pro"

    msgs = client.get(f"/api/chats/{chat_id}").json()["messages"]
    assert msgs[0]["model"] is None  # user message — no provenance
    assert msgs[1]["model"] == "gemini-2.5-pro"


# ── MODEL-004 ─────────────────────────────────────────────────────────────────

def test_retired_model_falls_back_to_default(client):
    """MODEL-004 [P1 regression]: A stored model id missing from the catalog falls back to the default."""
    captured = {}
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"model": "gemini-2.0-flash"})  # retired id

    with patch("app.routers.chats.get_llm_service", _capturing_service(captured)):
        r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200
    assert captured["model_id"] == DEFAULT_MODEL_ID

    msgs = client.get(f"/api/chats/{chat_id}").json()["messages"]
    assert msgs[1]["model"] == DEFAULT_MODEL_ID
    # The stored preference is preserved (not rewritten) so a future catalog re-add would restore it
    assert client.get(f"/api/chats/{chat_id}").json()["model"] == "gemini-2.0-flash"


# ── MODEL-005 ─────────────────────────────────────────────────────────────────

def test_stream_done_event_includes_model(client):
    """MODEL-005 [P1 regression]: The SSE done event carries the model id used for the response."""
    chat_id = _create_chat(client)["id"]
    r = client.post(f"/api/chats/{chat_id}/messages/stream", json={"message": "Hi"})
    assert r.status_code == 200
    assert f'"model": "{DEFAULT_MODEL_ID}"' in r.text


# ── MODEL-006 ─────────────────────────────────────────────────────────────────

def test_full_catalog_defaults(client):
    """MODEL-006 [P0 smoke]: /api/models/catalog lists every curated model; google enabled
    by default, other providers opt-in; provider credential status included."""
    r = client.get("/api/models/catalog")
    assert r.status_code == 200
    data = r.json()

    models = {m["id"]: m for m in data["models"]}
    assert len(models) >= 9  # 3 providers × 3 curated models
    assert models["gemini-2.5-flash"]["enabled"] is True
    assert models["claude-sonnet-4-6"]["enabled"] is False
    assert models["gpt-5.5"]["enabled"] is False

    providers = data["providers"]
    assert set(providers) == {"google", "anthropic", "openai", "ollama"}
    # GEMINI_API_KEY is set in conftest env
    assert providers["google"] == {"configured": True, "source": "env"}
    assert providers["anthropic"]["configured"] is False
    assert "models" in providers["ollama"]


# ── MODEL-007 ─────────────────────────────────────────────────────────────────

def test_enable_disable_model(client):
    """MODEL-007 [P0 smoke]: PATCH /api/models/:id toggles picker visibility; a chat
    pointing at a disabled model falls back to the default at send time."""
    # Non-google models are hidden from the picker until enabled
    picker_ids = {m["id"] for m in client.get("/api/models").json()}
    assert "claude-sonnet-4-6" not in picker_ids

    r = client.patch("/api/models/claude-sonnet-4-6", json={"enabled": True})
    assert r.status_code == 200
    picker_ids = {m["id"] for m in client.get("/api/models").json()}
    assert "claude-sonnet-4-6" in picker_ids

    # Disabling a google model removes it and breaks routing to it
    client.patch("/api/models/gemini-2.5-pro", json={"enabled": False})
    picker_ids = {m["id"] for m in client.get("/api/models").json()}
    assert "gemini-2.5-pro" not in picker_ids

    captured = {}
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"model": "gemini-2.5-pro"})
    with patch("app.routers.chats.get_llm_service", _capturing_service(captured)):
        r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200
    assert captured["model_id"] == DEFAULT_MODEL_ID

    # Unknown model id → 404
    assert client.patch("/api/models/not-a-model", json={"enabled": True}).status_code == 404


# ── MODEL-008 ─────────────────────────────────────────────────────────────────

def test_save_credential_validates(client):
    """MODEL-008 [P0 smoke]: Saving a credential validates it live; valid keys are stored
    (source becomes 'db'), invalid keys return 400 and are not stored."""
    with patch("app.routers.models.validate_credential", return_value=(False, "bad key")):
        r = client.put("/api/models/providers/anthropic/credential", json={"value": "sk-bad"})
    assert r.status_code == 400
    assert "bad key" in r.json()["detail"]
    assert client.get("/api/models/catalog").json()["providers"]["anthropic"]["configured"] is False

    with patch("app.routers.models.validate_credential", return_value=(True, None)):
        r = client.put("/api/models/providers/anthropic/credential", json={"value": "sk-good"})
    assert r.status_code == 200
    assert r.json()["source"] == "db"
    assert client.get("/api/models/catalog").json()["providers"]["anthropic"]["configured"] is True

    # Once the key exists, its models report available in the full catalog
    models = {m["id"]: m for m in client.get("/api/models/catalog").json()["models"]}
    assert models["claude-sonnet-4-6"]["available"] is True


# ── MODEL-009 ─────────────────────────────────────────────────────────────────

def test_delete_credential(client):
    """MODEL-009 [P1]: Deleting a DB credential falls back to env (google) or unconfigured."""
    with patch("app.routers.models.validate_credential", return_value=(True, None)):
        client.put("/api/models/providers/openai/credential", json={"value": "sk-x"})
    assert client.get("/api/models/catalog").json()["providers"]["openai"]["configured"] is True

    r = client.delete("/api/models/providers/openai/credential")
    assert r.status_code == 200
    assert client.get("/api/models/catalog").json()["providers"]["openai"]["configured"] is False

    # google keeps its env fallback after deleting a (nonexistent) DB row
    client.delete("/api/models/providers/google/credential")
    assert client.get("/api/models/catalog").json()["providers"]["google"]["source"] == "env"

    # Unknown provider → 404
    assert client.delete("/api/models/providers/nope/credential").status_code == 404


# ── MODEL-010 ─────────────────────────────────────────────────────────────────

def test_ollama_discovery(client, db):
    """MODEL-010 [P1]: With an Ollama URL configured, discovered local models appear in
    the picker with the ollama: prefix and resolve at send time."""
    from app.models.schemas import ProviderCredential

    db.add(ProviderCredential(provider="ollama", value="http://localhost:11434"))
    db.commit()

    fake_resp = MagicMock()
    fake_resp.json.return_value = {"models": [{"name": "llama3:8b"}]}
    fake_resp.raise_for_status.return_value = None

    llm_catalog._ollama_cache = (0.0, [])
    try:
        with patch("httpx.get", return_value=fake_resp):
            models = client.get("/api/models").json()
            ollama_models = [m for m in models if m["provider"] == "ollama"]
            assert len(ollama_models) == 1
            assert ollama_models[0]["id"] == "ollama:llama3:8b"
            assert ollama_models[0]["available"] is True

            captured = {}
            chat_id = _create_chat(client)["id"]
            client.patch(f"/api/chats/{chat_id}", json={"model": "ollama:llama3:8b"})
            with patch("app.routers.chats.get_llm_service", _capturing_service(captured)):
                r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hi"})
            assert r.status_code == 200
            assert captured["model_id"] == "ollama:llama3:8b"
    finally:
        llm_catalog._ollama_cache = (0.0, [])


# ── MODEL-011 ─────────────────────────────────────────────────────────────────

def test_send_auth_failure_is_structured(client):
    """MODEL-011 [P0 regression]: An auth failure from the provider returns a structured
    502 naming the provider, so the UI can route the user to the Model Manager."""
    bad = MagicMock()
    bad.generate_response.side_effect = RuntimeError("401 Unauthorized: invalid api key")

    chat_id = _create_chat(client)["id"]
    with patch("app.routers.chats.get_llm_service", lambda _mid: bad):
        r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 502
    detail = r.json()["detail"]
    assert detail["type"] == "auth"
    assert detail["provider"] == "google"
    assert detail["model"] == DEFAULT_MODEL_ID


# ── MODEL-012 ─────────────────────────────────────────────────────────────────

def test_stream_auth_failure_emits_error_event(client):
    """MODEL-012 [P1 regression]: A provider failure mid-stream emits an SSE error event
    instead of dying silently; no assistant message is persisted."""
    bad = MagicMock()

    async def _bad_stream(*args, **kwargs):
        raise RuntimeError("401 Unauthorized: invalid api key")
        yield  # pragma: no cover — makes this an async generator

    bad.generate_response_stream = _bad_stream

    chat_id = _create_chat(client)["id"]
    with patch("app.routers.chats.get_llm_service", lambda _mid: bad):
        r = client.post(f"/api/chats/{chat_id}/messages/stream", json={"message": "Hi"})
    assert r.status_code == 200
    assert '"error"' in r.text
    assert '"auth"' in r.text

    msgs = client.get(f"/api/chats/{chat_id}").json()["messages"]
    assert len(msgs) == 1  # only the user message


# ── MODEL-013 ─────────────────────────────────────────────────────────────────

def test_empty_credential_rejected(client):
    """MODEL-013 [P2]: Saving a blank credential is rejected without a validation call."""
    r = client.put("/api/models/providers/anthropic/credential", json={"value": "   "})
    assert r.status_code == 400
