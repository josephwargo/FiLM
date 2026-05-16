import { useState } from 'react';
import { Wand2, X, Plus, Check, Pencil, Trash2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import type { Muse } from '../types';

interface MuseFormState {
  name: string;
  description: string;
  system_prompt: string;
}

const emptyForm = (): MuseFormState => ({ name: '', description: '', system_prompt: '' });

export function MusePicker() {
  const { currentChat, muses, setMuse, createMuse, updateMuse, deleteMuse } = useChatStore();
  const [open, setOpen] = useState(false);
  const [editingMuse, setEditingMuse] = useState<Muse | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MuseFormState>(emptyForm());

  if (!currentChat) return null;

  const activeMuse = muses.find((m) => m.id === currentChat.muse_id) ?? null;

  const handleSelect = async (museId: string | null) => {
    await setMuse(currentChat.id, museId);
    setOpen(false);
  };

  const handleSubmitForm = async () => {
    if (!form.name.trim() || !form.system_prompt.trim()) return;
    if (editingMuse) {
      await updateMuse(editingMuse.id, {
        name: form.name,
        description: form.description || undefined,
        system_prompt: form.system_prompt,
      });
    } else {
      await createMuse({
        name: form.name,
        description: form.description || undefined,
        system_prompt: form.system_prompt,
      });
    }
    setForm(emptyForm());
    setShowForm(false);
    setEditingMuse(null);
  };

  const handleEditClick = (muse: Muse, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMuse(muse);
    setForm({ name: muse.name, description: muse.description ?? '', system_prompt: muse.system_prompt });
    setShowForm(true);
  };

  const handleDeleteClick = async (museId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteMuse(museId);
  };

  const handleNewMuse = () => {
    setEditingMuse(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  return (
    <div className="muse-picker">
      <button
        className={`muse-trigger ${activeMuse ? 'muse-trigger-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Choose a Muse"
      >
        <Wand2 size={14} />
        <span>{activeMuse ? activeMuse.name : 'No Muse'}</span>
      </button>

      {open && (
        <div className="muse-dropdown">
          <div className="muse-dropdown-header">
            <span>Muses</span>
            <button className="muse-icon-btn" onClick={handleNewMuse} title="New muse">
              <Plus size={14} />
            </button>
          </div>

          <div className="muse-list">
            <button
              className={`muse-option ${!currentChat.muse_id ? 'muse-option-selected' : ''}`}
              onClick={() => handleSelect(null)}
            >
              <span className="muse-option-name">No Muse</span>
              {!currentChat.muse_id && <Check size={12} />}
            </button>

            {muses.map((muse) => (
              <div key={muse.id} className={`muse-option ${currentChat.muse_id === muse.id ? 'muse-option-selected' : ''}`}>
                <button className="muse-option-label" onClick={() => handleSelect(muse.id)}>
                  <span className="muse-option-name">{muse.name}</span>
                  {muse.description && <span className="muse-option-desc">{muse.description}</span>}
                </button>
                <div className="muse-option-actions">
                  {currentChat.muse_id === muse.id && <Check size={12} />}
                  <button className="muse-icon-btn" onClick={(e) => handleEditClick(muse, e)} title="Edit">
                    <Pencil size={12} />
                  </button>
                  <button className="muse-icon-btn muse-icon-btn-danger" onClick={(e) => handleDeleteClick(muse.id, e)} title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showForm && (
            <div className="muse-form">
              <div className="muse-form-header">
                <span>{editingMuse ? 'Edit Muse' : 'New Muse'}</span>
                <button className="muse-icon-btn" onClick={() => { setShowForm(false); setEditingMuse(null); }}>
                  <X size={13} />
                </button>
              </div>
              <input
                className="muse-input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="muse-input"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <textarea
                className="muse-input muse-textarea"
                placeholder="System prompt — tell the AI how to behave"
                value={form.system_prompt}
                onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                rows={4}
              />
              <button
                className="muse-submit-btn"
                onClick={handleSubmitForm}
                disabled={!form.name.trim() || !form.system_prompt.trim()}
              >
                {editingMuse ? 'Save changes' : 'Create Muse'}
              </button>
            </div>
          )}
        </div>
      )}

      {open && <div className="muse-backdrop" onClick={() => setOpen(false)} />}
    </div>
  );
}
