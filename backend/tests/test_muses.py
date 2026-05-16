"""
MUSE — Muses feature test suite
Maps to: docs/products/muses_PRD.md

Test IDs: MUSE-001 … MUSE-018
"""
from unittest.mock import patch, MagicMock


# ── helpers ───────────────────────────────────────────────────────────────────

def _create_muse(client, name="PM Mode", system_prompt="You are a PM."):
    return client.post(
        "/api/muses",
        json={"name": name, "system_prompt": system_prompt},
    ).json()


def _create_chat(client, title="Test Chat"):
    return client.post("/api/chats", json={"title": title}).json()


def _upload_file(client, filename="notes.txt", content=b"hello"):
    return client.post(
        "/api/context/files/upload",
        files={"file": (filename, content, "text/plain")},
    ).json()


# ── MUSE-001 ──────────────────────────────────────────────────────────────────

def test_create_muse(client):
    """MUSE-001 [P0 smoke]: Creating a Muse returns id, name, and system_prompt."""
    r = client.post(
        "/api/muses",
        json={"name": "PM Mode", "description": "Product manager", "system_prompt": "You are a PM."},
    )
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["name"] == "PM Mode"
    assert data["description"] == "Product manager"
    assert data["system_prompt"] == "You are a PM."


# ── MUSE-002 ──────────────────────────────────────────────────────────────────

def test_create_muse_without_description(client):
    """MUSE-002 [P1]: Creating a Muse without a description is accepted; description is null."""
    r = client.post("/api/muses", json={"name": "Minimal", "system_prompt": "Be concise."})
    assert r.status_code == 200
    assert r.json()["description"] is None


# ── MUSE-003 ──────────────────────────────────────────────────────────────────

def test_list_muses(client):
    """MUSE-003 [P0 smoke]: Listing Muses returns all created Muses."""
    _create_muse(client, name="Alpha", system_prompt="A")
    _create_muse(client, name="Beta", system_prompt="B")
    r = client.get("/api/muses")
    assert r.status_code == 200
    names = [m["name"] for m in r.json()]
    assert "Alpha" in names
    assert "Beta" in names


# ── MUSE-004 ──────────────────────────────────────────────────────────────────

def test_get_muse(client):
    """MUSE-004 [P0 smoke]: GET /api/muses/:id returns the correct Muse."""
    muse_id = _create_muse(client)["id"]
    r = client.get(f"/api/muses/{muse_id}")
    assert r.status_code == 200
    assert r.json()["id"] == muse_id


# ── MUSE-005 ──────────────────────────────────────────────────────────────────

def test_get_nonexistent_muse(client):
    """MUSE-005 [P0 regression]: GET /api/muses/bad-id returns 404."""
    r = client.get("/api/muses/does-not-exist")
    assert r.status_code == 404


# ── MUSE-006 ──────────────────────────────────────────────────────────────────

def test_update_muse(client):
    """MUSE-006 [P1]: Updating a Muse's name and system_prompt is reflected on subsequent GET."""
    muse_id = _create_muse(client)["id"]
    r = client.patch(
        f"/api/muses/{muse_id}",
        json={"name": "Updated Name", "system_prompt": "New instructions."},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Updated Name"
    assert data["system_prompt"] == "New instructions."


# ── MUSE-007 ──────────────────────────────────────────────────────────────────

def test_delete_muse(client):
    """MUSE-007 [P1]: Deleting a Muse removes it from the list."""
    muse_id = _create_muse(client)["id"]
    assert client.delete(f"/api/muses/{muse_id}").status_code == 200
    names = [m["name"] for m in client.get("/api/muses").json()]
    assert "PM Mode" not in names


# ── MUSE-008 ──────────────────────────────────────────────────────────────────

def test_delete_muse_unassigns_chats(client):
    """MUSE-008 [P0 regression]: Deleting a Muse clears muse_id from all chats that used it."""
    muse_id = _create_muse(client)["id"]
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})
    client.delete(f"/api/muses/{muse_id}")
    chat = client.get(f"/api/chats/{chat_id}").json()
    assert chat["muse_id"] is None


# ── MUSE-009 ──────────────────────────────────────────────────────────────────

def test_assign_muse_to_chat(client):
    """MUSE-009 [P0 smoke]: Assigning a Muse to a chat persists muse_id on the chat."""
    muse_id = _create_muse(client)["id"]
    chat_id = _create_chat(client)["id"]
    r = client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})
    assert r.status_code == 200
    assert r.json()["muse_id"] == muse_id


# ── MUSE-010 ──────────────────────────────────────────────────────────────────

def test_clear_muse_from_chat(client):
    """MUSE-010 [P1]: Setting muse_id to empty string clears the Muse assignment."""
    muse_id = _create_muse(client)["id"]
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})
    r = client.patch(f"/api/chats/{chat_id}", json={"muse_id": ""})
    assert r.status_code == 200
    assert r.json()["muse_id"] is None


# ── MUSE-011 ──────────────────────────────────────────────────────────────────

def test_system_prompt_injected_on_send(client):
    """MUSE-011 [P0 smoke]: When a chat has an active Muse, its system_prompt is passed to the LLM."""
    captured = {}

    def fake_generate(message, history, context=None, system_prompt=None):
        captured["system_prompt"] = system_prompt
        return "Mock response"

    mock_gemini = MagicMock()
    mock_gemini.generate_response.side_effect = fake_generate

    muse_id = _create_muse(client, system_prompt="You are a pirate.")["id"]
    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})

    with patch("app.routers.chats.gemini_service", mock_gemini):
        client.post(f"/api/chats/{chat_id}/messages", json={"message": "Ahoy!"})

    assert captured.get("system_prompt") == "You are a pirate."


# ── MUSE-012 ──────────────────────────────────────────────────────────────────

def test_no_system_prompt_without_muse(client):
    """MUSE-012 [P1 regression]: A chat without a Muse passes system_prompt=None to the LLM."""
    captured = {}

    def fake_generate(message, history, context=None, system_prompt=None):
        captured["system_prompt"] = system_prompt
        return "Mock response"

    mock_gemini = MagicMock()
    mock_gemini.generate_response.side_effect = fake_generate

    chat_id = _create_chat(client)["id"]

    with patch("app.routers.chats.gemini_service", mock_gemini):
        client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})

    assert captured.get("system_prompt") is None


# ── MUSE-013 ──────────────────────────────────────────────────────────────────

def test_pin_chat_as_muse_context(client):
    """MUSE-013 [P0 smoke]: Pinning a chat to a Muse is reflected in GET /api/muses/:id/context."""
    muse_id = _create_muse(client)["id"]
    source_chat_id = _create_chat(client, title="Source Chat")["id"]
    r = client.post(
        f"/api/muses/{muse_id}/context",
        json={"source_type": "chat", "source_id": source_chat_id},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["source_type"] == "chat"
    assert data["source_id"] == source_chat_id

    ctx_list = client.get(f"/api/muses/{muse_id}/context").json()
    assert any(c["source_id"] == source_chat_id for c in ctx_list)


# ── MUSE-014 ──────────────────────────────────────────────────────────────────

def test_pin_file_as_muse_context(client):
    """MUSE-014 [P0 smoke]: Pinning an uploaded file to a Muse is reflected in context list."""
    muse_id = _create_muse(client)["id"]
    file_id = _upload_file(client)["id"]
    r = client.post(
        f"/api/muses/{muse_id}/context",
        json={"source_type": "file", "source_id": file_id},
    )
    assert r.status_code == 200
    ctx_list = client.get(f"/api/muses/{muse_id}/context").json()
    assert any(c["source_id"] == file_id for c in ctx_list)


# ── MUSE-015 ──────────────────────────────────────────────────────────────────

def test_pin_context_is_idempotent(client):
    """MUSE-015 [P1 regression]: Pinning the same source twice returns the existing record (no duplicate)."""
    muse_id = _create_muse(client)["id"]
    source_chat_id = _create_chat(client)["id"]
    payload = {"source_type": "chat", "source_id": source_chat_id}
    first = client.post(f"/api/muses/{muse_id}/context", json=payload).json()
    second = client.post(f"/api/muses/{muse_id}/context", json=payload).json()
    assert first["id"] == second["id"]
    assert len(client.get(f"/api/muses/{muse_id}/context").json()) == 1


# ── MUSE-016 ──────────────────────────────────────────────────────────────────

def test_unpin_muse_context(client):
    """MUSE-016 [P1]: Unpinning a context item removes it from the Muse's context list."""
    muse_id = _create_muse(client)["id"]
    file_id = _upload_file(client)["id"]
    ctx_id = client.post(
        f"/api/muses/{muse_id}/context",
        json={"source_type": "file", "source_id": file_id},
    ).json()["id"]

    assert client.delete(f"/api/muses/{muse_id}/context/{ctx_id}").status_code == 200
    ctx_list = client.get(f"/api/muses/{muse_id}/context").json()
    assert all(c["id"] != ctx_id for c in ctx_list)


# ── MUSE-017 ──────────────────────────────────────────────────────────────────

def test_pin_context_to_nonexistent_muse(client):
    """MUSE-017 [P0 regression]: Pinning context to a nonexistent Muse returns 404."""
    source_chat_id = _create_chat(client)["id"]
    r = client.post(
        "/api/muses/no-such-muse/context",
        json={"source_type": "chat", "source_id": source_chat_id},
    )
    assert r.status_code == 404


# ── MUSE-018 ──────────────────────────────────────────────────────────────────

def test_muse_pinned_context_prepended_to_llm_call(client):
    """MUSE-018 [P0 smoke]: Muse pinned file context is included in the LLM context before per-chat context."""
    captured = {}

    def fake_generate(message, history, context=None, system_prompt=None):
        captured["context"] = context
        return "Mock response"

    mock_gemini = MagicMock()
    mock_gemini.generate_response.side_effect = fake_generate

    muse_id = _create_muse(client)["id"]
    file_id = _upload_file(client, filename="pinned.txt")["id"]
    client.post(
        f"/api/muses/{muse_id}/context",
        json={"source_type": "file", "source_id": file_id},
    )

    chat_id = _create_chat(client)["id"]
    client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})

    with patch("app.routers.chats.gemini_service", mock_gemini):
        client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})

    assert captured.get("context") is not None
    assert "pinned.txt" in captured["context"]
