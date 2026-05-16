import { useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextPanel } from './components/ContextPanel';
import { MuseLibrary } from './components/MuseLibrary';
import { useChatStore } from './store/chatStore';
import 'highlight.js/styles/github-dark.css';
import './App.css';

type View = 'chat' | 'muse-library';

function App() {
  const loadMuses = useChatStore((s) => s.loadMuses);
  const [view, setView] = useState<View>('chat');

  useEffect(() => {
    loadMuses();
  }, [loadMuses]);

  return (
    <div className="app">
      <div className="topbar">
        <span className="topbar-logo">FiLM</span>
        <button
          className={`topbar-nav-btn ${view === 'muse-library' ? 'topbar-nav-btn-active' : ''}`}
          onClick={() => setView((v) => (v === 'muse-library' ? 'chat' : 'muse-library'))}
        >
          <Wand2 size={13} />
          Muses
        </button>
      </div>
      <div className="app-body">
        {view === 'muse-library' ? (
          <MuseLibrary />
        ) : (
          <>
            <Sidebar />
            <ChatArea />
            <ContextPanel />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
