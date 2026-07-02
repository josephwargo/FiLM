import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, Bot, FolderTree, Paperclip, Wand2, AlertTriangle, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useChatStore } from '../store/chatStore';
import { ModelPicker } from './ModelPicker';

const MD_PLUGINS = [rehypeHighlight];

export function ChatArea() {
  const {
    currentChat, models, isSending, streamingContent, sendMessage, createChat,
    sendError, clearSendError, openModelManager,
  } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const message = input.trim();
    setInput('');
    if (!currentChat) await createChat();
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const providerName = (p: string | null) =>
    p ? { google: 'Google', anthropic: 'Anthropic', openai: 'OpenAI', ollama: 'Ollama' }[p] ?? p : 'The provider';

  const inputBox = (placeholder: string) => (
    <div className="chat-input-container">
      {sendError && (
        <div className={`send-error-banner ${sendError.type === 'auth' ? 'send-error-auth' : ''}`}>
          <AlertTriangle size={15} />
          <div className="send-error-text">
            <strong>
              {sendError.type === 'auth'
                ? `${providerName(sendError.provider)} rejected the API key`
                : `${providerName(sendError.provider)} couldn't respond`}
            </strong>
            <span>
              {sendError.type === 'auth'
                ? 'The key may be missing, invalid, or expired. Fix it in the Model Manager, then resend.'
                : sendError.message}
            </span>
          </div>
          <button
            className="send-error-action"
            onClick={() => {
              clearSendError();
              openModelManager();
            }}
          >
            Open Model Manager
          </button>
          <button className="send-error-dismiss" onClick={clearSendError} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="chat-input-wrapper">
        <textarea
          className="chat-input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="btn btn-primary btn-send"
          onClick={handleSend}
          disabled={!input.trim() || isSending}
        >
          {isSending ? <Loader2 size={20} className="spin" /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );

  if (!currentChat) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-content">
            <h2>Welcome to FiLM</h2>
            <p>File-based LLM Management</p>
            <div className="welcome-cards">
              <div className="welcome-card">
                <FolderTree size={18} />
                <strong>Library</strong>
                <span>Organize chats into folders in the left sidebar — drag to move them.</span>
              </div>
              <div className="welcome-card">
                <Paperclip size={18} />
                <strong>Context</strong>
                <span>Attach chats and files in the right panel so the AI knows your background.</span>
              </div>
              <div className="welcome-card">
                <Wand2 size={18} />
                <strong>Muses</strong>
                <span>Reusable AI personalities with their own pinned context — assign one per chat.</span>
              </div>
            </div>
            <p className="chat-empty-hint">Type a message below to start a new chat, or pick one from the Library.</p>
          </div>
        </div>
        {inputBox('Type a message to start a new chat...')}
      </div>
    );
  }

  const assistantModels = new Set(
    currentChat.messages
      .filter((m) => m.role === 'assistant' && m.model)
      .map((m) => m.model)
  );
  const showProvenance = assistantModels.size > 1;
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="chat-area">
      <div className="chat-header">
        <h2>{currentChat.title}</h2>
        <ModelPicker />
      </div>

      <div className="chat-messages">
        {currentChat.messages.length === 0 && streamingContent === null ? (
          <div className="chat-empty">
            <p>Start the conversation by typing a message below.</p>
          </div>
        ) : (
          currentChat.messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}
            >
              <div className="message-avatar">
                {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              <div className="message-content">
                <ReactMarkdown rehypePlugins={MD_PLUGINS}>{message.content}</ReactMarkdown>
                {showProvenance && message.role === 'assistant' && message.model && (
                  <div className="message-model-label">{modelName(message.model)}</div>
                )}
              </div>
            </div>
          ))
        )}

        {/* Streaming / loading state */}
        {isSending && (
          <div className="message message-assistant">
            <div className="message-avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              {streamingContent !== null && streamingContent.length > 0 ? (
                <div className="streaming-content">
                  <ReactMarkdown rehypePlugins={MD_PLUGINS}>{streamingContent}</ReactMarkdown>
                  <span className="streaming-cursor" />
                </div>
              ) : (
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {inputBox('Type your message...')}
    </div>
  );
}
