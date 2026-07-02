from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
import io

from pypdf import PdfReader

from ..models.database import get_db
from ..models.schemas import ContextAttachment, UploadedFile, FileFolder, Chat, SourceType
from ..models.pydantic_models import (
    ContextAttachmentCreate, ContextAttachmentResponse, ContextAttachmentUpdate, FileFolderCreate,
)
from ..services.chroma_service import chroma_service
from pathlib import Path

router = APIRouter(prefix="/api/context", tags=["context"])

# Use absolute path for uploads directory
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# --- File folder routes ---

def _file_folder_is_descendant(db, ancestor_id: str, folder_id: str) -> bool:
    node = db.query(FileFolder).filter(FileFolder.id == folder_id).first()
    seen = set()
    while node and node.parent_id:
        if node.parent_id in seen:
            return False
        seen.add(node.parent_id)
        if node.parent_id == ancestor_id:
            return True
        node = db.query(FileFolder).filter(FileFolder.id == node.parent_id).first()
    return False


def _build_file_folder_tree(db, parent_id=None):
    folders = db.query(FileFolder).filter(FileFolder.parent_id == parent_id).order_by(FileFolder.name).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "created_at": f.created_at,
            "files": [
                {
                    "id": file.id,
                    "filename": file.original_filename,
                    "size": file.size,
                    "file_folder_id": file.file_folder_id,
                    "created_at": file.created_at,
                }
                for file in f.files
            ],
            "children": _build_file_folder_tree(db, f.id),
        }
        for f in folders
    ]


@router.get("/file-folders")
def list_file_folders(db: Session = Depends(get_db)):
    """List file folders as a nested tree."""
    return _build_file_folder_tree(db)


@router.post("/file-folders")
def create_file_folder(data: FileFolderCreate, db: Session = Depends(get_db)):
    """Create a new file folder."""
    folder = FileFolder(name=data.name, parent_id=data.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "parent_id": folder.parent_id,
            "created_at": folder.created_at, "files": [], "children": []}


@router.patch("/file-folders/{folder_id}")
def update_file_folder(folder_id: str, data: dict, db: Session = Depends(get_db)):
    """Move a file folder (set parent_id; null = root)."""
    folder = db.query(FileFolder).filter(FileFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="File folder not found")
    if "parent_id" in data:
        new_parent = data["parent_id"]
        if new_parent is not None:
            if new_parent == folder_id:
                raise HTTPException(status_code=400, detail="Cannot move a folder into itself")
            if _file_folder_is_descendant(db, folder_id, new_parent):
                raise HTTPException(status_code=400, detail="Cannot move a folder into its own descendant")
        folder.parent_id = new_parent
    if "name" in data:
        folder.name = data["name"]
    db.commit()
    return {"id": folder.id, "name": folder.name, "parent_id": folder.parent_id}


@router.delete("/file-folders/{folder_id}")
def delete_file_folder(folder_id: str, db: Session = Depends(get_db)):
    """Delete a file folder. Files become unfoldered; child folders move to this folder's parent."""
    folder = db.query(FileFolder).filter(FileFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="File folder not found")
    parent_id = folder.parent_id

    # Bulk updates before delete so ORM cascade doesn't nullify our changes
    db.query(UploadedFile).filter(UploadedFile.file_folder_id == folder_id).update(
        {"file_folder_id": None}, synchronize_session="evaluate"
    )
    db.query(FileFolder).filter(FileFolder.parent_id == folder_id).update(
        {"parent_id": parent_id}, synchronize_session="evaluate"
    )

    db.delete(folder)
    db.commit()
    return {"status": "deleted"}


# --- File routes (must come before /{chat_id} to avoid matching "files" as chat_id) ---

@router.get("/files")
def list_files(db: Session = Depends(get_db)):
    """List all uploaded files."""
    files = db.query(UploadedFile).order_by(UploadedFile.created_at.desc()).all()
    return [
        {
            "id": f.id,
            "filename": f.original_filename,
            "size": f.size,
            "file_folder_id": f.file_folder_id,
            "created_at": f.created_at,
        }
        for f in files
    ]


@router.patch("/files/{file_id}")
def update_file(file_id: str, data: dict, db: Session = Depends(get_db)):
    """Update a file (e.g. move to a folder)."""
    file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    if "file_folder_id" in data:
        folder_id = data["file_folder_id"]
        if folder_id is not None:
            folder = db.query(FileFolder).filter(FileFolder.id == folder_id).first()
            if not folder:
                raise HTTPException(status_code=404, detail="File folder not found")
        file.file_folder_id = folder_id
    db.commit()
    return {"id": file.id, "file_folder_id": file.file_folder_id}


@router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a file for RAG context."""
    # Validate file type
    allowed_types = ["text/plain", "text/markdown", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(allowed_types)}"
        )

    # Generate unique filename
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)

    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Create database record
    uploaded_file = UploadedFile(
        id=file_id,
        filename=filename,
        original_filename=file.filename,
        content_type=file.content_type,
        size=str(len(content))
    )
    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)

    # Process file content for vector store
    text_content = ""
    if file.content_type in ["text/plain", "text/markdown"]:
        text_content = content.decode("utf-8")
    elif file.content_type == "application/pdf":
        try:
            pdf_reader = PdfReader(io.BytesIO(content))
            text_parts = []
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            text_content = "\n\n".join(text_parts)
        except Exception as e:
            text_content = f"[Could not extract PDF content: {str(e)}]"

    # Add to vector store
    if text_content:
        chroma_service.add_message(
            message_id=file_id,
            content=text_content,
            metadata={"type": "file", "filename": file.filename}
        )

    return {
        "id": file_id,
        "filename": file.filename,
        "size": len(content)
    }


@router.delete("/files/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)):
    """Delete an uploaded file."""
    file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete from filesystem
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete from vector store
    chroma_service.delete_message(file_id)

    # Delete from database
    db.delete(file)
    db.commit()

    return {"status": "deleted"}


# --- Attachment routes ---

@router.post("/attach", response_model=ContextAttachmentResponse)
def attach_context(data: ContextAttachmentCreate, db: Session = Depends(get_db)):
    """Attach a chat or file as context to another chat."""
    # Verify the target chat exists
    chat = db.query(Chat).filter(Chat.id == data.chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Target chat not found")

    # Verify source exists
    if data.source_type == SourceType.CHAT:
        source = db.query(Chat).filter(Chat.id == data.source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source chat not found")
    elif data.source_type == SourceType.FILE:
        source = db.query(UploadedFile).filter(UploadedFile.id == data.source_id).first()
        if not source:
            raise HTTPException(status_code=404, detail="Source file not found")

    # Check if already attached
    existing = db.query(ContextAttachment).filter(
        ContextAttachment.chat_id == data.chat_id,
        ContextAttachment.source_type == data.source_type,
        ContextAttachment.source_id == data.source_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Context already attached")

    attachment = ContextAttachment(
        chat_id=data.chat_id,
        source_type=data.source_type,
        source_id=data.source_id
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


@router.delete("/detach/{attachment_id}")
def detach_context(attachment_id: str, db: Session = Depends(get_db)):
    """Remove a context attachment."""
    attachment = db.query(ContextAttachment).filter(
        ContextAttachment.id == attachment_id
    ).first()

    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    db.delete(attachment)
    db.commit()
    return {"status": "detached"}


@router.patch("/attachments/{attachment_id}", response_model=ContextAttachmentResponse)
def update_attachment(
    attachment_id: str,
    data: ContextAttachmentUpdate,
    db: Session = Depends(get_db),
):
    """Update slice bounds on an existing attachment. Pass null to clear a bound."""
    attachment = db.query(ContextAttachment).filter(
        ContextAttachment.id == attachment_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    update_data = data.model_dump(exclude_unset=True)
    if "start_message_id" in update_data:
        attachment.start_message_id = update_data["start_message_id"]
    if "end_message_id" in update_data:
        attachment.end_message_id = update_data["end_message_id"]

    db.commit()
    db.refresh(attachment)
    return attachment


# --- Chat context route (must be last due to {chat_id} parameter) ---

@router.get("/{chat_id}", response_model=List[ContextAttachmentResponse])
def get_context_attachments(chat_id: str, db: Session = Depends(get_db)):
    """Get all context attachments for a chat."""
    attachments = db.query(ContextAttachment).filter(
        ContextAttachment.chat_id == chat_id
    ).all()
    return attachments
