# Chat Interface — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Complete

## Overview

The chat interface is the core interaction surface of FiLM. Users send messages, receive AI responses, and view conversation history. It should feel familiar (like any modern chat app) while surfacing FiLM-specific features like attached context.

## User Stories

- As a user, I can send a message and receive an AI response in the same view
- As a user, I can see my full message history for the current chat
- As a user, I can see formatted code blocks and markdown in AI responses
- As a user, I can see which context is attached to the current chat

## Functional Requirements

### Implemented
- Send messages to Gemini 2.0 Flash and receive responses
- Persist message history in SQLite
- Real-time streaming responses in the UI (SSE; backend streams, frontend renders token-by-token with blinking cursor)
- Markdown rendering with syntax-highlighted code blocks (react-markdown + rehype-highlight, github-dark theme)
- Responsive layout (context panel hides ≤900px, sidebar collapses ≤600px)
- Visual indicator showing attached context

## Non-Functional Requirements

- Response latency should feel acceptable on Gemini free tier
- Message history must persist across sessions (SQLite)

## API Surface

```
POST /api/chats/:id/messages        - Send message, get response
POST /api/chats/:id/messages/stream - Send message, get streaming response
GET  /api/chats/:id                 - Get chat with full message history
```

## Data Models

```
Chat:      id, title, folder_id, created_at, updated_at
Message:   id, chat_id, role (user|assistant), content, created_at
```

## Implementation Notes

- Streaming uses `fetch` + `ReadableStream` to consume SSE from the backend (EventSource doesn't support POST). The store accumulates chunks in `streamingContent` state and flushes to `currentChat.messages` on the `done` event.
- The backend streaming endpoint was updated to load context from DB attachments (same logic as the non-streaming endpoint) and now sends the auto-generated chat title in the `done` event so the header updates immediately without a separate fetch.
- Syntax highlighting: `rehype-highlight` runs as a rehype plugin; `highlight.js/styles/github-dark.css` is imported globally in `App.tsx`.
