# FiLM — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (React)                       │
│  Topbar (FiLM logo)                                          │
│  ┌─────────────┬──────────────────────┬────────────────────┐ │
│  │  Sidebar    │      Chat Area        │   Context Panel    │ │
│  │ (Library)   │                       │   (indigo theme)   │ │
│  │  red theme  │  markdown + streaming │                    │ │
│  │  resizable  │                       │   resizable        │ │
│  │  collapsible│                       │   collapsible      │ │
│  └─────────────┴──────────────────────┴────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI/Python)                    │
│   Chat API  |  Folder API  |  Context API  |  RAG Pipeline   │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌────────────┐   ┌──────────┐
        │ Gemini   │   │ ChromaDB   │   │ SQLite   │
        │ API      │   │ (vectors)  │   │(metadata)│
        │ (free)   │   │            │   │          │
        └──────────┘   └────────────┘   └──────────┘
```

## Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| **LLM** | Gemini 2.0 Flash | Via google-genai SDK |
| **Embeddings** | Sentence Transformers | all-MiniLM-L6-v2 model, runs locally |
| **Vector DB** | ChromaDB | Local storage, metadata filtering |
| **Backend** | FastAPI (Python) | Async support, automatic OpenAPI docs |
| **Frontend** | React + Vite + TypeScript | Zustand for state management |
| **Metadata DB** | SQLite | SQLAlchemy ORM |
| **PDF Processing** | pypdf | Text extraction from PDFs |
| **Markdown** | react-markdown + rehype-highlight | Syntax highlighting via highlight.js |
| **Icons** | Lucide React | Modern icon set |

## API Endpoints

```
# Chats
GET    /api/chats                         - List all chats
POST   /api/chats                         - Create new chat
GET    /api/chats/:id                     - Get chat with messages
DELETE /api/chats/:id                     - Delete chat
PATCH  /api/chats/:id                     - Update chat (rename, move folder)
POST   /api/chats/:id/messages            - Send message, get AI response
POST   /api/chats/:id/messages/stream     - Send message, get SSE streaming response

# Chat Folders
GET    /api/folders                       - List full folder tree (recursive JSON)
POST   /api/folders                       - Create folder
PATCH  /api/folders/:id                   - Update folder (rename, set parent_id for nesting)
DELETE /api/folders/:id                   - Delete folder (promotes children to grandparent)

# Context Attachments
GET    /api/context/:chat_id              - Get all attachments for a chat
POST   /api/context/attach               - Attach a chat or file as context
DELETE /api/context/detach/:attachment_id - Remove a context attachment

# Uploaded Files
GET    /api/context/files                 - List all uploaded files (includes file_folder_id)
POST   /api/context/files/upload          - Upload file for RAG (PDF, TXT, MD)
PATCH  /api/context/files/:id             - Move file to a file folder
DELETE /api/context/files/:id             - Delete uploaded file

# File Folders
GET    /api/context/file-folders          - List file folder tree (recursive JSON)
POST   /api/context/file-folders          - Create file folder
PATCH  /api/context/file-folders/:id      - Update file folder (rename, nest inside another)
DELETE /api/context/file-folders/:id      - Delete file folder (promotes children to grandparent)
```

## Data Models

```
Chat:
  - id:         string (UUID)
  - title:      string
  - folder_id:  string | null  (FK to Folder)
  - messages:   Message[]
  - created_at: datetime
  - updated_at: datetime

Message:
  - id:         string (UUID)
  - chat_id:    string (FK to Chat)
  - role:       "user" | "assistant"
  - content:    string
  - created_at: datetime

Folder:  (chat folders — shown in Sidebar)
  - id:         string (UUID)
  - name:       string
  - parent_id:  string | null  (self-referential FK — unlimited nesting)
  - created_at: datetime

ContextAttachment:
  - id:          string (UUID)
  - chat_id:     string (FK to Chat — the chat using this context)
  - source_type: "chat" | "file"
  - source_id:   string
  - created_at:  datetime

UploadedFile:
  - id:                string (UUID)
  - filename:          string (stored filename on disk)
  - original_filename: string
  - content_type:      string
  - size:              int
  - file_folder_id:    string | null  (FK to FileFolder)
  - created_at:        datetime

FileFolder:  (file folders — shown in Context Panel)
  - id:         string (UUID)
  - name:       string
  - parent_id:  string | null  (self-referential FK — unlimited nesting)
  - created_at: datetime
```

## Frontend Layout

```
App (column flex)
├── Topbar                    — FiLM logo, fixed height
└── App Body (row flex)
    ├── Sidebar               — "Library" header; red/pink accent; collapsible + resizable
    │   ├── Chat Folders      — nested folder tree, drag & drop (folders + chats)
    │   └── Unfiled Chats     — root-level chats drop zone
    ├── ChatArea              — markdown rendering, SSE streaming, blinking cursor
    └── ContextPanel          — "Context" header; indigo accent; collapsible + resizable
        ├── Current Context   — drop zone for attaching context
        ├── Chat Folders      — mirrors sidebar folder tree (for selection)
        ├── Unfiled Chats     — root-level chats (for selection)
        ├── File Folders      — nested file folder tree, drag & drop
        └── Unfiled Files     — files not in any folder
```

## State Management (Zustand)

```
chatStore:
  - chats[]              — list of ChatListItem
  - currentChat          — full Chat with messages
  - folderTree[]         — recursive FolderTreeItem[]
  - streamingContent     — string | null (in-flight SSE chunk accumulator)
  - isSending            — boolean
  + loadChats, loadFolderTree, selectChat, createChat, deleteChat
  + createFolder, deleteFolder, moveChat
  + sendMessage (SSE streaming via ReadableStream)
```

## Streaming Architecture

Streaming uses SSE (Server-Sent Events) over a POST endpoint. `EventSource` was not used because it doesn't support POST requests. Instead:

1. Frontend opens a `fetch` POST to `/api/chats/:id/messages/stream`
2. Backend returns `StreamingResponse` with `text/event-stream` content type
3. Frontend reads `response.body.getReader()` in a loop
4. Each `data: {...}` line is parsed: `chunk` events accumulate into `streamingContent`; a `done` event flushes content into the messages array and clears `streamingContent`
5. A blinking cursor (`.streaming-cursor`) renders while `isSending && streamingContent !== null`

## Migrations

New columns are added via inline `ALTER TABLE` at startup in `main.py`. Each statement is wrapped in try/except so it silently no-ops if the column already exists. This avoids requiring users to manually delete `film.db` after pulling updates.

## Local Storage

| Store | Location | Purpose |
|-------|----------|---------|
| SQLite DB | `backend/film.db` | Chat, folder, file, and context metadata |
| ChromaDB | `backend/chroma_data/` | Embedded vectors for RAG retrieval |
| Uploaded files | `backend/uploads/` | Raw uploaded files (PDF, TXT, MD) |

## Cost

| Item | Cost |
|------|------|
| Gemini API | $0 (free tier: 1,500 req/day) |
| Sentence Transformers | $0 (runs locally) |
| ChromaDB | $0 (local/self-hosted) |
| **Total MVP** | **$0** |
