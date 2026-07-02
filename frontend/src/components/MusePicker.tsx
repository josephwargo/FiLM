import { useState } from 'react';
import { Wand2, Plus, Check, Pencil, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export function MusePicker() {
  const { currentChat, muses, setMuse, openMuseLibrary } = useChatStore();
  const [open, setOpen] = useState(false);

  const activeMuse = muses.find((m) => m.id === currentChat?.muse_id) ?? null;

  const handleSelect = async (museId: string | null) => {
    if (!currentChat) return;
    await setMuse(currentChat.id, museId);
    setOpen(false);
  };

  const goToLibrary = (target?: string | 'new') => {
    setOpen(false);
    openMuseLibrary(target);
  };

  if (!currentChat) {
    return (
      <div className="muse-picker-panel">
        <button className="muse-trigger muse-trigger-panel" disabled>
          <Wand2 size={14} />
          <span>Select a chat to assign a Muse</span>
        </button>
      </div>
    );
  }

  return (
    <div className="muse-picker-panel">
      <button
        className={`muse-trigger muse-trigger-panel ${activeMuse ? 'muse-trigger-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Choose a Muse — an AI personality for this chat"
      >
        <Wand2 size={14} />
        <span>{activeMuse ? `Muse: ${activeMuse.name}` : 'No Muse'}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="muse-dropdown-inline">
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
                  <button
                    className="muse-icon-btn"
                    onClick={(e) => { e.stopPropagation(); goToLibrary(muse.id); }}
                    title="Edit in Muse Library"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="muse-dropdown-footer">
            <button className="muse-footer-btn" onClick={() => goToLibrary('new')}>
              <Plus size={13} />
              New Muse
            </button>
            <button className="muse-footer-btn" onClick={() => goToLibrary(activeMuse?.id)}>
              <Settings2 size={13} />
              Manage Muses
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
