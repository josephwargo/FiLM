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
   - [x] Real-time streaming in the UI (SSE via ReadableStream)
   - [x] Markdown rendering for code blocks and formatting (react-markdown + rehype-highlight)
   - [x] Responsive design (context panel hides ≤900px)

2. **Virtual File System**
   - [x] Create folders and subfolders to organize chats
   - [x] Move, rename, and delete chats
   - [x] Drag & drop chats into folders
   - [x] Drag & drop folders into other folders (unlimited nesting)
   - [x] "Chat Folders" and "Unfiled Chats" section labels for clarity
   - [x] Collapsible sidebar (collapses to icon strip, restores exact width)
   - [x] Drag-to-resize sidebar
   - [ ] Search across all chats

3. **Context/RAG System**
   - [x] Select past chats to include as context for new conversations
   - [x] Upload files (PDF, TXT, MD) to use as context
   - [x] PDF text extraction with pypdf
   - [x] Visual indicator showing what context is attached to current chat
   - [x] Drag & drop context panel with "Current Context" drop zone
   - [x] Context persistence per chat
   - [x] Delete uploaded files
   - [x] File folders to organize uploaded files (unlimited nesting)
   - [x] Drag files into file folders; drag file folders into other file folders
   - [x] Attach entire file folder as context (recursively attaches all files)
   - [x] Collapsible, resizable context panel with indigo visual theme

4. **UI / Layout**
   - [x] FiLM logo in fixed topbar (not embedded in sidebar)
   - [x] "Library" header on sidebar mirrors "Context" header on context panel
   - [x] Sidebar: red/pink accent palette
   - [x] Context panel: indigo accent palette (visually distinct)
   - [x] Both panels collapsible and drag-to-resize

## Technical Requirements

### Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (React)                           │
│  Topbar | Sidebar (Library) | Chat Area | Context Panel      │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                 Backend (FastAPI/Python)                       │
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
| **Markdown** | react-markdown + rehype-highlight | Syntax highlighting |
| **Icons** | Lucide React | Modern icon set |

### API Endpoints (Implemented)
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
GET    /api/folders                       - List full folder tree (recursive)
POST   /api/folders                       - Create folder
PATCH  /api/folders/:id                   - Rename / nest folder
DELETE /api/folders/:id                   - Delete folder

# Context
GET    /api/context/:chat_id              - Get attachments for a chat
POST   /api/context/attach               - Attach chat/file as context
DELETE /api/context/detach/:attachment_id - Remove context attachment

# Uploaded Files
GET    /api/context/files                 - List all uploaded files
POST   /api/context/files/upload          - Upload file for RAG (PDF, TXT, MD)
PATCH  /api/context/files/:id             - Move file to a file folder
DELETE /api/context/files/:id             - Delete uploaded file

# File Folders
GET    /api/context/file-folders          - List file folder tree (recursive)
POST   /api/context/file-folders          - Create file folder
PATCH  /api/context/file-folders/:id      - Rename / nest file folder
DELETE /api/context/file-folders/:id      - Delete file folder
```

### Data Models (Implemented)
```
Chat:
  - id: string (UUID)
  - title: string
  - folder_id: string | null  (FK to Folder)
  - messages: Message[]
  - created_at: datetime
  - updated_at: datetime

Message:
  - id: string (UUID)
  - chat_id: string (FK to Chat)
  - role: "user" | "assistant"
  - content: string
  - created_at: datetime

Folder:  (chat folders)
  - id: string (UUID)
  - name: string
  - parent_id: string | null  (self-referential FK)
  - created_at: datetime

ContextAttachment:
  - id: string (UUID)
  - chat_id: string (FK to Chat)
  - source_type: "chat" | "file"
  - source_id: string
  - created_at: datetime

UploadedFile:
  - id: string (UUID)
  - filename: string (stored filename)
  - original_filename: string
  - content_type: string
  - size: int
  - file_folder_id: string | null  (FK to FileFolder)
  - created_at: datetime

FileFolder:  (file folders)
  - id: string (UUID)
  - name: string
  - parent_id: string | null  (self-referential FK)
  - created_at: datetime
```

## Design Requirements

### Name
**FiLM** (File-based LLM Management)

### Visual Identity
- Looks like a traditional AI chat app at first glance
- Fixed topbar with FiLM logo
- Collapsible, resizable sidebar on the left ("Library") — red/pink accent
- Chat panel in the center with markdown + real-time streaming
- Collapsible, resizable context panel on the right — indigo accent (visually distinct from sidebar)
- "Chat Folders" / "Unfiled Chats" labels make the sidebar's purpose clear
- "File Folders" / "Unfiled Files" sections in the context panel for file organization

### UI Layout
```
┌──────────────────────────────────────────────────────┐
│  FiLM                                    [topbar]    │
├──────────┬─────────────────────────┬─────────────────┤
│          │                         │  Context        │
│ Library  │      Chat Area          │                 │
│          │   (markdown + stream)   │  [Chat Folders] │
│ [Chat    │                         │  [File Folders] │
│  Folders]│  [Messages]             │  [Files]        │
│          │                         │                 │
│ [Unfiled]│  [Input Box]            │  [Drop Zone]    │
└──────────┴─────────────────────────┴─────────────────┘
  ↕ resize                             ↕ resize
  ← collapse                           collapse →
```

## Cost Estimate (MVP)
| Item | Cost |
|------|------|
| Gemini API | $0 (free tier: 1500 req/day) |
| Sentence Transformers | $0 (runs locally) |
| ChromaDB | $0 (local/self-hosted) |
| **Total MVP** | **$0** |

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
- [x] Nested chat folders (drag folders into folders)
- [x] Collapsible + resizable sidebar

### Phase 3: RAG/Context - COMPLETE
- [x] ChromaDB integration
- [x] Embed and store chat messages
- [x] Context selection UI with drag & drop
- [x] Inject context into prompts
- [x] Context persistence per chat

### Phase 4: Polish - COMPLETE
- [x] File upload support (PDF, TXT, MD)
- [x] PDF text extraction
- [x] File deletion
- [x] Markdown rendering in chat (react-markdown + rehype-highlight)
- [x] Real-time streaming in UI (SSE)
- [x] Responsive design
- [x] File folders (organize uploaded files; nested; drag & drop)
- [x] Attach file folder as context (bulk attach all files recursively)
- [x] FiLM logo in topbar (not in sidebar)
- [x] Collapsible + resizable context panel
- [x] Visual distinction: sidebar (red) vs context panel (indigo)
- [ ] Search across chats

### Phase 5: Personas - PLANNED

## Future Enhancements
- [ ] Search across all chats
- [ ] Export/import chats
- [ ] User authentication
- [ ] Electron desktop wrapper
- [ ] Web page / URL ingestion as context
