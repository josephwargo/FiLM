"""
CHAT — Chat Interface test suite
Maps to: docs/products/chat_interface_PRD.md

Test IDs: CHAT-001 … CHAT-010
"""
import json


# ── CHAT-001 ──────────────────────────────────────────────────────────────────

def test_create_chat_default_title(client):
    """CHAT-001 [P0 smoke]: Creating a chat with no title succeeds and returns an id."""
    r = client.post("/api/chats", json={})
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["title"]  # some default title exists


# ── CHAT-002 ──────────────────────────────────────────────────────────────────

def test_create_chat_custom_title(client):
    """CHAT-002 [P0 smoke]: Creating a chat with a custom title stores it correctly."""
    r = client.post("/api/chats", json={"title": "My Research"})
    assert r.status_code == 200
    assert r.json()["title"] == "My Research"


# ── CHAT-003 ──────────────────────────────────────────────────────────────────

def test_list_chats(client):
    """CHAT-003 [P0 smoke]: All created chats appear in the list endpoint."""
    client.post("/api/chats", json={"title": "Alpha"})
    client.post("/api/chats", json={"title": "Beta"})
    r = client.get("/api/chats")
    assert r.status_code == 200
    titles = [c["title"] for c in r.json()]
    assert "Alpha" in titles
    assert "Beta" in titles


# ── CHAT-004 ──────────────────────────────────────────────────────────────────

def test_get_chat_includes_messages(client):
    """CHAT-004 [P0 smoke]: Fetching a chat by ID returns the chat with a messages array."""
    chat_id = client.post("/api/chats", json={}).json()["id"]
    r = client.get(f"/api/chats/{chat_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == chat_id
    assert "messages" in body


# ── CHAT-005 ──────────────────────────────────────────────────────────────────

def test_get_nonexistent_chat_returns_404(client):
    """CHAT-005 [P0 regression]: Fetching a chat that doesn't exist returns 404."""
    r = client.get("/api/chats/does-not-exist")
    assert r.status_code == 404


# ── CHAT-006 ──────────────────────────────────────────────────────────────────

def test_rename_chat(client):
    """CHAT-006 [P1]: Patching a chat's title updates it persistently."""
    chat_id = client.post("/api/chats", json={"title": "Old Name"}).json()["id"]
    r = client.patch(f"/api/chats/{chat_id}", json={"title": "New Name"})
    assert r.status_code == 200
    assert client.get(f"/api/chats/{chat_id}").json()["title"] == "New Name"


# ── CHAT-007 ──────────────────────────────────────────────────────────────────

def test_move_chat_to_folder(client):
    """CHAT-007 [P1]: Moving a chat into a folder updates its folder_id."""
    folder = client.post("/api/folders", json={"name": "Work"}).json()
    chat_id = client.post("/api/chats", json={"title": "Notes"}).json()["id"]
    r = client.patch(f"/api/chats/{chat_id}", json={"folder_id": folder["id"]})
    assert r.status_code == 200
    assert r.json()["folder_id"] == folder["id"]


# ── CHAT-008 ──────────────────────────────────────────────────────────────────

def test_delete_chat(client):
    """CHAT-008 [P0 smoke]: Deleting a chat makes it unreachable."""
    chat_id = client.post("/api/chats", json={}).json()["id"]
    assert client.delete(f"/api/chats/{chat_id}").status_code == 200
    assert client.get(f"/api/chats/{chat_id}").status_code == 404


# ── CHAT-009 ──────────────────────────────────────────────────────────────────

def test_send_message_persists_exchange(client):
    """CHAT-009 [P0 smoke]: Sending a message stores both user and assistant turns in history."""
    chat_id = client.post("/api/chats", json={}).json()["id"]
    r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200
    assert "response" in r.json()

    messages = client.get(f"/api/chats/{chat_id}").json()["messages"]
    roles = [m["role"] for m in messages]
    assert "user" in roles
    assert "assistant" in roles
    assert messages[0]["content"] == "Hello"


# ── CHAT-010 ──────────────────────────────────────────────────────────────────

def test_send_message_stream_returns_sse(client):
    """CHAT-010 [P1]: The streaming endpoint returns SSE events including a done event."""
    chat_id = client.post("/api/chats", json={}).json()["id"]
    r = client.post(f"/api/chats/{chat_id}/messages/stream", json={"message": "Hi"})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    body = r.text
    assert "chunk" in body
    assert '"done": true' in body or '"done":true' in body
    # Verify the full mock response assembled correctly
    chunks = [
        json.loads(line[6:])["chunk"]
        for line in body.splitlines()
        if line.startswith("data:") and "chunk" in line
    ]
    assert "".join(chunks) == "Mock AI response"
