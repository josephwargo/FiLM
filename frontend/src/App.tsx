import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextPanel } from './components/ContextPanel';
import { MuseLibrary } from './components/MuseLibrary';
import { ModelManager } from './components/ModelManager';
import { LoginScreen } from './components/LoginScreen';
import { useChatStore } from './store/chatStore';
import { authAPI } from './services/api';
import 'highlight.js/styles/github-dark.css';
import './App.css';

function App() {
  const loadMuses = useChatStore((s) => s.loadMuses);
  const loadModels = useChatStore((s) => s.loadModels);
  const view = useChatStore((s) => s.view);
  const goHome = useChatStore((s) => s.goHome);
  const [auth, setAuth] = useState<'checking' | 'required' | 'ok'>('checking');

  useEffect(() => {
    authAPI
      .status()
      .then((s) => setAuth(s.auth_required && !s.authenticated ? 'required' : 'ok'))
      .catch(() => setAuth('ok'));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setAuth('required');
    window.addEventListener('film-unauthorized', onUnauthorized);
    return () => window.removeEventListener('film-unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (auth !== 'ok') return;
    loadMuses();
    loadModels();
  }, [auth, loadMuses, loadModels]);

  if (auth === 'checking') return null;
  if (auth === 'required') return <LoginScreen onSuccess={() => setAuth('ok')} />;

  return (
    <div className="app">
      <div className="topbar">
        <button className="topbar-logo" onClick={goHome} title="Go to home">FiLM</button>
      </div>
      <div className="app-body">
        <Sidebar />
        {view === 'muse-library' ? <MuseLibrary /> : view === 'model-manager' ? <ModelManager /> : <ChatArea />}
        <ContextPanel />
      </div>
    </div>
  );
}

export default App;
