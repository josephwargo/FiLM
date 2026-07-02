import { useState, useEffect, useRef } from 'react';
import {
  FileText, MessageSquare, X, Upload, ChevronLeft, ChevronRight,
  ChevronDown, Inbox, Trash2, Folder, FolderPlus, Scissors, Wand2,
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { contextAPI, chatsAPI, musesAPI } from '../services/api';
import { MusePicker } from './MusePicker';
import { SliceEditor } from './SliceEditor';
import type { ContextAttachment, UploadedFile, FileFolder, Message, MuseContext } from '../types';

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;

export function ContextPanel() {
  const { currentChat, chats, folderTree, muses, openMuseLibrary, view } = useChatStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(260);
  const savedWidth = useRef(260);

  // Context state
  const [attachments, setAttachments] = useState<ContextAttachment[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fileFolders, setFileFolders] = useState<FileFolder[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Expand/collapse state
  const [expandedFileFolders, setExpandedFileFolders] = useState<Set<string>>(new Set());

  // New file folder creation
  const [showNewFileFolder, setShowNewFileFolder] = useState(false);
  const [newFileFolderName, setNewFileFolderName] = useState('');

  // Drag state
  const [isDragOverContext, setIsDragOverContext] = useState(false);
  const [dragOverFileFolderId, setDragOverFileFolderId] = useState<string | null>(null);
  const [draggedFileFolderId, setDraggedFileFolderId] = useState<string | null>(null);

  // Slice editor state — which attachment's editor is open, and a per-source-chat message cache
  const [openSliceFor, setOpenSliceFor] = useState<string | null>(null);
  const [sliceMessages, setSliceMessages] = useState<Record<string, Message[]>>({});
  const [sliceLoadingFor, setSliceLoadingFor] = useState<string | null>(null);

  // Pinned context of the current chat's Muse (read-only display)
  const [museCtx, setMuseCtx] = useState<MuseContext[]>([]);

  const collapse = () => { savedWidth.current = width; setIsCollapsed(true); };
  const expand = () => { setWidth(savedWidth.current); setIsCollapsed(false); };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (ev: MouseEvent) => {
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + startX - ev.clientX));
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

  useEffect(() => { loadFiles(); loadFileFolders(); }, []);
  useEffect(() => {
    if (currentChat) loadAttachments();
    else setAttachments([]);
  }, [currentChat?.id]);

  const activeMuse = muses.find((m) => m.id === currentChat?.muse_id) ?? null;
  useEffect(() => {
    if (!activeMuse) { setMuseCtx([]); return; }
    let cancelled = false;
    musesAPI.getContext(activeMuse.id)
      .then((ctx) => { if (!cancelled) setMuseCtx(ctx); })
      .catch(() => { if (!cancelled) setMuseCtx([]); });
    return () => { cancelled = true; };
  }, [activeMuse?.id]);

  const loadAttachments = async () => {
    if (!currentChat) return;
    try { setAttachments(await contextAPI.getAttachments(currentChat.id)); }
    catch (e) { console.error(e); }
  };

  const loadFiles = async () => {
    try { setFiles(await contextAPI.listFiles()); }
    catch (e) { console.error(e); }
  };

  const loadFileFolders = async () => {
    try { setFileFolders(await contextAPI.listFileFolders()); }
    catch (e) { console.error(e); }
  };

  // --- Context attachment handlers ---

  const attachChat = async (chatId: string) => {
    if (!currentChat || chatId === currentChat.id || isAttached('chat', chatId)) return;
    try { await contextAPI.attach(currentChat.id, 'chat', chatId); await loadAttachments(); }
    catch (e) { console.error(e); }
  };

  const attachFile = async (fileId: string) => {
    if (!currentChat || isAttached('file', fileId)) return;
    try { await contextAPI.attach(currentChat.id, 'file', fileId); await loadAttachments(); }
    catch (e) { console.error(e); }
  };

  const collectFileFolderFiles = (folder: FileFolder): UploadedFile[] =>
    [...folder.files, ...folder.children.flatMap(collectFileFolderFiles)];

  const attachFileFolder = async (folder: FileFolder) => {
    if (!currentChat) return;
    const all = collectFileFolderFiles(folder);
    const toAdd = all.filter((f) => !isAttached('file', f.id));
    await Promise.all(toAdd.map((f) => contextAPI.attach(currentChat.id, 'file', f.id).catch(() => {})));
    await loadAttachments();
  };

  const detach = async (attachmentId: string) => {
    try {
      await contextAPI.detach(attachmentId);
      if (openSliceFor === attachmentId) setOpenSliceFor(null);
      await loadAttachments();
    } catch (e) { console.error(e); }
  };

  // --- Slice editor ---

  const toggleSliceEditor = async (att: ContextAttachment) => {
    if (openSliceFor === att.id) {
      setOpenSliceFor(null);
      return;
    }
    setOpenSliceFor(att.id);
    if (!sliceMessages[att.source_id]) {
      setSliceLoadingFor(att.id);
      try {
        const chat = await chatsAPI.get(att.source_id);
        setSliceMessages((prev) => ({ ...prev, [att.source_id]: chat.messages ?? [] }));
      } catch (e) {
        console.error(e);
      } finally {
        setSliceLoadingFor(null);
      }
    }
  };

  const updateSlice = async (
    att: ContextAttachment,
    patch: { start_message_id?: string | null; end_message_id?: string | null },
  ) => {
    setAttachments((prev) =>
      prev.map((a) => (a.id === att.id ? { ...a, ...patch } : a))
    );
    try {
      await contextAPI.updateAttachment(att.id, patch);
    } catch (e) {
      console.error(e);
      await loadAttachments();
    }
  };

  // --- File folder management ---

  const createFileFolder = async () => {
    if (!newFileFolderName.trim()) return;
    try {
      await contextAPI.createFileFolder(newFileFolderName.trim());
      setNewFileFolderName('');
      setShowNewFileFolder(false);
      await loadFileFolders();
    } catch (e) { console.error(e); }
  };

  const deleteFileFolder = async (folderId: string) => {
    if (!confirm('Delete this file folder? Files inside will become unfoldered.')) return;
    try { await contextAPI.deleteFileFolder(folderId); await loadFileFolders(); await loadFiles(); }
    catch (e) { console.error(e); }
  };

  const moveFileToFolder = async (fileId: string, folderId: string) => {
    try { await contextAPI.moveFile(fileId, folderId); await loadFiles(); await loadFileFolders(); }
    catch (e) { console.error(e); }
  };

  const moveFileFolderToFolder = async (folderId: string, targetParentId: string | null) => {
    try { await contextAPI.moveFileFolder(folderId, targetParentId); await loadFileFolders(); }
    catch (e) { console.error(e); }
  };

  // --- Upload ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { await contextAPI.uploadFile(file); await loadFiles(); await loadFileFolders(); }
    catch (e) { console.error(e); }
    setIsUploading(false);
    e.target.value = '';
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await contextAPI.deleteFile(fileId);
      await loadFiles();
      await loadFileFolders();
      if (currentChat) await loadAttachments();
    } catch (e) { console.error(e); }
  };

  // --- Helpers ---

  const isAttached = (type: 'chat' | 'file', id: string) =>
    attachments.some((a) => a.source_type === type && a.source_id === id);

  const getAttachedSourceName = (att: ContextAttachment): string => {
    if (att.source_type === 'chat') return chats.find((c) => c.id === att.source_id)?.title ?? 'Unknown chat';
    return files.find((f) => f.id === att.source_id)?.filename
      ?? fileFolders.flatMap((ff) => ff.files).find((f) => f.id === att.source_id)?.filename
      ?? 'Unknown file';
  };

  const getMuseCtxName = (ctx: MuseContext): string => {
    if (ctx.source_type === 'chat') return chats.find((c) => c.id === ctx.source_id)?.title ?? 'Unknown chat';
    return files.find((f) => f.id === ctx.source_id)?.filename
      ?? fileFolders.flatMap((ff) => ff.files).find((f) => f.id === ctx.source_id)?.filename
      ?? 'Unknown file';
  };

  const sliceBadgeText = (att: ContextAttachment): string => {
    const msgs = sliceMessages[att.source_id];
    if (!msgs || msgs.length === 0) return 'Sliced';
    const rawStart = att.start_message_id ? msgs.findIndex((m) => m.id === att.start_message_id) : 0;
    const rawEnd = att.end_message_id ? msgs.findIndex((m) => m.id === att.end_message_id) : msgs.length - 1;
    const startIdx = rawStart === -1 ? 0 : rawStart;
    const endIdx = rawEnd === -1 ? msgs.length - 1 : rawEnd;
    return `Sliced · ${Math.max(0, endIdx - startIdx + 1)} of ${msgs.length}`;
  };

  const fileFolderUnattached = (folder: FileFolder): number => {
    const direct = folder.files.filter((f) => !isAttached('file', f.id)).length;
    const nested = folder.children.reduce((sum, c) => sum + fileFolderUnattached(c), 0);
    return direct + nested;
  };

  const toggleFileFolder = (id: string) =>
    setExpandedFileFolders((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // --- Drag handlers ---

  const onDragStart = (e: React.DragEvent, type: 'file' | 'file-folder', id: string) => {
    e.stopPropagation();
    if (type === 'file-folder') setDraggedFileFolderId(id);
    e.dataTransfer.setData('contextType', type);
    e.dataTransfer.setData('contextId', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Drop on context zone — accepts drags from both LHS sidebar and RHS file sections
  const onContextDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverContext(false);
    if (!currentChat) return;

    // Items dragged from within the context panel
    const contextType = e.dataTransfer.getData('contextType');
    const contextId = e.dataTransfer.getData('contextId');

    // Items dragged from the sidebar
    const chatId = e.dataTransfer.getData('chatId');
    const folderId = e.dataTransfer.getData('folderId');

    if (contextType === 'file') await attachFile(contextId);
    else if (contextType === 'file-folder') {
      const f = fileFolders.find((x) => x.id === contextId);
      if (f) await attachFileFolder(f);
    } else if (chatId) {
      await attachChat(chatId);
    } else if (folderId) {
      const findFolder = (items: typeof folderTree): typeof folderTree[0] | undefined => {
        for (const item of items) {
          if (item.id === folderId) return item;
          const found = findFolder(item.children);
          if (found) return found;
        }
      };
      const f = findFolder(folderTree);
      if (f) {
        const toAdd = f.chats.filter((c) => c.id !== currentChat.id && !isAttached('chat', c.id));
        await Promise.all(toAdd.map((c) => contextAPI.attach(currentChat.id, 'chat', c.id).catch(() => {})));
        await loadAttachments();
      }
    }
  };

  // Drop on a file folder row — moves a file into it, or nests a file folder inside it
  const onFileFolderRowDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFileFolderId(null);
    setDraggedFileFolderId(null);
    const type = e.dataTransfer.getData('contextType');
    const id = e.dataTransfer.getData('contextId');
    if (!id) return;
    if (type === 'file') {
      await moveFileToFolder(id, targetFolderId);
    } else if (type === 'file-folder' && id !== targetFolderId) {
      await moveFileFolderToFolder(id, targetFolderId);
    }
  };

  // --- Recursive file folder renderer ---

  const renderFileFolders = (folders: FileFolder[], depth = 0): React.ReactNode =>
    folders.map((folder) => {
      const unattached = fileFolderUnattached(folder);
      const allAdded = folder.files.length > 0 && unattached === 0 && folder.children.length === 0;
      const isEmpty = folder.files.length === 0 && folder.children.length === 0;
      const isExpanded = expandedFileFolders.has(folder.id);
      const isDragTarget = dragOverFileFolderId === folder.id && draggedFileFolderId !== folder.id;

      return (
        <div key={folder.id} style={{ paddingLeft: depth > 0 ? `${depth * 12}px` : undefined }}>
          <div
            className={`context-item folder-item ${isDragTarget ? 'file-folder-drop-target' : ''} ${allAdded ? 'attached' : isEmpty ? '' : 'draggable'}`}
            draggable={!allAdded}
            onDragStart={(e) => onDragStart(e, 'file-folder', folder.id)}
            onDragEnd={() => setDraggedFileFolderId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggedFileFolderId !== folder.id) setDragOverFileFolderId(folder.id);
            }}
            onDragLeave={() => setDragOverFileFolderId(null)}
            onDrop={(e) => onFileFolderRowDrop(e, folder.id)}
            onClick={() => !allAdded && !isEmpty && attachFileFolder(folder)}
          >
            <Folder size={14} />
            <span>{folder.name}</span>
            {isEmpty
              ? <span className="folder-empty-badge">empty</span>
              : allAdded
                ? <span className="attached-badge">All Added</span>
                : <span className="folder-count-badge">+{unattached}</span>}
            <button
              className="file-delete-btn"
              style={{ opacity: 1, marginLeft: 'auto' }}
              onClick={(e) => { e.stopPropagation(); deleteFileFolder(folder.id); }}
              title="Delete folder"
            >
              <Trash2 size={12} />
            </button>
            <button className="folder-expand-btn" onClick={(e) => { e.stopPropagation(); toggleFileFolder(folder.id); }}>
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>

          {isExpanded && (
            <div className="folder-chat-list">
              {folder.children.length > 0 && renderFileFolders(folder.children, depth + 1)}
              {folder.files.length === 0 && folder.children.length === 0
                ? <div className="context-empty-hint">Drop files or folders here</div>
                : folder.files.map((file) => (
                    <div
                      key={file.id}
                      className={`context-item context-item-indented ${isAttached('file', file.id) ? 'attached' : 'draggable'}`}
                      draggable={!isAttached('file', file.id)}
                      onDragStart={(e) => onDragStart(e, 'file', file.id)}
                      onClick={() => !isAttached('file', file.id) && attachFile(file.id)}
                    >
                      <FileText size={12} />
                      <span>{file.filename}</span>
                      {isAttached('file', file.id) && <span className="attached-badge">Added</span>}
                    </div>
                  ))}
            </div>
          )}
        </div>
      );
    });

  const unfiledFiles = files.filter((f) => !f.file_folder_id);

  // --- Collapsed state ---

  if (isCollapsed) {
    return (
      <div className="context-panel context-panel-collapsed">
        <button className="context-toggle" onClick={expand} title="Expand Context">
          <ChevronLeft size={20} />
        </button>
      </div>
    );
  }

  return (
    <div className="context-panel" style={{ width, position: 'relative', flexShrink: 0 }}>
      <div className="resize-handle resize-handle-w" onMouseDown={handleResizeMouseDown} />

      <div className="context-header">
        <h3>Context</h3>
        <button className="context-toggle" onClick={collapse} title="Collapse Context">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Current Context Drop Zone — hidden in the Muse editor, where staged pinned context takes its place */}
      {view !== 'muse-library' && (
      <div
        className={`current-context-zone ${isDragOverContext ? 'drag-over' : ''} ${!currentChat ? 'disabled' : ''}`}
        onDragOver={currentChat ? (e) => { e.preventDefault(); setIsDragOverContext(true); } : undefined}
        onDragLeave={() => setIsDragOverContext(false)}
        onDrop={currentChat ? onContextDrop : undefined}
      >
        <div className="current-context-header">
          <Inbox size={16} />
          <span>Current Context</span>
          <span className="current-context-live-badge">Active now</span>
        </div>
        <div className="current-context-subtitle">Sent to the AI with every message in this chat</div>

        {currentChat && (
          <div className="muse-context-group">
            <MusePicker />
            {activeMuse && museCtx.length > 0 && (
              <>
                {museCtx.map((ctx) => (
                  <div key={ctx.id} className="muse-context-item" title="Pinned by the Muse — included automatically">
                    {ctx.source_type === 'chat' ? <MessageSquare size={12} /> : <FileText size={12} />}
                    <span>{getMuseCtxName(ctx)}</span>
                  </div>
                ))}
                <button className="muse-context-edit-link" onClick={() => openMuseLibrary(activeMuse.id)}>
                  Edit in Muse Library
                </button>
              </>
            )}
          </div>
        )}

        {!currentChat ? (
          <div className="current-context-empty">Select a chat first</div>
        ) : attachments.length === 0 ? (
          <div className="current-context-empty">
            Drag chats or files here — their content is included when the AI answers.
          </div>
        ) : (
          <div className="current-context-items">
            {attachments.map((att) => {
              const isChat = att.source_type === 'chat';
              const isSliced = isChat && (att.start_message_id || att.end_message_id);
              const isOpen = openSliceFor === att.id;
              return (
                <div key={att.id}>
                  <div
                    className={`current-context-item ${isChat ? 'current-context-item-clickable' : ''} ${isOpen ? 'current-context-item-open' : ''}`}
                    onClick={isChat ? () => toggleSliceEditor(att) : undefined}
                    title={isChat ? (isOpen ? 'Close slice editor' : 'Click to slice — send only part of this chat') : undefined}
                  >
                    {isChat ? <MessageSquare size={14} /> : <FileText size={14} />}
                    <span>{getAttachedSourceName(att)}</span>
                    {isSliced && <span className="slice-badge">{sliceBadgeText(att)}</span>}
                    {isChat && (
                      <span className={`slice-cue ${isOpen ? 'slice-toggle-active' : ''}`}>
                        <Scissors size={13} />
                      </span>
                    )}
                    <button
                      className="context-item-remove"
                      onClick={(e) => { e.stopPropagation(); detach(att.id); }}
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {isOpen && (
                    <SliceEditor
                      startId={att.start_message_id}
                      endId={att.end_message_id}
                      messages={sliceMessages[att.source_id]}
                      loading={sliceLoadingFor === att.id}
                      onUpdate={(patch) => updateSlice(att, patch)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Controls below — these change settings, unlike the status card above */}
      <div className="context-tools-divider">
        <span>Add &amp; Configure</span>
      </div>

      <MusePicker />

      {/* File Folders */}
      <div className="context-section">
        <div className="context-section-header">
          <h4>File Folders</h4>
          <button
            className="context-section-action"
            onClick={() => setShowNewFileFolder((v) => !v)}
            title="New file folder"
          >
            <FolderPlus size={13} />
          </button>
        </div>

        {showNewFileFolder && (
          <div className="context-new-folder-input">
            <input
              autoFocus
              placeholder="Folder name..."
              value={newFileFolderName}
              onChange={(e) => setNewFileFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFileFolder();
                if (e.key === 'Escape') { setShowNewFileFolder(false); setNewFileFolderName(''); }
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={createFileFolder}>Create</button>
          </div>
        )}

        <div className="context-items">
          {fileFolders.length === 0
            ? <div className="context-empty-hint">No file folders yet</div>
            : renderFileFolders(fileFolders)}
        </div>
      </div>

      {/* Unfiled Files */}
      <div className="context-section">
        <h4>Unfiled Files</h4>
        <label className="file-upload-btn">
          <Upload size={14} />
          <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
          <input type="file" accept=".txt,.md,.pdf" onChange={handleFileUpload} disabled={isUploading} hidden />
        </label>
        <div className="context-items">
          {unfiledFiles.map((file) => (
            <div
              key={file.id}
              className={`context-item draggable ${isAttached('file', file.id) ? 'attached' : ''}`}
              draggable={!isAttached('file', file.id)}
              onDragStart={(e) => onDragStart(e, 'file', file.id)}
              onClick={() => !isAttached('file', file.id) && attachFile(file.id)}
            >
              <FileText size={14} />
              <span>{file.filename}</span>
              {isAttached('file', file.id) && <span className="attached-badge">Added</span>}
              <button
                className="file-delete-btn"
                onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                title="Delete file"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {unfiledFiles.length === 0 && (
            <div className="context-empty-hint">
              {files.length > 0 ? 'All files are in folders' : 'No files uploaded yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
