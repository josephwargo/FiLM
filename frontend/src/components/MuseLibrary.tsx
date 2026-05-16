import { useState, useEffect } from 'react';
import { Wand2, Plus, Trash2, FileText, MessageSquare, X, Save, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { musesAPI, contextAPI } from '../services/api';
import type { Muse, MuseContext, UploadedFile, FolderTreeItem } from '../types';

// --- helpers ---

function findFolderInTree(tree: FolderTreeItem[], id: string): FolderTreeItem | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findFolderInTree(node.children, id);
    if (found) return found;
  }
  return null;
}

function collectChatIds(folder: FolderTreeItem): string[] {
  const ids = folder.chats.map((c) => c.id);
  for (const child of folder.children) ids.push(...collectChatIds(child));
  return ids;
}

// --- draggable source panel sub-components ---

function DraggableChat({ id, title }: { id: string; title: string }) {
  return (
    <div
      className="src-item src-item-chat"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('chatId', id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={title}
    >
      <MessageSquare size={12} />
      <span>{title}</span>
    </div>
  );
}

function DraggableFile({ id, filename }: { id: string; filename: string }) {
  return (
    <div
      className="src-item src-item-file"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('contextType', 'file');
        e.dataTransfer.setData('contextId', id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={filename}
    >
      <FileText size={12} />
      <span>{filename}</span>
    </div>
  );
}

function FolderNode({ node, depth = 0 }: { node: FolderTreeItem; depth?: number }) {
  const [open, setOpen] = useState(true);
  const hasContent = node.chats.length > 0 || node.children.length > 0;

  return (
    <div className="src-folder">
      <div
        className="src-folder-header"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Folder size={11} />
        <span>{node.name}</span>
        {!hasContent && <span className="src-empty-hint">empty</span>}
      </div>
      {open && (
        <div className="src-folder-children">
          {node.children.map((child) => (
            <FolderNode key={child.id} node={child} depth={depth + 1} />
          ))}
          {node.chats.map((chat) => (
            <div key={chat.id} style={{ paddingLeft: `${20 + depth * 12}px` }}>
              <DraggableChat id={chat.id} title={chat.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- editor form type ---

interface EditorForm {
  name: string;
  description: string;
  system_prompt: string;
}

const emptyForm = (): EditorForm => ({ name: '', description: '', system_prompt: '' });

// --- main component ---

export function MuseLibrary() {
  const { muses, chats, folderTree, loadMuses, loadChats, loadFolderTree, createMuse, updateMuse, deleteMuse } = useChatStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<EditorForm>(emptyForm());
  const [pinnedCtx, setPinnedCtx] = useState<MuseContext[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  useEffect(() => {
    loadMuses();
    loadChats();
    loadFolderTree();
    contextAPI.listFiles().then(setFiles).catch(() => {});
  }, []);

  const selectedMuse = muses.find((m) => m.id === selectedId) ?? null;
  const chatCountForMuse = (museId: string) => chats.filter((c) => c.muse_id === museId).length;

  // Chats that aren't in any folder (unfiled)
  const unfiledChats = chats.filter((c) => c.folder_id === null);

  const selectMuse = async (muse: Muse) => {
    setSelectedId(muse.id);
    setIsCreating(false);
    setForm({ name: muse.name, description: muse.description ?? '', system_prompt: muse.system_prompt });
    setFormDirty(false);
    try {
      setPinnedCtx(await musesAPI.getContext(muse.id));
    } catch {
      setPinnedCtx([]);
    }
  };

  const startCreating = () => {
    setSelectedId(null);
    setIsCreating(true);
    setForm(emptyForm());
    setPinnedCtx([]);
    setFormDirty(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.system_prompt.trim()) return;
    setIsSaving(true);
    try {
      if (isCreating) {
        const muse = await createMuse({
          name: form.name,
          description: form.description || undefined,
          system_prompt: form.system_prompt,
        });
        setSelectedId(muse.id);
        setIsCreating(false);
      } else if (selectedId) {
        await updateMuse(selectedId, {
          name: form.name,
          description: form.description || undefined,
          system_prompt: form.system_prompt,
        });
      }
      setFormDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (museId: string) => {
    await deleteMuse(museId);
    setSelectedId(null);
    setIsCreating(false);
    setPinnedCtx([]);
  };

  const pinContext = async (sourceType: 'chat' | 'file', sourceId: string) => {
    if (!selectedId) return;
    if (pinnedCtx.some((c) => c.source_type === sourceType && c.source_id === sourceId)) return;
    try {
      const ctx = await musesAPI.pinContext(selectedId, { source_type: sourceType, source_id: sourceId });
      setPinnedCtx((prev) => [...prev, ctx]);
    } catch {}
  };

  const handleUnpin = async (contextId: string) => {
    if (!selectedId) return;
    try {
      await musesAPI.unpinContext(selectedId, contextId);
      setPinnedCtx((prev) => prev.filter((c) => c.id !== contextId));
    } catch {}
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!selectedId) return;

    const chatId = e.dataTransfer.getData('chatId');
    const folderId = e.dataTransfer.getData('folderId');
    const contextType = e.dataTransfer.getData('contextType');
    const contextId = e.dataTransfer.getData('contextId');

    if (chatId) {
      await pinContext('chat', chatId);
    } else if (contextType === 'file' && contextId) {
      await pinContext('file', contextId);
    } else if (folderId) {
      const folder = findFolderInTree(folderTree, folderId);
      if (folder) {
        for (const id of collectChatIds(folder)) await pinContext('chat', id);
      }
    } else if (contextType === 'file-folder' && contextId) {
      for (const f of files.filter((f) => f.file_folder_id === contextId)) {
        await pinContext('file', f.id);
      }
    }
  };

  const getDisplayName = (ctx: MuseContext): string => {
    if (ctx.source_type === 'chat') {
      return chats.find((c) => c.id === ctx.source_id)?.title ?? 'Unknown chat';
    }
    return files.find((f) => f.id === ctx.source_id)?.filename ?? 'Unknown file';
  };

  const updateForm = (patch: Partial<EditorForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFormDirty(true);
  };

  const showEditor = selectedMuse || isCreating;
  const canPin = !!selectedId && !isCreating;

  return (
    <div className="muse-library">

      {/* Left: Muse list */}
      <div className="muse-lib-sidebar">
        <div className="muse-lib-sidebar-header">
          <span className="muse-lib-title">
            <Wand2 size={15} />
            Muses
          </span>
          <button className="muse-lib-new-btn" onClick={startCreating} title="New Muse">
            <Plus size={14} />
          </button>
        </div>

        <div className="muse-lib-list">
          {muses.length === 0 && !isCreating && (
            <p className="muse-lib-empty">No Muses yet.<br />Create one to get started.</p>
          )}
          {isCreating && (
            <div className="muse-lib-card muse-lib-card-selected">
              <span className="muse-lib-card-name">New Muse</span>
            </div>
          )}
          {muses.map((muse) => {
            const count = chatCountForMuse(muse.id);
            return (
              <div
                key={muse.id}
                className={`muse-lib-card ${selectedId === muse.id && !isCreating ? 'muse-lib-card-selected' : ''}`}
                onClick={() => selectMuse(muse)}
              >
                <span className="muse-lib-card-name">{muse.name}</span>
                {muse.description && <span className="muse-lib-card-desc">{muse.description}</span>}
                {count > 0 && <span className="muse-lib-card-count">{count} chat{count !== 1 ? 's' : ''}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle: Editor */}
      <div className="muse-lib-editor">
        {!showEditor ? (
          <div className="muse-lib-placeholder">
            <Wand2 size={32} opacity={0.2} />
            <p>Select a Muse to edit, or create a new one.</p>
          </div>
        ) : (
          <div className="muse-lib-editor-inner">
            <div className="muse-lib-editor-header">
              <h3>{isCreating ? 'New Muse' : selectedMuse?.name}</h3>
              {!isCreating && selectedId && (
                <button className="muse-lib-delete-btn" onClick={() => handleDelete(selectedId)} title="Delete Muse">
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>

            <div className="muse-lib-fields">
              <label className="muse-lib-label">Name</label>
              <input
                className="muse-lib-input"
                placeholder="e.g. PM Mode"
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
              />

              <label className="muse-lib-label">Description <span className="muse-lib-optional">(optional)</span></label>
              <input
                className="muse-lib-input"
                placeholder="Short description shown in the picker"
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
              />

              <label className="muse-lib-label">System Prompt</label>
              <textarea
                className="muse-lib-input muse-lib-textarea"
                placeholder="Tell the AI how to behave in chats using this Muse…"
                value={form.system_prompt}
                onChange={(e) => updateForm({ system_prompt: e.target.value })}
                rows={6}
              />
            </div>

            <div className="muse-lib-pinned-section">
              <label className="muse-lib-label">
                Pinned Context
                {canPin
                  ? <span className="muse-lib-optional"> — drag from the panel on the right</span>
                  : <span className="muse-lib-optional"> — save the Muse first</span>}
              </label>

              <div
                className={`muse-lib-drop-zone ${isDragOver ? 'muse-lib-drop-zone-over' : ''} ${!canPin ? 'muse-lib-drop-zone-disabled' : ''}`}
                onDragOver={(e) => { if (canPin) { e.preventDefault(); setIsDragOver(true); } }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                {pinnedCtx.length === 0 ? (
                  <span className="muse-lib-drop-hint">
                    {canPin ? 'Drag chats or files here to pin them' : 'Save the Muse first, then pin context'}
                  </span>
                ) : (
                  pinnedCtx.map((ctx) => (
                    <div key={ctx.id} className="muse-lib-pinned-item">
                      {ctx.source_type === 'file' ? <FileText size={13} /> : <MessageSquare size={13} />}
                      <span>{getDisplayName(ctx)}</span>
                      <button className="muse-lib-unpin-btn" onClick={() => handleUnpin(ctx.id)} title="Unpin">
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
                {pinnedCtx.length > 0 && canPin && (
                  <div className="muse-lib-drop-hint-bottom">Drop more here</div>
                )}
              </div>
            </div>

            <div className="muse-lib-actions">
              <button
                className="muse-lib-save-btn"
                onClick={handleSave}
                disabled={isSaving || !form.name.trim() || !form.system_prompt.trim() || (!formDirty && !isCreating)}
              >
                <Save size={14} />
                {isSaving ? 'Saving…' : isCreating ? 'Create Muse' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Draggable source panel */}
      <div className={`muse-lib-source ${!canPin ? 'muse-lib-source-dimmed' : ''}`}>
        <div className="muse-lib-source-header">
          {canPin ? 'Drag to pin context' : 'Select a saved Muse to pin context'}
        </div>

        <div className="muse-lib-source-section">
          <div className="muse-lib-source-label">
            <MessageSquare size={11} />
            Chats
          </div>
          {folderTree.map((folder) => (
            <FolderNode key={folder.id} node={folder} />
          ))}
          {unfiledChats.map((chat) => (
            <DraggableChat key={chat.id} id={chat.id} title={chat.title} />
          ))}
          {folderTree.length === 0 && unfiledChats.length === 0 && (
            <p className="src-empty">No chats yet</p>
          )}
        </div>

        <div className="muse-lib-source-section">
          <div className="muse-lib-source-label">
            <FileText size={11} />
            Files
          </div>
          {files.map((file) => (
            <DraggableFile key={file.id} id={file.id} filename={file.filename} />
          ))}
          {files.length === 0 && <p className="src-empty">No files uploaded</p>}
        </div>
      </div>

    </div>
  );
}
