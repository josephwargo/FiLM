from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class SourceType(str, Enum):
    CHAT = "chat"
    FILE = "file"


# Model manager schemas
class CredentialPayload(BaseModel):
    value: str


class ModelPrefUpdate(BaseModel):
    enabled: bool


# Message schemas
class MessageBase(BaseModel):
    role: MessageRole
    content: str


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chat_id: str
    model: Optional[str] = None
    context_snapshot: Optional[str] = None
    timestamp: datetime


# Chat schemas
class ChatBase(BaseModel):
    title: str = "New Chat"
    folder_id: Optional[str] = None


class ChatCreate(ChatBase):
    pass


class ChatUpdate(BaseModel):
    title: Optional[str] = None
    folder_id: Optional[str] = None
    muse_id: Optional[str] = None
    model: Optional[str] = None


class ChatResponse(ChatBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    muse_id: Optional[str] = None
    model: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = []


class ChatListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    folder_id: Optional[str]
    muse_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0


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
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


# Context attachment schemas
class ContextAttachmentCreate(BaseModel):
    chat_id: str
    source_type: SourceType
    source_id: str


class ContextAttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chat_id: str
    source_type: SourceType
    source_id: str
    start_message_id: Optional[str] = None
    end_message_id: Optional[str] = None
    created_at: datetime


class ContextAttachmentUpdate(BaseModel):
    start_message_id: Optional[str] = None
    end_message_id: Optional[str] = None


# File folder schemas
class FileFolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None


class FileFolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
    files: List[dict] = []


# Muse schemas
class MuseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: str


class MuseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None


class MuseContextCreate(BaseModel):
    source_type: SourceType
    source_id: str
    start_message_id: Optional[str] = None
    end_message_id: Optional[str] = None


class MuseContextUpdate(BaseModel):
    start_message_id: Optional[str] = None
    end_message_id: Optional[str] = None


class MuseContextResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    muse_id: str
    source_type: SourceType
    source_id: str
    start_message_id: Optional[str] = None
    end_message_id: Optional[str] = None
    created_at: datetime


class MuseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str]
    system_prompt: str
    created_at: datetime


# Chat request/response for AI
class ChatMessageRequest(BaseModel):
    message: str
    context_ids: List[str] = []


class ChatMessageResponse(BaseModel):
    response: str
    message_id: str
