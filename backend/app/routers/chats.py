from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Set, Tuple
import json

from ..models.database import get_db
from ..models.schemas import Chat, Message, MessageRole, ContextAttachment, UploadedFile, SourceType, Muse, MuseContext
from ..models.pydantic_models import (
    ChatCreate, ChatUpdate, ChatResponse, ChatListResponse,
    MessageCreate, MessageResponse, ChatMessageRequest
)
from ..services.gemini_service import gemini_service
from ..services.chroma_service import chroma_service
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BACKEND_DIR / "uploads"

router = APIRouter(prefix="/api/chats", tags=["chats"])

MAX_CONTEXT_DEPTH = 3


def _build_context_parts(
    db: Session,
    pairs: List[Tuple],
    visited: Set[str],
    depth: int = 0,
) -> List[str]:
    """
    Recursively resolve context from (source_type, source_id) pairs.
    visited tracks chat IDs already included to break cycles.
    Recurses into a chat's own attachments up to MAX_CONTEXT_DEPTH.
    Files are never recursed into (they have no attachments).
    """
    parts = []
    for source_type, source_id in pairs:
        try:
            if source_type == SourceType.CHAT:
                if source_id in visited:
                    continue
                source_chat = db.query(Chat).filter(Chat.id == source_id).first()
                if not source_chat:
                    continue
                visited.add(source_id)

                if source_chat.messages:
                    transcript = f"--- Context from chat: {source_chat.title} ---\n"
                    for msg in source_chat.messages:
                        transcript += f"{msg.role.value}: {msg.content}\n"
                    parts.append(transcript)

                if depth < MAX_CONTEXT_DEPTH:
                    sub_attachments = db.query(ContextAttachment).filter(
                        ContextAttachment.chat_id == source_id
                    ).all()
                    sub_pairs = [(a.source_type, a.source_id) for a in sub_attachments]
                    parts.extend(_build_context_parts(db, sub_pairs, visited, depth + 1))

            elif source_type == SourceType.FILE:
                file_record = db.query(UploadedFile).filter(UploadedFile.id == source_id).first()
                if file_record:
                    file_ctx = chroma_service.get_document_by_id(source_id)
                    if file_ctx:
                        parts.append(f"--- Context from file: {file_record.original_filename} ---\n{file_ctx}")
                    else:
                        parts.append(f"--- Context from file: {file_record.original_filename} ---\n[File content not available - please re-upload]")
        except Exception as e:
            print(f"Error loading context ({source_type}, {source_id}): {e}")
            continue
    return parts


def _resolve_context(db: Session, chat: Chat) -> Tuple[List[str], str | None]:
    """
    Build the full ordered context for a chat send:
      1. Muse pinned context (prepended)
      2. Per-chat attached context
    Returns (context_parts, system_prompt).
    The visited set is shared so the same chat is never injected twice.
    """
    visited: Set[str] = {chat.id}  # prevent the current chat from appearing in its own context
    context_parts: List[str] = []
    system_prompt = None

    if chat.muse_id:
        muse = db.query(Muse).filter(Muse.id == chat.muse_id).first()
        if muse:
            system_prompt = muse.system_prompt
            muse_ctxs = db.query(MuseContext).filter(MuseContext.muse_id == chat.muse_id).all()
            muse_pairs = [(mc.source_type, mc.source_id) for mc in muse_ctxs]
            context_parts.extend(_build_context_parts(db, muse_pairs, visited))

    attachments = db.query(ContextAttachment).filter(ContextAttachment.chat_id == chat.id).all()
    chat_pairs = [(a.source_type, a.source_id) for a in attachments]
    context_parts.extend(_build_context_parts(db, chat_pairs, visited))

    return context_parts, system_prompt


@router.get("", response_model=List[ChatListResponse])
def list_chats(folder_id: str = None, db: Session = Depends(get_db)):
    query = db.query(Chat)
    if folder_id:
        query = query.filter(Chat.folder_id == folder_id)

    chats = query.order_by(Chat.updated_at.desc()).all()
    return [
        ChatListResponse(
            id=chat.id,
            title=chat.title,
            folder_id=chat.folder_id,
            muse_id=chat.muse_id,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            message_count=len(chat.messages),
        )
        for chat in chats
    ]


@router.post("", response_model=ChatResponse)
def create_chat(chat_data: ChatCreate, db: Session = Depends(get_db)):
    chat = Chat(title=chat_data.title, folder_id=chat_data.folder_id)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(chat_id: str, chat_data: ChatUpdate, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if chat_data.title is not None:
        chat.title = chat_data.title
    if chat_data.folder_id is not None:
        chat.folder_id = chat_data.folder_id
    if chat_data.muse_id is not None:
        chat.muse_id = chat_data.muse_id if chat_data.muse_id != "" else None

    db.commit()
    db.refresh(chat)
    return chat


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chroma_service.delete_chat_messages(chat_id)
    db.delete(chat)
    db.commit()
    return {"status": "deleted"}


@router.post("/{chat_id}/messages")
async def send_message(chat_id: str, request: ChatMessageRequest, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    user_message = Message(chat_id=chat_id, role=MessageRole.USER, content=request.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    chroma_service.add_message(
        message_id=user_message.id,
        content=request.message,
        metadata={"chat_id": chat_id, "role": "user"},
    )

    history = [{"role": msg.role.value, "content": msg.content} for msg in chat.messages[:-1]]
    context_parts, system_prompt = _resolve_context(db, chat)
    context = "\n\n".join(context_parts) if context_parts else None

    response_text = gemini_service.generate_response(
        message=request.message,
        history=history,
        context=context,
        system_prompt=system_prompt,
    )

    assistant_message = Message(chat_id=chat_id, role=MessageRole.ASSISTANT, content=response_text)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    chroma_service.add_message(
        message_id=assistant_message.id,
        content=response_text,
        metadata={"chat_id": chat_id, "role": "assistant"},
    )

    if len(chat.messages) <= 2 and chat.title == "New Chat":
        chat.title = request.message[:50] + ("..." if len(request.message) > 50 else "")
        db.commit()

    return {
        "response": response_text,
        "message_id": assistant_message.id,
        "user_message_id": user_message.id,
    }


@router.post("/{chat_id}/messages/stream")
async def send_message_stream(chat_id: str, request: ChatMessageRequest, db: Session = Depends(get_db)):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    user_message = Message(chat_id=chat_id, role=MessageRole.USER, content=request.message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    chroma_service.add_message(
        message_id=user_message.id,
        content=request.message,
        metadata={"chat_id": chat_id, "role": "user"},
    )

    history = [{"role": msg.role.value, "content": msg.content} for msg in chat.messages[:-1]]
    context_parts, system_prompt = _resolve_context(db, chat)
    context = "\n\n".join(context_parts) if context_parts else None

    is_first_message = len(chat.messages) <= 2 and chat.title == "New Chat"
    new_title = request.message[:50] + ("..." if len(request.message) > 50 else "") if is_first_message else None
    if new_title:
        chat.title = new_title
        db.commit()

    async def generate():
        full_response = ""
        async for chunk in gemini_service.generate_response_stream(
            message=request.message,
            history=history,
            context=context,
            system_prompt=system_prompt,
        ):
            full_response += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        assistant_message = Message(chat_id=chat_id, role=MessageRole.ASSISTANT, content=full_response)
        db.add(assistant_message)
        db.commit()

        chroma_service.add_message(
            message_id=assistant_message.id,
            content=full_response,
            metadata={"chat_id": chat_id, "role": "assistant"},
        )

        yield f"data: {json.dumps({'done': True, 'message_id': assistant_message.id, 'title': new_title})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
