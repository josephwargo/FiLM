import { useState, useEffect } from 'react';
import { FileText, MessageSquare, X, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { contextAPI } from '../services/api';
import { ContextAttachment, UploadedFile, ChatListItem } from '../types';

export function ContextPanel() {
  const { currentChat, chats } = useChatStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

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

      {currentChat && attachments.length > 0 && (
        <div className="context-section">
          <h4>Attached</h4>
          <div className="context-items">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="context-item attached">
                {attachment.source_type === 'chat' ? (
                  <MessageSquare size={14} />
                ) : (
                  <FileText size={14} />
                )}
                <span>{getAttachedSourceName(attachment)}</span>
                <button className="context-item-remove" onClick={() => handleDetach(attachment.id)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="context-section">
        <h4>Chats</h4>
        <div className="context-items">
          {chats
            .filter((c) => c.id !== currentChat?.id)
            .slice(0, 10)
            .map((chat) => (
              <div
                key={chat.id}
                className={`context-item ${isAttached('chat', chat.id) ? 'disabled' : ''}`}
                onClick={() => !isAttached('chat', chat.id) && handleAttachChat(chat.id)}
              >
                <MessageSquare size={14} />
                <span>{chat.title}</span>
              </div>
            ))}
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
              className={`context-item ${isAttached('file', file.id) ? 'disabled' : ''}`}
              onClick={() => !isAttached('file', file.id) && handleAttachFile(file.id)}
            >
              <FileText size={14} />
              <span>{file.filename}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
