import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useChatStore } from '../store/chatStore';

export function ChatArea() {
  const { currentChat, isSending, sendMessage, createChat } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat?.messages]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const message = input.trim();
    setInput('');

    if (!currentChat) {
      // Create a new chat first
      await createChat();
    }

    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentChat) {
    return (
      <div className="chat-area">
        <div className="chat-empty">
          <div className="chat-empty-content">
            <h2>Welcome to FiLM</h2>
            <p>File-based LLM Management</p>
            <p className="chat-empty-hint">
              Create a new chat or select an existing one to get started.
            </p>
          </div>
        </div>
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              className="chat-input"
              placeholder="Type a message to start a new chat..."
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
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <h2>{currentChat.title}</h2>
      </div>

      <div className="chat-messages">
        {currentChat.messages.length === 0 ? (
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
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
          ))
        )}

        {isSending && (
          <div className="message message-assistant">
            <div className="message-avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder="Type your message..."
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
    </div>
  );
}
