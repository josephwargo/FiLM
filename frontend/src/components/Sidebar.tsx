import { useEffect, useState } from 'react';
import {
  FolderPlus,
  MessageSquarePlus,
  ChevronRight,
  ChevronDown,
  Folder,
  MessageSquare,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { FolderTreeItem } from '../types';

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
  } = useChatStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  useEffect(() => {
    loadChats();
    loadFolderTree();
  }, []);

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const handleCreateChat = async () => {
    await createChat();
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  const renderFolderTree = (folders: FolderTreeItem[], depth = 0) => {
    return folders.map((folder) => {
      const isExpanded = expandedFolders.has(folder.id);

      return (
        <div key={folder.id}>
          <div
            className="sidebar-item"
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            <button
              className="folder-toggle"
              onClick={() => toggleFolder(folder.id)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <Folder size={16} />
            <span className="sidebar-item-text">{folder.name}</span>
            <button
              className="sidebar-item-action"
              onClick={(e) => {
                e.stopPropagation();
                deleteFolder(folder.id);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {isExpanded && (
            <>
              {folder.chats.map((chat) => (
                <div
                  key={chat.id}
                  className={`sidebar-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                  style={{ paddingLeft: `${28 + depth * 16}px` }}
                  onClick={() => selectChat(chat.id)}
                >
                  <MessageSquare size={16} />
                  <span className="sidebar-item-text">{chat.title}</span>
                  <button
                    className="sidebar-item-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
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
  };

  // Get chats without a folder
  const rootChats = chats.filter((chat) => !chat.folder_id);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">FiLM</h1>
        <div className="sidebar-actions">
          <button className="btn btn-icon" onClick={handleCreateChat} title="New Chat">
            <MessageSquarePlus size={20} />
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setShowNewFolder(!showNewFolder)}
            title="New Folder"
          >
            <FolderPlus size={20} />
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
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>
            Create
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {renderFolderTree(folderTree)}

        {rootChats.length > 0 && (
          <div className="root-chats">
            {folderTree.length > 0 && <div className="sidebar-divider" />}
            {rootChats.map((chat) => (
              <div
                key={chat.id}
                className={`sidebar-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => selectChat(chat.id)}
              >
                <MessageSquare size={16} />
                <span className="sidebar-item-text">{chat.title}</span>
                <button
                  className="sidebar-item-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
