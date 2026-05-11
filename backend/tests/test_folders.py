"""
FS — Virtual File System test suite
Maps to: docs/products/file_system_PRD.md

Test IDs: FS-001 … FS-010
"""


# ── FS-001 ────────────────────────────────────────────────────────────────────

def test_create_folder(client):
    """FS-001 [P0 smoke]: Creating a folder returns an object with id and name."""
    r = client.post("/api/folders", json={"name": "Projects"})
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["name"] == "Projects"
    assert data["parent_id"] is None


# ── FS-002 ────────────────────────────────────────────────────────────────────

def test_create_nested_folder(client):
    """FS-002 [P0]: Creating a folder with a parent_id nests it correctly."""
    parent = client.post("/api/folders", json={"name": "Work"}).json()
    child = client.post("/api/folders", json={"name": "Q1", "parent_id": parent["id"]}).json()
    assert child["parent_id"] == parent["id"]


# ── FS-003 ────────────────────────────────────────────────────────────────────

def test_folder_tree_is_recursive(client):
    """FS-003 [P1]: The folder tree endpoint returns children nested under their parent."""
    parent = client.post("/api/folders", json={"name": "Parent"}).json()
    client.post("/api/folders", json={"name": "Child", "parent_id": parent["id"]})
    tree = client.get("/api/folders/tree").json()
    parent_node = next(f for f in tree if f["id"] == parent["id"])
    assert any(c["name"] == "Child" for c in parent_node["children"])


# ── FS-004 ────────────────────────────────────────────────────────────────────

def test_rename_folder(client):
    """FS-004 [P1]: Patching a folder's name updates it."""
    folder_id = client.post("/api/folders", json={"name": "Old"}).json()["id"]
    r = client.patch(f"/api/folders/{folder_id}", json={"name": "New"})
    assert r.status_code == 200
    assert r.json()["name"] == "New"


# ── FS-005 ────────────────────────────────────────────────────────────────────

def test_move_folder_into_another(client):
    """FS-005 [P1]: Moving a folder by setting parent_id nests it under the target."""
    a = client.post("/api/folders", json={"name": "A"}).json()
    b = client.post("/api/folders", json={"name": "B"}).json()
    r = client.patch(f"/api/folders/{b['id']}", json={"parent_id": a["id"]})
    assert r.status_code == 200
    assert r.json()["parent_id"] == a["id"]


# ── FS-006 ────────────────────────────────────────────────────────────────────

def test_move_folder_to_root(client):
    """FS-006 [P1]: Setting parent_id to null moves a folder back to the root."""
    parent = client.post("/api/folders", json={"name": "Parent"}).json()
    child_id = client.post(
        "/api/folders", json={"name": "Child", "parent_id": parent["id"]}
    ).json()["id"]
    r = client.patch(f"/api/folders/{child_id}", json={"parent_id": None})
    assert r.status_code == 200
    assert r.json()["parent_id"] is None


# ── FS-007 ────────────────────────────────────────────────────────────────────

def test_cannot_move_folder_into_itself(client):
    """FS-007 [P0 regression]: Moving a folder into itself is rejected with 400."""
    folder_id = client.post("/api/folders", json={"name": "Solo"}).json()["id"]
    r = client.patch(f"/api/folders/{folder_id}", json={"parent_id": folder_id})
    assert r.status_code == 400


# ── FS-008 ────────────────────────────────────────────────────────────────────

def test_cannot_move_folder_into_descendant(client):
    """FS-008 [P0 regression]: Moving a folder into its own descendant is rejected with 400."""
    grandparent = client.post("/api/folders", json={"name": "GP"}).json()
    child = client.post(
        "/api/folders", json={"name": "Child", "parent_id": grandparent["id"]}
    ).json()
    r = client.patch(f"/api/folders/{grandparent['id']}", json={"parent_id": child["id"]})
    assert r.status_code == 400


# ── FS-009 ────────────────────────────────────────────────────────────────────

def test_delete_folder_promotes_children(client):
    """FS-009 [P1]: Deleting a folder promotes its child folders to the deleted folder's parent."""
    grandparent = client.post("/api/folders", json={"name": "GP"}).json()
    parent = client.post(
        "/api/folders", json={"name": "Parent", "parent_id": grandparent["id"]}
    ).json()
    child = client.post(
        "/api/folders", json={"name": "Child", "parent_id": parent["id"]}
    ).json()

    client.delete(f"/api/folders/{parent['id']}")

    tree = client.get("/api/folders/tree").json()
    gp_node = next(f for f in tree if f["id"] == grandparent["id"])
    child_ids = [c["id"] for c in gp_node["children"]]
    assert child["id"] in child_ids


# ── FS-010 ────────────────────────────────────────────────────────────────────

def test_chat_appears_in_folder_tree(client):
    """FS-010 [P1]: A chat assigned to a folder appears in that folder's tree node."""
    folder = client.post("/api/folders", json={"name": "Work"}).json()
    client.post("/api/chats", json={"title": "Sprint Notes", "folder_id": folder["id"]})
    tree = client.get("/api/folders/tree").json()
    folder_node = next(f for f in tree if f["id"] == folder["id"])
    chat_titles = [c["title"] for c in folder_node["chats"]]
    assert "Sprint Notes" in chat_titles
