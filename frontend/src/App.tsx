import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextPanel } from './components/ContextPanel';
import 'highlight.js/styles/github-dark.css';
import './App.css';

function App() {
  return (
    <div className="app">
      <div className="topbar">
        <span className="topbar-logo">FiLM</span>
      </div>
      <div className="app-body">
        <Sidebar />
        <ChatArea />
        <ContextPanel />
      </div>
    </div>
  );
}

export default App;
