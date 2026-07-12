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
from ..services.llm import get_llm_service, get_model_provider, resolve_model_id
from ..services.chroma_service import chroma_service

router = APIRouter(prefix="/api/chats", tags=["chats"])

MAX_CONTEXT_DEPTH = 3

_AUTH_ERROR_HINTS = ("api key", "api_key", "unauthorized", "authentication", "permission denied", "invalid x-api-key")


def _classify_send_error(e: Exception, model_id: str) -> dict:
    """Structured error for a failed LLM call so the UI can route the user to the Model Manager."""
    status = getattr(e, "status_code", None)
    text = str(e).lower()
    is_auth = status in (401, 403) or any(hint in text for hint in _AUTH_ERROR_HINTS)
    return {
        "type": "auth" if is_auth else "provider",
        "provider": get_model_provider(model_id),
        "model": model_id,
        "message": str(e),
    }


def _format_context_part(part: dict) -> str:
    """Render one structured context part into the string injected into the LLM call."""
    if part["type"] == "chat":
        slice_note = " (sliced)" if part["sliced"] else ""
        return f"--- Context from chat: {part['label']}{slice_note} ---\n{part['content']}"
    return f"--- Context from file: {part['label']} ---\n{part['content']}"


def _build_context_parts(
    db: Session,
    refs: List[Tuple],
    visited: Set[str],
    depth: int = 0,
) -> List[dict]:
    """
    Recursively resolve context from (source_type, source_id, start_message_id, end_message_id) refs
    into structured parts: {type, label, sliced, content}.
    start_message_id / end_message_id are only meaningful for CHAT sources; if either is missing
    from the chat (e.g. the message was deleted), that side falls back to the chat's natural bound.
    visited tracks chat IDs already included to break cycles.
    Recurses into a chat's own attachments up to MAX_CONTEXT_DEPTH.
    Files are never recursed into (they have no attachments).
    """
    parts = []
    for source_type, source_id, start_id, end_id in refs:
        try:
            if source_type == SourceType.CHAT:
                if source_id in visited:
                    continue
                source_chat = db.query(Chat).filter(Chat.id == source_id).first()
                if not source_chat:
                    continue
                visited.add(source_id)

                if source_chat.messages:
                    messages = source_chat.messages
                    if start_id:
                        start_idx = next(
                            (i for i, m in enumerate(messages) if m.id == start_id), 0
                        )
                        messages = messages[start_idx:]
                    if end_id:
                        end_idx = next(
                            (i for i, m in enumerate(messages) if m.id == end_id),
                            len(messages) - 1,
                        )
                        messages = messages[: end_idx + 1]

                    if messages:
                        transcript = ""
                        for msg in messages:
                            transcript += f"{msg.role.value}: {msg.content}\n"
                        parts.append({
                            "type": "chat",
                            "label": source_chat.title,
                            "sliced": bool(start_id or end_id),
                            "content": transcript,
                        })

                if depth < MAX_CONTEXT_DEPTH:
                    sub_attachments = db.query(ContextAttachment).filter(
                        ContextAttachment.chat_id == source_id
                    ).all()
                    sub_refs = [
                        (a.source_type, a.source_id, a.start_message_id, a.end_message_id)
                        for a in sub_attachments
                    ]
                    parts.extend(_build_context_parts(db, sub_refs, visited, depth + 1))

            elif source_type == SourceType.FILE:
                file_record = db.query(UploadedFile).filter(UploadedFile.id == source_id).first()
                if file_record:
                    file_ctx = chroma_service.get_document_by_id(source_id)
                    parts.append({
                        "type": "file",
                        "label": file_record.original_filename,
                        "sliced": False,
                        "content": file_ctx or "[File content not available - please re-upload]",
                    })
        except Exception as e:
            print(f"Error loading context ({source_type}, {source_id}): {e}")
            continue
    return parts


def _resolve_context(db: Session, chat: Chat) -> Tuple[List[dict], str | None, str | None]:
    """
    Build the full ordered context for a chat send:
      1. Muse pinned context (prepended)
      2. Per-chat attached context
    Returns (structured context_parts, system_prompt, muse_name).
    The visited set is shared so the same chat is never injected twice.
    """
    visited: Set[str] = {chat.id}  # prevent the current chat from appearing in its own context
    context_parts: List[dict] = []
    system_prompt = None
    muse_name = None

    if chat.muse_id:
        muse = db.query(Muse).filter(Muse.id == chat.muse_id).first()
        if muse:
            system_prompt = muse.system_prompt
            muse_name = muse.name
            muse_ctxs = db.query(MuseContext).filter(MuseContext.muse_id == chat.muse_id).all()
            muse_refs = [
                (mc.source_type, mc.source_id, mc.start_message_id, mc.end_message_id)
                for mc in muse_ctxs
            ]
            context_parts.extend(_build_context_parts(db, muse_refs, visited))

    attachments = db.query(ContextAttachment).filter(ContextAttachment.chat_id == chat.id).all()
    chat_refs = [
        (a.source_type, a.source_id, a.start_message_id, a.end_message_id)
        for a in attachments
    ]
    context_parts.extend(_build_context_parts(db, chat_refs, visited))

    return context_parts, system_prompt, muse_name


def _snapshot_context(context_parts: List[dict], system_prompt: str | None, muse_name: str | None) -> str | None:
    """JSON record of what was injected, stored on the assistant message. Null when nothing was."""
    if not context_parts and not system_prompt:
        return None
    return json.dumps({"muse": muse_name, "system_prompt": system_prompt, "parts": context_parts})


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
    if chat_data.model is not None:
        chat.model = chat_data.model if chat_data.model != "" else None

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
    context_parts, system_prompt, muse_name = _resolve_context(db, chat)
    context = "\n\n".join(_format_context_part(p) for p in context_parts) if context_parts else None
    snapshot = _snapshot_context(context_parts, system_prompt, muse_name)

    model_id = resolve_model_id(chat.model)
    try:
        response_text = get_llm_service(model_id).generate_response(
            message=request.message,
            history=history,
            context=context,
            system_prompt=system_prompt,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=_classify_send_error(e, model_id))

    assistant_message = Message(
        chat_id=chat_id, role=MessageRole.ASSISTANT, content=response_text,
        model=model_id, context_snapshot=snapshot,
    )
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
    context_parts, system_prompt, muse_name = _resolve_context(db, chat)
    context = "\n\n".join(_format_context_part(p) for p in context_parts) if context_parts else None
    snapshot = _snapshot_context(context_parts, system_prompt, muse_name)

    is_first_message = len(chat.messages) <= 2 and chat.title == "New Chat"
    new_title = request.message[:50] + ("..." if len(request.message) > 50 else "") if is_first_message else None
    if new_title:
        chat.title = new_title
        db.commit()

    model_id = resolve_model_id(chat.model)

    async def generate():
        full_response = ""
        try:
            async for chunk in get_llm_service(model_id).generate_response_stream(
                message=request.message,
                history=history,
                context=context,
                system_prompt=system_prompt,
            ):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': _classify_send_error(e, model_id)})}\n\n"
            return

        assistant_message = Message(
            chat_id=chat_id, role=MessageRole.ASSISTANT, content=full_response,
            model=model_id, context_snapshot=snapshot,
        )
        db.add(assistant_message)
        db.commit()

        chroma_service.add_message(
            message_id=assistant_message.id,
            content=full_response,
            metadata={"chat_id": chat_id, "role": "assistant"},
        )

        yield f"data: {json.dumps({'done': True, 'message_id': assistant_message.id, 'title': new_title, 'model': model_id, 'context_snapshot': snapshot})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
