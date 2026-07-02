import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextPanel } from './components/ContextPanel';
import { MuseLibrary } from './components/MuseLibrary';
import { ModelManager } from './components/ModelManager';
import { useChatStore } from './store/chatStore';
import 'highlight.js/styles/github-dark.css';
import './App.css';

function App() {
  const loadMuses = useChatStore((s) => s.loadMuses);
  const loadModels = useChatStore((s) => s.loadModels);
  const view = useChatStore((s) => s.view);

  useEffect(() => {
    loadMuses();
    loadModels();
  }, [loadMuses, loadModels]);

  return (
    <div className="app">
      <div className="topbar">
        <span className="topbar-logo">FiLM</span>
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
