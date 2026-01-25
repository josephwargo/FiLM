from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class SourceType(str, Enum):
    CHAT = "chat"
    FILE = "file"


# Message schemas
class MessageBase(BaseModel):
    role: MessageRole
    content: str


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: str
    chat_id: str
    timestamp: datetime

    class Config:
        from_attributes = True


# Chat schemas
class ChatBase(BaseModel):
    title: str = "New Chat"
    folder_id: Optional[str] = None


class ChatCreate(ChatBase):
    pass


class ChatUpdate(BaseModel):
    title: Optional[str] = None
    folder_id: Optional[str] = None


class ChatResponse(ChatBase):
    id: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []

    class Config:
        from_attributes = True


class ChatListResponse(BaseModel):
    id: str
    title: str
    folder_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    class Config:
        from_attributes = True


# Folder schemas
class FolderBase(BaseModel):
    name: str
    parent_id: Optional[str] = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None


class FolderResponse(FolderBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Context attachment schemas
class ContextAttachmentCreate(BaseModel):
    chat_id: str
    source_type: SourceType
    source_id: str


class ContextAttachmentResponse(BaseModel):
    id: str
    chat_id: str
    source_type: SourceType
    source_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Chat request/response for AI
class ChatMessageRequest(BaseModel):
    message: str
    context_ids: List[str] = []


class ChatMessageResponse(BaseModel):
    response: str
    message_id: str
