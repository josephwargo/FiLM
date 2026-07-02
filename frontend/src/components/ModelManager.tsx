import { useState, useEffect } from 'react';
import {
  ArrowLeft, Loader2, KeyRound, Trash2, CheckCircle2, Circle,
  Server, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { modelsAPI } from '../services/api';
import type { CatalogModel, ProviderStatus } from '../types';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google — Gemini',
  anthropic: 'Anthropic — Claude',
  openai: 'OpenAI — GPT',
  ollama: 'Ollama — local models',
};

const KEY_PLACEHOLDERS: Record<string, string> = {
  google: 'AIza...',
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  ollama: 'http://localhost:11434',
};

const KEY_PROVIDERS = ['google', 'anthropic', 'openai'];

export function ModelManager() {
  const { closeModelManager, loadModels } = useChatStore();

  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [providers, setProviders] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null); // provider being validated/saved
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const data = await modelsAPI.getCatalog();
      setCatalog(data.models);
      setProviders(data.providers);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const setInput = (provider: string, value: string) =>
    setInputs((prev) => ({ ...prev, [provider]: value }));

  const handleSaveCredential = async (provider: string) => {
    const value = (inputs[provider] ?? '').trim();
    if (!value || saving) return;
    setSaving(provider);
    setErrors((prev) => ({ ...prev, [provider]: '' }));
    try {
      await modelsAPI.saveCredential(provider, value);
      setInput(provider, '');
      setSavedFlash(provider);
      setTimeout(() => setSavedFlash((p) => (p === provider ? null : p)), 2500);
      await refresh();
      await loadModels();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [provider]: (e as Error).message }));
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteCredential = async (provider: string) => {
    if (!confirm(`Remove the saved ${PROVIDER_LABELS[provider] ?? provider} credential?`)) return;
    try {
      await modelsAPI.deleteCredential(provider);
      setErrors((prev) => ({ ...prev, [provider]: '' }));
      await refresh();
      await loadModels();
    } catch (e) {
      setErrors((prev) => ({ ...prev, [provider]: (e as Error).message }));
    }
  };

  const handleToggle = async (model: CatalogModel) => {
    if (togglePending) return;
    setTogglePending(model.id);
    try {
      await modelsAPI.setModelEnabled(model.id, !model.enabled);
      setCatalog((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, enabled: !model.enabled } : m))
      );
      await loadModels();
    } catch {
      // leave state as-is; next refresh will reconcile
    } finally {
      setTogglePending(null);
    }
  };

  const statusChip = (provider: string) => {
    const status = providers[provider];
    if (!status?.configured) return <span className="mgr-chip mgr-chip-off">Not configured</span>;
    return (
      <span className="mgr-chip mgr-chip-on">
        {status.source === 'env'
          ? provider === 'ollama' ? 'URL from .env' : 'Key from .env'
          : provider === 'ollama' ? 'URL saved' : 'Key saved'}
      </span>
    );
  };

  const credentialRow = (provider: string) => {
    const status = providers[provider];
    const isOllama = provider === 'ollama';
    return (
      <>
        <div className="mgr-key-row">
          <input
            className="mgr-key-input"
            type={isOllama ? 'text' : 'password'}
            placeholder={KEY_PLACEHOLDERS[provider]}
            value={inputs[provider] ?? ''}
            onChange={(e) => setInput(provider, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveCredential(provider)}
          />
          <button
            className="btn btn-primary mgr-key-save"
            disabled={!(inputs[provider] ?? '').trim() || saving !== null}
            onClick={() => handleSaveCredential(provider)}
          >
            {saving === provider ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
            {saving === provider ? 'Validating...' : 'Save'}
          </button>
          {status?.source === 'db' && (
            <button
              className="mgr-key-remove"
              title="Remove saved credential"
              onClick={() => handleDeleteCredential(provider)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        {saving === provider && (
          <p className="mgr-key-hint">Checking the {isOllama ? 'server' : 'key'} with a quick live call...</p>
        )}
        {errors[provider] && (
          <p className="mgr-key-error">
            <AlertTriangle size={12} /> {errors[provider]}
          </p>
        )}
        {savedFlash === provider && !errors[provider] && (
          <p className="mgr-key-saved">
            <CheckCircle2 size={12} /> Validated and saved.
          </p>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <div className="model-mgr-page">
        <div className="muse-lib-topbar">
          <button className="muse-lib-back-btn" onClick={closeModelManager}>
            <ArrowLeft size={15} /> Back to Chats
          </button>
        </div>
        <div className="model-mgr-loading"><Loader2 size={20} className="spin" /></div>
      </div>
    );
  }

  const ollamaModels = providers.ollama?.models ?? [];

  return (
    <div className="model-mgr-page">
      <div className="muse-lib-topbar">
        <button className="muse-lib-back-btn" onClick={closeModelManager}>
          <ArrowLeft size={15} /> Back to Chats
        </button>
        <span className="muse-lib-topbar-hint">
          Add API keys, choose which models appear in the picker, and connect a local Ollama server.
        </span>
      </div>

      <div className="model-mgr-body">
        <h2 className="model-mgr-title">Model Manager</h2>

        {KEY_PROVIDERS.map((provider) => {
          const models = catalog.filter((m) => m.provider === provider);
          const configured = providers[provider]?.configured;
          return (
            <section key={provider} className="mgr-section">
              <div className="mgr-section-header">
                <h3>{PROVIDER_LABELS[provider]}</h3>
                {statusChip(provider)}
              </div>
              {credentialRow(provider)}
              <div className="mgr-model-list">
                {models.map((m) => (
                  <button
                    key={m.id}
                    className={`mgr-model-row ${m.enabled ? 'mgr-model-enabled' : ''}`}
                    onClick={() => handleToggle(m)}
                    disabled={togglePending !== null}
                    title={m.enabled ? 'Click to hide from the picker' : 'Click to show in the picker'}
                  >
                    {m.enabled ? (
                      <CheckCircle2 size={15} className="mgr-model-check" />
                    ) : (
                      <Circle size={15} className="mgr-model-uncheck" />
                    )}
                    <span className="mgr-model-text">
                      <span className="mgr-model-name">
                        {m.name}
                        {m.is_default && <span className="mgr-default-badge">default</span>}
                      </span>
                      <span className="mgr-model-desc">{m.description}</span>
                    </span>
                    {m.enabled && !configured && (
                      <span className="mgr-model-warn" title="Enabled, but sends will fail until a key is added">
                        <AlertTriangle size={13} /> no key
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        <section className="mgr-section">
          <div className="mgr-section-header">
            <h3>{PROVIDER_LABELS.ollama}</h3>
            {statusChip('ollama')}
          </div>
          <p className="mgr-section-note">
            Run chat models entirely on your own machine — free and offline. Install Ollama, pull a
            model (e.g. <code>ollama pull llama3</code>), then save the server URL here. Discovered
            models appear in the picker automatically.
          </p>
          {credentialRow('ollama')}
          {providers.ollama?.configured && (
            <div className="mgr-ollama-status">
              <div className="mgr-ollama-status-line">
                <Server size={14} />
                {ollamaModels.length > 0
                  ? `Connected — ${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''} found`
                  : 'Server configured, but no models found (is Ollama running?)'}
                <button className="mgr-ollama-refresh" title="Re-check the server" onClick={refresh}>
                  <RefreshCw size={13} />
                </button>
              </div>
              {ollamaModels.length > 0 && (
                <div className="mgr-ollama-tags">
                  {ollamaModels.map((tag) => (
                    <span key={tag} className="mgr-ollama-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
