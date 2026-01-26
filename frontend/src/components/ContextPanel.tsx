import { useState, useEffect } from 'react';
import { FileText, MessageSquare, X, Upload, ChevronLeft, ChevronRight, Inbox, Trash2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { contextAPI } from '../services/api';
import type { ContextAttachment, UploadedFile } from '../types';

export function ContextPanel() {
  const { currentChat, chats } = useChatStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    if (currentChat) {
      loadAttachments();
    } else {
      setAttachments([]);
    }
  }, [currentChat?.id]);

  const loadAttachments = async () => {
    if (!currentChat) return;
    try {
      const data = await contextAPI.getAttachments(currentChat.id);
      setAttachments(data);
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  };

  const loadFiles = async () => {
    try {
      const data = await contextAPI.listFiles();
      setFiles(data);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const handleAttachChat = async (chatId: string) => {
    if (!currentChat || chatId === currentChat.id) return;
    try {
      await contextAPI.attach(currentChat.id, 'chat', chatId);
      await loadAttachments();
    } catch (error) {
      console.error('Failed to attach chat:', error);
    }
  };

  const handleAttachFile = async (fileId: string) => {
    if (!currentChat) return;
    try {
      await contextAPI.attach(currentChat.id, 'file', fileId);
      await loadAttachments();
    } catch (error) {
      console.error('Failed to attach file:', error);
    }
  };

  const handleDetach = async (attachmentId: string) => {
    try {
      await contextAPI.detach(attachmentId);
      await loadAttachments();
    } catch (error) {
      console.error('Failed to detach:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await contextAPI.uploadFile(file);
      await loadFiles();
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
    setIsUploading(false);
    e.target.value = '';
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await contextAPI.deleteFile(fileId);
      await loadFiles();
      // Reload attachments in case this file was attached
      if (currentChat) {
        await loadAttachments();
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const getAttachedSourceName = (attachment: ContextAttachment): string => {
    if (attachment.source_type === 'chat') {
      const chat = chats.find((c) => c.id === attachment.source_id);
      return chat?.title || 'Unknown chat';
    } else {
      const file = files.find((f) => f.id === attachment.source_id);
      return file?.filename || 'Unknown file';
    }
  };

  const isAttached = (type: 'chat' | 'file', id: string): boolean => {
    return attachments.some((a) => a.source_type === type && a.source_id === id);
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, type: 'chat' | 'file', id: string) => {
    e.dataTransfer.setData('contextType', type);
    e.dataTransfer.setData('contextId', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!currentChat) return;

    const type = e.dataTransfer.getData('contextType') as 'chat' | 'file';
    const id = e.dataTransfer.getData('contextId');

    if (!type || !id) return;

    if (type === 'chat') {
      await handleAttachChat(id);
    } else {
      await handleAttachFile(id);
    }
  };

  if (isCollapsed) {
    return (
      <div className="context-panel collapsed">
        <button className="context-toggle" onClick={() => setIsCollapsed(false)}>
          <ChevronLeft size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="context-panel">
      <div className="context-header">
        <h3>Context</h3>
        <button className="context-toggle" onClick={() => setIsCollapsed(true)}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Current Context Drop Zone */}
      <div
        className={`current-context-zone ${isDragOver ? 'drag-over' : ''} ${!currentChat ? 'disabled' : ''}`}
        onDragOver={currentChat ? handleDragOver : undefined}
        onDragLeave={handleDragLeave}
        onDrop={currentChat ? handleDrop : undefined}
      >
        <div className="current-context-header">
          <Inbox size={16} />
          <span>Current Context</span>
        </div>
        {!currentChat ? (
          <div className="current-context-empty">Select a chat first</div>
        ) : attachments.length === 0 ? (
          <div className="current-context-empty">Drag items here</div>
        ) : (
          <div className="current-context-items">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="current-context-item">
                {attachment.source_type === 'chat' ? (
                  <MessageSquare size={14} />
                ) : (
                  <FileText size={14} />
                )}
                <span>{getAttachedSourceName(attachment)}</span>
                <button
                  className="context-item-remove"
                  onClick={() => handleDetach(attachment.id)}
                  title="Remove from context"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="context-section">
        <h4>Chats</h4>
        <div className="context-items">
          {chats
            .filter((c) => c.id !== currentChat?.id)
            .slice(0, 10)
            .map((chat) => (
              <div
                key={chat.id}
                className={`context-item draggable ${isAttached('chat', chat.id) ? 'attached' : ''}`}
                draggable={!isAttached('chat', chat.id)}
                onDragStart={(e) => handleDragStart(e, 'chat', chat.id)}
                onClick={() => !isAttached('chat', chat.id) && handleAttachChat(chat.id)}
              >
                <MessageSquare size={14} />
                <span>{chat.title}</span>
                {isAttached('chat', chat.id) && <span className="attached-badge">Added</span>}
              </div>
            ))}
          {chats.filter((c) => c.id !== currentChat?.id).length === 0 && (
            <div className="context-empty-hint">No other chats available</div>
          )}
        </div>
      </div>

      <div className="context-section">
        <h4>Files</h4>
        <label className="file-upload-btn">
          <Upload size={14} />
          <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
          <input
            type="file"
            accept=".txt,.md,.pdf"
            onChange={handleFileUpload}
            disabled={isUploading}
            hidden
          />
        </label>
        <div className="context-items">
          {files.map((file) => (
            <div
              key={file.id}
              className={`context-item draggable ${isAttached('file', file.id) ? 'attached' : ''}`}
              draggable={!isAttached('file', file.id)}
              onDragStart={(e) => handleDragStart(e, 'file', file.id)}
              onClick={() => !isAttached('file', file.id) && handleAttachFile(file.id)}
            >
              <FileText size={14} />
              <span>{file.filename}</span>
              {isAttached('file', file.id) && <span className="attached-badge">Added</span>}
              <button
                className="file-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteFile(file.id);
                }}
                title="Delete file"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {files.length === 0 && (
            <div className="context-empty-hint">No files uploaded yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
