import { useState, useEffect, useRef } from 'react';
import { Wand2, Plus, Trash2, FileText, MessageSquare, X, Save, ArrowLeft, Scissors } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { musesAPI, contextAPI, chatsAPI } from '../services/api';
import { SliceEditor } from './SliceEditor';
import type { Muse, MuseContext, UploadedFile, FolderTreeItem, Message } from '../types';

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

// --- staged pinned-context type ---

interface StagedCtx {
  key: string; // `${source_type}:${source_id}` — stable across save round-trips
  id: string | null; // null = not yet persisted
  source_type: 'chat' | 'file';
  source_id: string;
  start_message_id: string | null;
  end_message_id: string | null;
}

const toStaged = (c: MuseContext): StagedCtx => ({
  key: `${c.source_type}:${c.source_id}`,
  id: c.id,
  source_type: c.source_type,
  source_id: c.source_id,
  start_message_id: c.start_message_id ?? null,
  end_message_id: c.end_message_id ?? null,
});

// --- editor form type ---

interface EditorForm {
  name: string;
  description: string;
  system_prompt: string;
}

const emptyForm = (): EditorForm => ({ name: '', description: '', system_prompt: '' });

// --- main component ---

export function MuseLibrary() {
  const {
    muses, chats, folderTree, loadMuses, loadChats, loadFolderTree,
    createMuse, updateMuse, deleteMuse, museLibraryTarget, closeMuseLibrary,
  } = useChatStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<EditorForm>(emptyForm());
  const [staged, setStaged] = useState<StagedCtx[]>([]);
  const [baseline, setBaseline] = useState<MuseContext[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  // Slice editor state — which staged item's editor is open, and a per-source-chat message cache
  const [openSliceKey, setOpenSliceKey] = useState<string | null>(null);
  const [sliceMessages, setSliceMessages] = useState<Record<string, Message[]>>({});
  const [sliceLoadingKey, setSliceLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    loadMuses();
    loadChats();
    loadFolderTree();
    contextAPI.listFiles().then(setFiles).catch(() => {});
  }, []);

  const selectedMuse = muses.find((m) => m.id === selectedId) ?? null;
  const chatCountForMuse = (museId: string) => chats.filter((c) => c.muse_id === museId).length;

  const ctxDirty =
    staged.length !== baseline.length ||
    staged.some((s) => {
      if (s.id === null) return true;
      const b = baseline.find((x) => x.id === s.id);
      return !b
        || (b.start_message_id ?? null) !== s.start_message_id
        || (b.end_message_id ?? null) !== s.end_message_id;
    });

  const isDirty = formDirty || ctxDirty;

  const confirmDiscard = () =>
    !isDirty || confirm('You have unsaved changes. Discard them?');

  const selectMuse = async (muse: Muse) => {
    setSelectedId(muse.id);
    setIsCreating(false);
    setForm({ name: muse.name, description: muse.description ?? '', system_prompt: muse.system_prompt });
    setFormDirty(false);
    setOpenSliceKey(null);
    try {
      const ctx = await musesAPI.getContext(muse.id);
      setBaseline(ctx);
      setStaged(ctx.map(toStaged));
    } catch {
      setBaseline([]);
      setStaged([]);
    }
  };

  const startCreating = () => {
    setSelectedId(null);
    setIsCreating(true);
    setForm(emptyForm());
    setBaseline([]);
    setStaged([]);
    setFormDirty(false);
    setOpenSliceKey(null);
  };

  const guardedSelectMuse = (muse: Muse) => {
    if (muse.id === selectedId && !isCreating) return;
    if (!confirmDiscard()) return;
    selectMuse(muse);
  };

  const guardedStartCreating = () => {
    if (!confirmDiscard()) return;
    startCreating();
  };

  // Honor the navigation target (from MusePicker / Context panel) once per visit
  const handledTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!museLibraryTarget || handledTarget.current === museLibraryTarget) return;
    if (museLibraryTarget === 'new') {
      handledTarget.current = museLibraryTarget;
      startCreating();
      return;
    }
    const muse = muses.find((m) => m.id === museLibraryTarget);
    if (muse) {
      handledTarget.current = museLibraryTarget;
      selectMuse(muse);
    }
  }, [museLibraryTarget, muses]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.system_prompt.trim()) return;
    setIsSaving(true);
    try {
      let museId = selectedId;
      if (isCreating) {
        const muse = await createMuse({
          name: form.name,
          description: form.description || undefined,
          system_prompt: form.system_prompt,
        });
        museId = muse.id;
        setSelectedId(muse.id);
        setIsCreating(false);
      } else if (museId && formDirty) {
        await updateMuse(museId, {
          name: form.name,
          description: form.description || undefined,
          system_prompt: form.system_prompt,
        });
      }
      if (!museId) return;

      // Diff staged vs baseline: delete removed, add new, patch changed bounds
      for (const b of baseline) {
        if (!staged.some((s) => s.id === b.id)) {
          await musesAPI.unpinContext(museId, b.id).catch(() => {});
        }
      }
      for (const s of staged) {
        if (s.id === null) {
          await musesAPI.pinContext(museId, {
            source_type: s.source_type,
            source_id: s.source_id,
            start_message_id: s.start_message_id,
            end_message_id: s.end_message_id,
          }).catch(() => {});
        } else {
          const b = baseline.find((x) => x.id === s.id);
          if (b && ((b.start_message_id ?? null) !== s.start_message_id || (b.end_message_id ?? null) !== s.end_message_id)) {
            await musesAPI.updateContext(museId, s.id, {
              start_message_id: s.start_message_id,
              end_message_id: s.end_message_id,
            }).catch(() => {});
          }
        }
      }

      const fresh = await musesAPI.getContext(museId);
      setBaseline(fresh);
      setStaged(fresh.map(toStaged));
      setFormDirty(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (museId: string) => {
    const muse = muses.find((m) => m.id === museId);
    if (!confirm(`Delete the Muse "${muse?.name ?? 'this Muse'}"? Chats using it will keep their history but lose the personality.`)) return;
    await deleteMuse(museId);
    setSelectedId(null);
    setIsCreating(false);
    setBaseline([]);
    setStaged([]);
    setFormDirty(false);
  };

  // --- staged pinned-context handlers (local only — persisted on Save) ---

  const stageAdd = (sourceType: 'chat' | 'file', sourceId: string) => {
    const key = `${sourceType}:${sourceId}`;
    setStaged((prev) =>
      prev.some((s) => s.key === key)
        ? prev
        : [...prev, { key, id: null, source_type: sourceType, source_id: sourceId, start_message_id: null, end_message_id: null }]
    );
  };

  const stageRemove = (key: string) => {
    setStaged((prev) => prev.filter((s) => s.key !== key));
    if (openSliceKey === key) setOpenSliceKey(null);
  };

  const stageSliceUpdate = (
    key: string,
    patch: { start_message_id?: string | null; end_message_id?: string | null },
  ) => {
    setStaged((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const next = { ...s };
        if ('start_message_id' in patch) next.start_message_id = patch.start_message_id ?? null;
        if ('end_message_id' in patch) next.end_message_id = patch.end_message_id ?? null;
        return next;
      })
    );
  };

  const toggleSliceEditor = async (s: StagedCtx) => {
    if (openSliceKey === s.key) {
      setOpenSliceKey(null);
      return;
    }
    setOpenSliceKey(s.key);
    if (!sliceMessages[s.source_id]) {
      setSliceLoadingKey(s.key);
      try {
        const chat = await chatsAPI.get(s.source_id);
        setSliceMessages((prev) => ({ ...prev, [s.source_id]: chat.messages ?? [] }));
      } catch (e) {
        console.error(e);
      } finally {
        setSliceLoadingKey(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!showEditor) return;

    const chatId = e.dataTransfer.getData('chatId');
    const folderId = e.dataTransfer.getData('folderId');
    const contextType = e.dataTransfer.getData('contextType');
    const contextId = e.dataTransfer.getData('contextId');

    if (chatId) {
      stageAdd('chat', chatId);
    } else if (contextType === 'file' && contextId) {
      stageAdd('file', contextId);
    } else if (folderId) {
      const folder = findFolderInTree(folderTree, folderId);
      if (folder) {
        for (const id of collectChatIds(folder)) stageAdd('chat', id);
      }
    } else if (contextType === 'file-folder' && contextId) {
      for (const f of files.filter((f) => f.file_folder_id === contextId)) {
        stageAdd('file', f.id);
      }
    }
  };

  const getDisplayName = (ctx: StagedCtx): string => {
    if (ctx.source_type === 'chat') {
      return chats.find((c) => c.id === ctx.source_id)?.title ?? 'Unknown chat';
    }
    return files.find((f) => f.id === ctx.source_id)?.filename ?? 'Unknown file';
  };

  const sliceBadgeText = (s: StagedCtx): string => {
    const msgs = sliceMessages[s.source_id];
    if (!msgs || msgs.length === 0) return 'Sliced';
    const rawStart = s.start_message_id ? msgs.findIndex((m) => m.id === s.start_message_id) : 0;
    const rawEnd = s.end_message_id ? msgs.findIndex((m) => m.id === s.end_message_id) : msgs.length - 1;
    const startIdx = rawStart === -1 ? 0 : rawStart;
    const endIdx = rawEnd === -1 ? msgs.length - 1 : rawEnd;
    return `Sliced · ${Math.max(0, endIdx - startIdx + 1)} of ${msgs.length}`;
  };

  const updateForm = (patch: Partial<EditorForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFormDirty(true);
  };

  const showEditor = selectedMuse || isCreating;

  return (
    <div className="muse-library-page">
      <div className="muse-lib-topbar">
        <button className="muse-lib-back-btn" onClick={closeMuseLibrary}>
          <ArrowLeft size={14} />
          Back to Chats
        </button>
        <span className="muse-lib-topbar-hint">
          Muses are reusable AI personalities — assign one to a chat with the Muse picker at the top of the Context panel.
        </span>
      </div>

      <div className="muse-library">

      {/* Left: Muse list */}
      <div className="muse-lib-sidebar">
        <div className="muse-lib-sidebar-header">
          <span className="muse-lib-title">
            <Wand2 size={15} />
            Muses
          </span>
          <button className="muse-lib-new-btn" onClick={guardedStartCreating} title="New Muse">
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
                onClick={() => guardedSelectMuse(muse)}
              >
                <span className="muse-lib-card-name">{muse.name}</span>
                {muse.description && <span className="muse-lib-card-desc">{muse.description}</span>}
                {count > 0 && <span className="muse-lib-card-count">{count} chat{count !== 1 ? 's' : ''}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Editor */}
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
                <span className="muse-lib-optional"> — drag chats from the left sidebar or files from the right panel</span>
              </label>
              <p className="muse-lib-explainer">
                Pinned context is sent in <strong>every</strong> chat that uses this Muse.
                To add context to just one chat, use the Context panel in chat view.
              </p>

              <div
                className={`muse-lib-drop-zone ${isDragOver ? 'muse-lib-drop-zone-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                {staged.length === 0 ? (
                  <span className="muse-lib-drop-hint">
                    Drag chats from the left sidebar or files from the right panel to pin them
                  </span>
                ) : (
                  staged.map((ctx) => {
                    const isChat = ctx.source_type === 'chat';
                    const isSliced = isChat && (ctx.start_message_id || ctx.end_message_id);
                    const isOpen = openSliceKey === ctx.key;
                    return (
                      <div key={ctx.key}>
                        <div
                          className={`muse-lib-pinned-item ${isChat ? 'muse-lib-pinned-clickable' : ''} ${isOpen ? 'muse-lib-pinned-open' : ''}`}
                          onClick={isChat ? () => toggleSliceEditor(ctx) : undefined}
                          title={isChat ? (isOpen ? 'Close slice editor' : 'Click to slice — pin only part of this chat') : undefined}
                        >
                          {isChat ? <MessageSquare size={13} /> : <FileText size={13} />}
                          <span>{getDisplayName(ctx)}</span>
                          {isSliced && <span className="slice-badge">{sliceBadgeText(ctx)}</span>}
                          {isChat && (
                            <span className={`slice-cue ${isOpen ? 'slice-toggle-active' : ''}`}>
                              <Scissors size={12} />
                            </span>
                          )}
                          <button
                            className="muse-lib-unpin-btn"
                            onClick={(e) => { e.stopPropagation(); stageRemove(ctx.key); }}
                            title="Unpin"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {isOpen && (
                          <SliceEditor
                            startId={ctx.start_message_id}
                            endId={ctx.end_message_id}
                            messages={sliceMessages[ctx.source_id]}
                            loading={sliceLoadingKey === ctx.key}
                            onUpdate={(patch) => stageSliceUpdate(ctx.key, patch)}
                          />
                        )}
                      </div>
                    );
                  })
                )}
                {staged.length > 0 && (
                  <div className="muse-lib-drop-hint-bottom">Drop more here</div>
                )}
              </div>
            </div>

            <div className="muse-lib-actions">
              <button
                className="muse-lib-save-btn"
                onClick={handleSave}
                disabled={isSaving || !form.name.trim() || !form.system_prompt.trim() || (!isDirty && !isCreating)}
              >
                <Save size={14} />
                {isSaving ? 'Saving…' : isCreating ? 'Create Muse' : 'Save Changes'}
              </button>
              {isDirty && !isSaving && (
                <span className="muse-lib-unsaved-note">Unsaved changes</span>
              )}
            </div>
          </div>
        )}
      </div>

      </div>
    </div>
  );
}
