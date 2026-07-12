import { useEffect, useState, useRef } from 'react';
import {
  FolderPlus,
  MessageSquarePlus,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Folder,
  MessageSquare,
  Trash2,
  X,
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { foldersAPI } from '../services/api';
import type { FolderTreeItem } from '../types';

const MIN_WIDTH = 160;
const MAX_WIDTH = 520;

export function Sidebar() {
  const {
    chats,
    currentChat,
    folderTree,
    loadChats,
    loadFolderTree,
    selectChat,
    createChat,
    deleteChat,
    createFolder,
    deleteFolder,
    moveChat,
  } = useChatStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(280);
  const savedWidth = useRef(280);

  useEffect(() => {
    loadChats();
    loadFolderTree();
  }, []);

  const collapse = () => {
    savedWidth.current = width;
    setIsCollapsed(true);
  };

  const expand = () => {
    setWidth(savedWidth.current);
    setIsCollapsed(false);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + ev.clientX - startX));
      setWidth(next);
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    next.has(folderId) ? next.delete(folderId) : next.add(folderId);
    setExpandedFolders(next);
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const handleChatDragStart = (e: React.DragEvent, chatId: string) => {
    e.dataTransfer.setData('chatId', chatId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    e.stopPropagation();
    setDraggedFolderId(folderId);
    e.dataTransfer.setData('folderId', folderId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    // Don't allow dropping a folder onto itself
    if (draggedFolderId && draggedFolderId === targetId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(targetId);
  };

  const handleDragLeave = () => setDragOverFolderId(null);

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const chatId = e.dataTransfer.getData('chatId');
    const folderId = e.dataTransfer.getData('folderId');

    if (chatId) {
      await moveChat(chatId, targetFolderId);
    } else if (folderId && folderId !== targetFolderId) {
      try {
        await foldersAPI.update(folderId, { parent_id: targetFolderId });
        await loadFolderTree();
      } catch (err) {
        console.error('Could not move folder:', err);
      }
    }

    setDragOverFolderId(null);
    setDraggedFolderId(null);
  };

  const renderFolderTree = (folders: FolderTreeItem[], depth = 0) =>
    folders.map((folder) => {
      const isExpanded = expandedFolders.has(folder.id);
      const isDragTarget = dragOverFolderId === folder.id && draggedFolderId !== folder.id;
      return (
        <div key={folder.id}>
          <div
            className={`sidebar-item folder-drop-zone ${isDragTarget ? 'drag-over' : ''}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            draggable
            onDragStart={(e) => handleFolderDragStart(e, folder.id)}
            onDragEnd={() => setDraggedFolderId(null)}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder.id)}
          >
            <button className="folder-toggle" onClick={() => toggleFolder(folder.id)}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <Folder size={16} className="icon-folder" fill="currentColor" fillOpacity={0.25} />
            <span className="sidebar-item-text">{folder.name}</span>
            <button
              className="sidebar-item-action"
              onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id); }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {isExpanded && (
            <>
              {folder.chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`sidebar-item chat-draggable ${currentChat?.id === chat.id ? 'active' : ''}`}
                  style={{ paddingLeft: `${28 + depth * 16}px` }}
                  draggable
                  onDragStart={(e) => handleChatDragStart(e, chat.id)}
                  onClick={() => selectChat(chat.id)}
                >
                  <MessageSquare size={16} />
                  <span className="sidebar-item-text">{chat.title}</span>
                  <button
                    className="sidebar-item-action"
                    onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {renderFolderTree(folder.children, depth + 1)}
            </>
          )}
        </div>
      );
    });

  const rootChats = chats.filter((chat) => !chat.folder_id);

  if (isCollapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <button className="sidebar-toggle" onClick={expand} title="Expand Library">
          <ChevronRight size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar" style={{ width, position: 'relative', flexShrink: 0 }}>
      <div className="sidebar-header">
        <h3 className="sidebar-label">Library</h3>
        <div className="sidebar-actions">
          <button className="btn btn-icon" onClick={() => createChat()} title="New Chat">
            <MessageSquarePlus size={18} />
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setShowNewFolder(!showNewFolder)}
            title="New Folder"
          >
            <FolderPlus size={18} />
          </button>
          <button className="btn btn-icon" onClick={collapse} title="Collapse">
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {showNewFolder && (
        <div className="new-folder-input">
          <input
            type="text"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
            }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>
            Create
          </button>
          <button
            className="btn btn-icon new-folder-cancel"
            onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {folderTree.length > 0 && (
          <div className="root-chats-label">Chat Folders</div>
        )}
        {renderFolderTree(folderTree)}
        <div
          className={`root-chats-drop-zone ${dragOverFolderId === 'root' ? 'drag-over' : ''}`}
          onDragOver={(e) => handleDragOver(e, 'root')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          {folderTree.length > 0 && <div className="sidebar-divider" />}
          <div className="root-chats-label">Unfiled Chats</div>
          {rootChats.map((chat) => (
            <div
              key={chat.id}
              className={`sidebar-item chat-draggable ${currentChat?.id === chat.id ? 'active' : ''}`}
              draggable
              onDragStart={(e) => handleChatDragStart(e, chat.id)}
              onClick={() => selectChat(chat.id)}
            >
              <MessageSquare size={16} />
              <span className="sidebar-item-text">{chat.title}</span>
              <button
                className="sidebar-item-action"
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {rootChats.length === 0 && <div className="drop-hint">Drop chats here</div>}
        </div>
      </div>

      {/* Drag-to-resize handle on right edge */}
      <div className="resize-handle resize-handle-e" onMouseDown={handleResizeMouseDown} />
    </div>
  );
}
