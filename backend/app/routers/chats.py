from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import json

from ..models.database import get_db
from ..models.schemas import Chat, Message, MessageRole
from ..models.pydantic_models import (
    ChatCreate, ChatUpdate, ChatResponse, ChatListResponse,
    MessageCreate, MessageResponse, ChatMessageRequest
)
from ..services.gemini_service import gemini_service
from ..services.chroma_service import chroma_service

router = APIRouter(prefix="/api/chats", tags=["chats"])


@router.get("", response_model=List[ChatListResponse])
def list_chats(folder_id: str = None, db: Session = Depends(get_db)):
    """List all chats, optionally filtered by folder."""
    query = db.query(Chat)
    if folder_id:
        query = query.filter(Chat.folder_id == folder_id)

    chats = query.order_by(Chat.updated_at.desc()).all()

    result = []
    for chat in chats:
        result.append(ChatListResponse(
            id=chat.id,
            title=chat.title,
            folder_id=chat.folder_id,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            message_count=len(chat.messages)
        ))

    return result


@router.post("", response_model=ChatResponse)
def create_chat(chat_data: ChatCreate, db: Session = Depends(get_db)):
    """Create a new chat."""
    chat = Chat(
        title=chat_data.title,
        folder_id=chat_data.folder_id
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


@router.get("/{chat_id}", response_model=ChatResponse)
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    """Get a specific chat with its messages."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.patch("/{chat_id}", response_model=ChatResponse)
def update_chat(chat_id: str, chat_data: ChatUpdate, db: Session = Depends(get_db)):
    """Update a chat (rename, move to folder)."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    if chat_data.title is not None:
        chat.title = chat_data.title
    if chat_data.folder_id is not None:
        chat.folder_id = chat_data.folder_id

    db.commit()
    db.refresh(chat)
    return chat


@router.delete("/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    """Delete a chat and its messages."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Delete from vector store
    chroma_service.delete_chat_messages(chat_id)

    db.delete(chat)
    db.commit()
    return {"status": "deleted"}


@router.post("/{chat_id}/messages")
async def send_message(chat_id: str, request: ChatMessageRequest, db: Session = Depends(get_db)):
    """Send a message and get AI response."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Save user message
    user_message = Message(
        chat_id=chat_id,
        role=MessageRole.USER,
        content=request.message
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Add to vector store
    chroma_service.add_message(
        message_id=user_message.id,
        content=request.message,
        metadata={"chat_id": chat_id, "role": "user"}
    )

    # Get chat history
    history = [{"role": msg.role.value, "content": msg.content} for msg in chat.messages[:-1]]

    # Get context if provided
    context = None
    if request.context_ids:
        context = chroma_service.get_chat_context(request.context_ids)

    # Generate response
    response_text = gemini_service.generate_response(
        message=request.message,
        history=history,
        context=context
    )

    # Save assistant message
    assistant_message = Message(
        chat_id=chat_id,
        role=MessageRole.ASSISTANT,
        content=response_text
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    # Add to vector store
    chroma_service.add_message(
        message_id=assistant_message.id,
        content=response_text,
        metadata={"chat_id": chat_id, "role": "assistant"}
    )

    # Update chat title if it's the first message
    if len(chat.messages) <= 2 and chat.title == "New Chat":
        # Generate a title from the first message
        chat.title = request.message[:50] + ("..." if len(request.message) > 50 else "")
        db.commit()

    return {
        "response": response_text,
        "message_id": assistant_message.id,
        "user_message_id": user_message.id
    }


@router.post("/{chat_id}/messages/stream")
async def send_message_stream(chat_id: str, request: ChatMessageRequest, db: Session = Depends(get_db)):
    """Send a message and get streaming AI response."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Save user message
    user_message = Message(
        chat_id=chat_id,
        role=MessageRole.USER,
        content=request.message
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    # Add to vector store
    chroma_service.add_message(
        message_id=user_message.id,
        content=request.message,
        metadata={"chat_id": chat_id, "role": "user"}
    )

    # Get chat history
    history = [{"role": msg.role.value, "content": msg.content} for msg in chat.messages[:-1]]

    # Get context if provided
    context = None
    if request.context_ids:
        context = chroma_service.get_chat_context(request.context_ids)

    async def generate():
        full_response = ""
        async for chunk in gemini_service.generate_response_stream(
            message=request.message,
            history=history,
            context=context
        ):
            full_response += chunk
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        # Save complete response
        assistant_message = Message(
            chat_id=chat_id,
            role=MessageRole.ASSISTANT,
            content=full_response
        )
        db.add(assistant_message)
        db.commit()

        # Add to vector store
        chroma_service.add_message(
            message_id=assistant_message.id,
            content=full_response,
            metadata={"chat_id": chat_id, "role": "assistant"}
        )

        yield f"data: {json.dumps({'done': True, 'message_id': assistant_message.id})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
