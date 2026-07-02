import { useState, useRef, useEffect } from 'react';
import { Sparkles, Check, ChevronDown, ChevronUp, AlertTriangle, Settings2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export function ModelPicker() {
  const { currentChat, models, setChatModel, openModelManager } = useChatStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!currentChat || models.length === 0) return null;

  const defaultModel = models.find((m) => m.is_default);
  const selected = currentChat.model ? models.find((m) => m.id === currentChat.model) ?? null : null;
  const isRetired = !!currentChat.model && !selected;
  const effective = selected ?? defaultModel;

  const handleSelect = async (modelId: string | null) => {
    await setChatModel(currentChat.id, modelId);
    setOpen(false);
  };

  const providers = [...new Set(models.map((m) => m.provider))];

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        className={`model-trigger ${selected ? 'model-trigger-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Choose which model answers in this chat"
      >
        <Sparkles size={13} />
        <span>{effective?.name ?? 'Model'}</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="model-dropdown">
          {isRetired && (
            <div className="model-retired-note">
              <AlertTriangle size={12} />
              <span>
                "{currentChat.model}" is no longer available — the default is used instead.
              </span>
            </div>
          )}

          <button
            className={`model-option ${!currentChat.model ? 'model-option-selected' : ''}`}
            onClick={() => handleSelect(null)}
          >
            <span className="model-option-text">
              <span className="model-option-name">
                Default{defaultModel ? ` (${defaultModel.name})` : ''}
              </span>
              <span className="model-option-desc">Follows the app default</span>
            </span>
            {!currentChat.model && <Check size={12} />}
          </button>

          {providers.map((provider) => (
            <div key={provider} className="model-provider-group">
              <div className="model-provider-label">{provider}</div>
              {models
                .filter((m) => m.provider === provider)
                .map((m) => (
                  <button
                    key={m.id}
                    className={`model-option ${currentChat.model === m.id ? 'model-option-selected' : ''}`}
                    disabled={!m.available}
                    onClick={() => handleSelect(m.id)}
                    title={m.available ? m.description : 'API key not configured'}
                  >
                    <span className="model-option-text">
                      <span className="model-option-name">
                        {m.name}
                        {!m.available && ' — no API key'}
                      </span>
                      <span className="model-option-desc">{m.description}</span>
                    </span>
                    {currentChat.model === m.id && <Check size={12} />}
                  </button>
                ))}
            </div>
          ))}

          <button
            className="model-manage-btn"
            onClick={() => {
              setOpen(false);
              openModelManager();
            }}
          >
            <Settings2 size={13} />
            <span>Manage Models</span>
          </button>
        </div>
      )}
    </div>
  );
}
