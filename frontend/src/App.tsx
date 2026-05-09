import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { ContextPanel } from './components/ContextPanel';
import 'highlight.js/styles/github-dark.css';
import './App.css';

function App() {
  return (
    <div className="app">
      <Sidebar />
      <ChatArea />
      <ContextPanel />
    </div>
  );
}

export default App;
