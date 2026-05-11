import uuid
from datetime import datetime, timezone


def _utcnow():
    return datetime.now(timezone.utc)
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum

from .database import Base


def generate_uuid():
    return str(uuid.uuid4())


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"


class SourceType(str, enum.Enum):
    CHAT = "chat"
    FILE = "file"


class Folder(Base):
    __tablename__ = "folders"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    parent_id = Column(String, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    parent = relationship("Folder", remote_side=[id], backref="children")
    chats = relationship("Chat", back_populates="folder")


class Chat(Base):
    __tablename__ = "chats"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False, default="New Chat")
    folder_id = Column(String, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    folder = relationship("Folder", back_populates="chats")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan")
    context_attachments = relationship("ContextAttachment", back_populates="chat", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    chat_id = Column(String, ForeignKey("chats.id"), nullable=False)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=_utcnow)

    # Relationships
    chat = relationship("Chat", back_populates="messages")


class ContextAttachment(Base):
    __tablename__ = "context_attachments"

    id = Column(String, primary_key=True, default=generate_uuid)
    chat_id = Column(String, ForeignKey("chats.id"), nullable=False)
    source_type = Column(Enum(SourceType), nullable=False)
    source_id = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    chat = relationship("Chat", back_populates="context_attachments")


class FileFolder(Base):
    __tablename__ = "file_folders"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    parent_id = Column(String, ForeignKey("file_folders.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    parent = relationship("FileFolder", remote_side=[id], backref="children")
    files = relationship("UploadedFile", back_populates="file_folder")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    size = Column(String, nullable=False)
    file_folder_id = Column(String, ForeignKey("file_folders.id"), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    file_folder = relationship("FileFolder", back_populates="files")
