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


@router.patch("/{folder_id}", response_model=FolderResponse)
def update_folder(folder_id: str, folder_data: FolderUpdate, db: Session = Depends(get_db)):
    """Update a folder (rename, move)."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if folder_data.name is not None:
        folder.name = folder_data.name
    if folder_data.parent_id is not None:
        # Prevent moving folder into itself or its descendants
        if folder_data.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Cannot move folder into itself")
        folder.parent_id = folder_data.parent_id

    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}")
def delete_folder(folder_id: str, db: Session = Depends(get_db)):
    """Delete a folder. Chats in the folder will be moved to root."""
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Move chats to root
    for chat in folder.chats:
        chat.folder_id = None

    # Move child folders to parent
    for child in folder.children:
        child.parent_id = folder.parent_id

    db.delete(folder)
    db.commit()
    return {"status": "deleted"}
