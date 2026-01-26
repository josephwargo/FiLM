# FiLM - Product Requirements

## Overview
Tool to enable better management, organization, and storage of LLM chats & context.

### Core Features
- AI chatbot that allows users to store each chat in a virtual file structure for easier management of past chats
- Ability for users to give a past chat (& other files via RAG) as context to another chat (new or existing)

### Detailed Feature Breakdown
1. **Chat Interface**
   - [x] Send messages to LLM and receive responses
   - [x] Streaming responses endpoint (UI uses non-streaming)
   - [ ] Markdown rendering for code blocks and formatting

2. **Virtual File System**
   - [x] Create folders and subfolders to organize chats
   - [x] Move, rename, and delete chats
   - [x] Drag & drop chats into folders
   - [ ] Search across all chats

3. **Context/RAG System**
   - [x] Select past chats to include as context for new conversations
   - [x] Upload files (PDF, TXT, MD) to use as context
   - [x] PDF text extraction with pypdf
   - [x] Visual indicator showing what context is attached to current chat
   - [x] Drag & drop context panel with "Current Context" drop zone
   - [x] Context persistence per chat
   - [x] Delete uploaded files

## Technical Requirements

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│         Chat UI  |  File Explorer  |  Context Panel │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Backend (FastAPI/Node)               │
│   Chat API  |  File Management  |  RAG Pipeline     │
└─────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐   ┌────────────┐   ┌──────────┐
    │ Gemini   │   │ ChromaDB   │   │ SQLite/  │
    │ API      │   │ (vectors)  │   │ Postgres │
    │ (free)   │   │            │   │ (metadata)│
    └──────────┘   └────────────┘   └──────────┘
```

### Tech Stack (Implemented)
| Component | Technology | Notes |
|-----------|------------|-------|
| **LLM** | Gemini 2.0 Flash | Via google-genai SDK |
| **Embeddings** | Sentence Transformers | all-MiniLM-L6-v2 model |
| **Vector DB** | ChromaDB | Local storage, metadata filtering |
| **Backend** | FastAPI (Python) | Async support, automatic OpenAPI docs |
| **Frontend** | React + Vite + TypeScript | Zustand for state management |
| **Metadata DB** | SQLite | SQLAlchemy ORM |
| **PDF Processing** | pypdf | Text extraction from PDFs |
| **Icons** | Lucide React | Modern icon set |

### API Endpoints (Implemented)
```
# Chats
GET    /api/chats                - List all chats
POST   /api/chats                - Create new chat
GET    /api/chats/:id            - Get chat with messages
DELETE /api/chats/:id            - Delete chat
PATCH  /api/chats/:id            - Update chat (rename, move folder)
POST   /api/chats/:id/messages   - Send message, get AI response
POST   /api/chats/:id/messages/stream - Send message, get streaming response

# Folders
GET    /api/folders              - List folder structure
POST   /api/folders              - Create folder
DELETE /api/folders/:id          - Delete folder

# Context
GET    /api/context/:chat_id     - Get attachments for a chat
POST   /api/context/attach       - Attach chat/file as context
DELETE /api/context/:attachment_id - Remove context attachment

# Files
GET    /api/context/files        - List all uploaded files
POST   /api/context/files/upload - Upload file for RAG (PDF, TXT, MD)
DELETE /api/context/files/:id    - Delete uploaded file
```

### Data Models (Implemented)
```
Chat:
  - id: string (UUID)
  - title: string
  - folder_id: string (nullable, FK to Folder)
  - messages: Message[]
  - created_at: datetime
  - updated_at: datetime

Message:
  - id: string (UUID)
  - chat_id: string (FK to Chat)
  - role: "user" | "assistant"
  - content: string
  - created_at: datetime

Folder:
  - id: string (UUID)
  - name: string
  - parent_id: string (nullable, FK to Folder)
  - created_at: datetime

ContextAttachment:
  - id: string (UUID)
  - chat_id: string (FK to Chat - the chat using this context)
  - source_type: "chat" | "file"
  - source_id: string
  - created_at: datetime

UploadedFile:
  - id: string (UUID)
  - filename: string (stored filename)
  - original_filename: string
  - content_type: string
  - file_size: int
  - created_at: datetime
```

## Design Requirements

### Name
**FiLM** (File-based LLM Management)

### Visual Identity
- Looks like a traditional AI chat app at first glance
- File explorer panel on the left (like VS Code/file manager)
- Chat panel in the center
- Context panel on the right (collapsible)
- Distinct visual cues that this is different:
  - Folder icons and tree structure prominent
  - "Attached context" badges on chats
  - Different color scheme from typical chat apps

### UI Layout (Draft)
```
┌──────────┬────────────────────────┬──────────┐
│          │                        │ Context  │
│  Folders │      Chat Area         │  Panel   │
│  & Chats │                        │          │
│          │                        │ [Files]  │
│  [Tree]  │  [Messages]            │ [Chats]  │
│          │                        │          │
│          │  [Input Box]           │          │
└──────────┴────────────────────────┴──────────┘
```

## Cost Estimate (MVP)
| Item | Cost |
|------|------|
| Gemini API | $0 (free tier: 1500 req/day) |
| Gemini Embeddings | $0 (free tier) |
| ChromaDB | $0 (local/self-hosted) |
| Hosting (Vercel/Railway) | $0-5/mo |
| **Total MVP** | **$0-5/mo** |

## Development Phases

### Phase 1: Core Chat - COMPLETE
- [x] Basic chat UI with Gemini integration
- [x] Message history persistence (SQLite)
- [x] Basic styling (dark theme)

### Phase 2: File System - COMPLETE
- [x] Folder structure UI
- [x] Create/rename/delete/move chats and folders
- [x] SQLite schema for folders
- [x] Drag & drop chats into folders

### Phase 3: RAG/Context - COMPLETE
- [x] ChromaDB integration
- [x] Embed and store chat messages
- [x] Context selection UI with drag & drop
- [x] Inject context into prompts
- [x] Context persistence per chat

### Phase 4: Polish - IN PROGRESS
- [x] File upload support (PDF, TXT, MD)
- [x] PDF text extraction
- [x] File deletion
- [ ] Search across chats
- [ ] Markdown rendering in chat
- [ ] UI polish and responsive design

## Future Enhancements
- [ ] Search across all chats
- [ ] Markdown rendering for code blocks
- [ ] Real-time streaming in UI (backend ready)
- [ ] Subfolder support (nested folders)
- [ ] Export/import chats
- [ ] User authentication
- [ ] Electron desktop wrapper

## Additional Notes
- Currently local-only (no auth) for MVP
- Add user accounts in v2 if needed
- Consider Electron wrapper for desktop app later
