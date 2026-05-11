from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..models.database import get_db
from ..models.schemas import Folder
from ..models.pydantic_models import FolderCreate, FolderUpdate, FolderResponse

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("", response_model=List[FolderResponse])
def list_folders(parent_id: str = None, db: Session = Depends(get_db)):
    """List folders, optionally filtered by parent."""
    query = db.query(Folder)
    if parent_id:
        query = query.filter(Folder.parent_id == parent_id)
    else:
        query = query.filter(Folder.parent_id.is_(None))

    return query.order_by(Folder.name).all()


@router.get("/tree")
def get_folder_tree(db: Session = Depends(get_db)):
    """Get the complete folder tree structure."""
    def build_tree(parent_id=None):
        folders = db.query(Folder).filter(Folder.parent_id == parent_id).order_by(Folder.name).all()
        result = []
        for folder in folders:
            result.append({
                "id": folder.id,
                "name": folder.name,
                "parent_id": folder.parent_id,
                "children": build_tree(folder.id),
                "chats": [{"id": c.id, "title": c.title} for c in folder.chats]
            })
        return result

    return build_tree()


@router.post("", response_model=FolderResponse)
def create_folder(folder_data: FolderCreate, db: Session = Depends(get_db)):
    """Create a new folder."""
    # Verify parent exists if specified
    if folder_data.parent_id:
        parent = db.query(Folder).filter(Folder.id == folder_data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    folder = Folder(
        name=folder_data.name,
        parent_id=folder_data.parent_id
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get("/{folder_id}", response_model=FolderResponse)
def get_folder(folder_id: str, db: Session = Depends(get_db)):
    """Get a specific folder."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


def _is_descendant(db, model, ancestor_id: str, folder_id: str) -> bool:
    """Return True if ancestor_id is an ancestor of folder_id (cycle detection)."""
    node = db.query(model).filter(model.id == folder_id).first()
    seen = set()
    while node and node.parent_id:
        if node.parent_id in seen:
            return False  # already broken cycle
        seen.add(node.parent_id)
        if node.parent_id == ancestor_id:
            return True
        node = db.query(model).filter(model.id == node.parent_id).first()
    return False


@router.patch("/{folder_id}", response_model=FolderResponse)
def update_folder(folder_id: str, folder_data: FolderUpdate, db: Session = Depends(get_db)):
    """Update a folder (rename, move). Send parent_id: null to move to root."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if folder_data.name is not None:
        folder.name = folder_data.name

    if "parent_id" in folder_data.model_fields_set:
        new_parent = folder_data.parent_id
        if new_parent is not None:
            if new_parent == folder_id:
                raise HTTPException(status_code=400, detail="Cannot move a folder into itself")
            if _is_descendant(db, Folder, folder_id, new_parent):
                raise HTTPException(status_code=400, detail="Cannot move a folder into its own descendant")
        folder.parent_id = new_parent

    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}")
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    """Delete a folder. Chats in the folder will be moved to root."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    parent_id = folder.parent_id

    # Bulk updates before delete so ORM cascade doesn't nullify our changes
    from ..models.schemas import Chat as ChatModel
    db.query(ChatModel).filter(ChatModel.folder_id == folder_id).update(
        {"folder_id": None}, synchronize_session="evaluate"
    )
    db.query(Folder).filter(Folder.parent_id == folder_id).update(
        {"parent_id": parent_id}, synchronize_session="evaluate"
    )

    db.delete(folder)
    db.commit()
    return {"status": "deleted"}
