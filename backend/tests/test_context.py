"""
CTX — RAG / Context System test suite
Maps to: docs/products/rag_context_PRD.md

Test IDs: CTX-001 … CTX-019
"""
from unittest.mock import patch, MagicMock
import io


# ── CTX-001 ───────────────────────────────────────────────────────────────────

def test_upload_txt_file(client):
    """CTX-001 [P0 smoke]: Uploading a plain-text file returns an id and filename."""
    r = client.post(
        "/api/context/files/upload",
        files={"file": ("notes.txt", b"Hello world", "text/plain")},
    )
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["filename"] == "notes.txt"


# ── CTX-002 ───────────────────────────────────────────────────────────────────

def test_upload_markdown_file(client):
    """CTX-002 [P1]: Uploading a Markdown file is accepted."""
    r = client.post(
        "/api/context/files/upload",
        files={"file": ("README.md", b"# Title\nContent", "text/markdown")},
    )
    assert r.status_code == 200
    assert "id" in r.json()


# ── CTX-003 ───────────────────────────────────────────────────────────────────

def test_upload_unsupported_type_rejected(client):
    """CTX-003 [P0 regression]: Uploading an unsupported MIME type returns 400."""
    r = client.post(
        "/api/context/files/upload",
        files={"file": ("script.js", b"console.log('hi')", "application/javascript")},
    )
    assert r.status_code == 400


# ── CTX-004 ───────────────────────────────────────────────────────────────────

def test_list_files(client):
    """CTX-004 [P0 smoke]: Uploaded files appear in the file list."""
    client.post(
        "/api/context/files/upload",
        files={"file": ("a.txt", b"A", "text/plain")},
    )
    client.post(
        "/api/context/files/upload",
        files={"file": ("b.txt", b"B", "text/plain")},
    )
    r = client.get("/api/context/files")
    assert r.status_code == 200
    filenames = [f["filename"] for f in r.json()]
    assert "a.txt" in filenames
    assert "b.txt" in filenames


# ── CTX-005 ───────────────────────────────────────────────────────────────────

def test_delete_file(client):
    """CTX-005 [P1]: Deleting a file removes it from the file list."""
    file_id = client.post(
        "/api/context/files/upload",
        files={"file": ("del.txt", b"bye", "text/plain")},
    ).json()["id"]
    assert client.delete(f"/api/context/files/{file_id}").status_code == 200
    filenames = [f["filename"] for f in client.get("/api/context/files").json()]
    assert "del.txt" not in filenames


# ── CTX-006 ───────────────────────────────────────────────────────────────────

def test_attach_chat_as_context(client):
    """CTX-006 [P0 smoke]: A chat can be attached as context to another chat."""
    source = client.post("/api/chats", json={"title": "Source"}).json()
    target = client.post("/api/chats", json={"title": "Target"}).json()
    r = client.post(
        "/api/context/attach",
        json={"chat_id": target["id"], "source_type": "chat", "source_id": source["id"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["source_id"] == source["id"]
    assert data["chat_id"] == target["id"]


# ── CTX-007 ───────────────────────────────────────────────────────────────────

def test_attach_file_as_context(client):
    """CTX-007 [P0 smoke]: An uploaded file can be attached as context to a chat."""
    file_id = client.post(
        "/api/context/files/upload",
        files={"file": ("ctx.txt", b"context content", "text/plain")},
    ).json()["id"]
    chat_id = client.post("/api/chats", json={}).json()["id"]
    r = client.post(
        "/api/context/attach",
        json={"chat_id": chat_id, "source_type": "file", "source_id": file_id},
    )
    assert r.status_code == 200


# ── CTX-008 ───────────────────────────────────────────────────────────────────

def test_duplicate_attachment_rejected(client):
    """CTX-008 [P0 regression]: Attaching the same source twice returns 400."""
    source = client.post("/api/chats", json={"title": "Src"}).json()
    target_id = client.post("/api/chats", json={}).json()["id"]
    payload = {"chat_id": target_id, "source_type": "chat", "source_id": source["id"]}
    assert client.post("/api/context/attach", json=payload).status_code == 200
    assert client.post("/api/context/attach", json=payload).status_code == 400


# ── CTX-009 ───────────────────────────────────────────────────────────────────

def test_detach_context(client):
    """CTX-009 [P1]: Detaching a context attachment removes it from the chat's attachment list."""
    source = client.post("/api/chats", json={"title": "Src"}).json()
    target_id = client.post("/api/chats", json={}).json()["id"]
    attachment_id = client.post(
        "/api/context/attach",
        json={"chat_id": target_id, "source_type": "chat", "source_id": source["id"]},
    ).json()["id"]
    assert client.delete(f"/api/context/detach/{attachment_id}").status_code == 200
    attachments = client.get(f"/api/context/{target_id}").json()
    assert all(a["id"] != attachment_id for a in attachments)


# ── CTX-010 ───────────────────────────────────────────────────────────────────

def test_list_attachments_for_chat(client):
    """CTX-010 [P1]: The attachments endpoint returns all context items for a specific chat."""
    source = client.post("/api/chats", json={"title": "Src"}).json()
    target_id = client.post("/api/chats", json={}).json()["id"]
    client.post(
        "/api/context/attach",
        json={"chat_id": target_id, "source_type": "chat", "source_id": source["id"]},
    )
    r = client.get(f"/api/context/{target_id}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["source_id"] == source["id"]


# ── CTX-011 ───────────────────────────────────────────────────────────────────

def test_create_file_folder(client):
    """CTX-011 [P0 smoke]: Creating a file folder returns an object with id and name."""
    r = client.post("/api/context/file-folders", json={"name": "Research"})
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["name"] == "Research"
    assert data["parent_id"] is None


# ── CTX-012 ───────────────────────────────────────────────────────────────────

def test_nest_file_folder(client):
    """CTX-012 [P1]: A file folder can be moved inside another file folder."""
    parent = client.post("/api/context/file-folders", json={"name": "Docs"}).json()
    child = client.post("/api/context/file-folders", json={"name": "Reports"}).json()
    r = client.patch(
        f"/api/context/file-folders/{child['id']}", json={"parent_id": parent["id"]}
    )
    assert r.status_code == 200
    assert r.json()["parent_id"] == parent["id"]


# ── CTX-013 ───────────────────────────────────────────────────────────────────

def test_file_folder_cycle_rejected(client):
    """CTX-013 [P0 regression]: Moving a file folder into its own descendant returns 400."""
    a = client.post("/api/context/file-folders", json={"name": "A"}).json()
    b = client.post(
        "/api/context/file-folders", json={"name": "B", "parent_id": a["id"]}
    ).json()
    r = client.patch(f"/api/context/file-folders/{a['id']}", json={"parent_id": b["id"]})
    assert r.status_code == 400


# ── CTX-014 ───────────────────────────────────────────────────────────────────

def test_move_file_to_folder(client):
    """CTX-014 [P1]: Moving a file into a file folder updates its file_folder_id."""
    folder_id = client.post(
        "/api/context/file-folders", json={"name": "Sorted"}
    ).json()["id"]
    file_id = client.post(
        "/api/context/files/upload",
        files={"file": ("doc.txt", b"content", "text/plain")},
    ).json()["id"]
    r = client.patch(f"/api/context/files/{file_id}", json={"file_folder_id": folder_id})
    assert r.status_code == 200
    assert r.json()["file_folder_id"] == folder_id


# ── CTX-015 ───────────────────────────────────────────────────────────────────

def test_delete_file_folder_promotes_children(client):
    """CTX-015 [P1]: Deleting a file folder promotes its child folders to the grandparent."""
    grandparent = client.post("/api/context/file-folders", json={"name": "GP"}).json()
    parent = client.post(
        "/api/context/file-folders",
        json={"name": "Parent", "parent_id": grandparent["id"]},
    ).json()
    child = client.post(
        "/api/context/file-folders",
        json={"name": "Child", "parent_id": parent["id"]},
    ).json()

    client.delete(f"/api/context/file-folders/{parent['id']}")

    tree = client.get("/api/context/file-folders").json()

    def find(nodes, target_id):
        for n in nodes:
            if n["id"] == target_id:
                return n
            found = find(n.get("children", []), target_id)
            if found:
                return found
        return None

    gp_node = find(tree, grandparent["id"])
    assert gp_node is not None
    child_ids = [c["id"] for c in gp_node["children"]]
    assert child["id"] in child_ids


# ── CTX-016 ───────────────────────────────────────────────────────────────────

def test_recursive_chat_context_pulls_sub_attachments(client):
    """CTX-016 [P0 smoke]: Attaching a chat also pulls in that chat's own file attachments."""
    captured = {}

    def fake_generate(message, history, context=None, system_prompt=None):
        captured["context"] = context
        return "Mock response"

    mock_gemini = MagicMock()
    mock_gemini.generate_response.side_effect = fake_generate

    # Chat B has a file attached
    file_id = client.post(
        "/api/context/files/upload",
        files={"file": ("deep.txt", b"deep content", "text/plain")},
    ).json()["id"]
    chat_b_id = client.post("/api/chats", json={"title": "Chat B"}).json()["id"]
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_b_id, "source_type": "file", "source_id": file_id},
    )

    # Chat A attaches Chat B
    chat_a_id = client.post("/api/chats", json={"title": "Chat A"}).json()["id"]
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_a_id, "source_type": "chat", "source_id": chat_b_id},
    )

    with patch("app.routers.chats.gemini_service", mock_gemini):
        client.post(f"/api/chats/{chat_a_id}/messages", json={"message": "Hello"})

    # The file attached to Chat B should appear in Chat A's resolved context
    assert captured.get("context") is not None
    assert "deep.txt" in captured["context"]


# ── CTX-017 ───────────────────────────────────────────────────────────────────

def test_circular_context_reference_does_not_loop(client):
    """CTX-017 [P0 regression]: A circular chat attachment (A→B→A) does not cause infinite recursion."""
    chat_a_id = client.post("/api/chats", json={"title": "Chat A"}).json()["id"]
    chat_b_id = client.post("/api/chats", json={"title": "Chat B"}).json()["id"]
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_a_id, "source_type": "chat", "source_id": chat_b_id},
    )
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_b_id, "source_type": "chat", "source_id": chat_a_id},
    )
    # Sending a message must complete without hanging or raising an exception
    r = client.post(f"/api/chats/{chat_a_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200


# ── CTX-018 ───────────────────────────────────────────────────────────────────

def test_current_chat_excluded_from_own_context(client):
    """CTX-018 [P0 regression]: A chat cannot inject its own transcript as context (no self-reference)."""
    chat_id = client.post("/api/chats", json={"title": "Self Chat"}).json()["id"]
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_id, "source_type": "chat", "source_id": chat_id},
    )
    r = client.post(f"/api/chats/{chat_id}/messages", json={"message": "Hello"})
    assert r.status_code == 200


# ── CTX-019 ───────────────────────────────────────────────────────────────────

def test_shared_chat_not_duplicated_across_muse_and_per_chat(client):
    """CTX-019 [P1 regression]: A chat pinned to both a Muse and the per-chat context appears only once."""
    captured = {}

    def fake_generate(message, history, context=None, system_prompt=None):
        captured["context"] = context
        return "Mock response"

    mock_gemini = MagicMock()
    mock_gemini.generate_response.side_effect = fake_generate

    # Shared source chat
    source_id = client.post("/api/chats", json={"title": "Shared Source"}).json()["id"]
    # Give it a message so it produces a transcript
    client.post(f"/api/chats/{source_id}/messages", json={"message": "Source content"})

    # Create and configure muse with source pinned
    muse_id = client.post(
        "/api/muses",
        json={"name": "Test Muse", "system_prompt": "Be helpful."},
    ).json()["id"]
    client.post(
        f"/api/muses/{muse_id}/context",
        json={"source_type": "chat", "source_id": source_id},
    )

    # Create target chat with the muse AND the same source chat attached
    chat_id = client.post("/api/chats", json={"title": "Target"}).json()["id"]
    client.patch(f"/api/chats/{chat_id}", json={"muse_id": muse_id})
    client.post(
        "/api/context/attach",
        json={"chat_id": chat_id, "source_type": "chat", "source_id": source_id},
    )

    with patch("app.routers.chats.gemini_service", mock_gemini):
        client.post(f"/api/chats/{chat_id}/messages", json={"message": "Go"})

    ctx = captured.get("context") or ""
    # "Shared Source" header should appear exactly once
    assert ctx.count("Shared Source") == 1
