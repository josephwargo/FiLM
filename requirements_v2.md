# FiLM - Web App Requirements v2

## Overview
Tool to enable better management, organization, and storage of LLM chats & context.

### Core Features
- AI chatbot that allows users to store each chat in a virtual file structure for easier management of past chats
- Ability for users to give a past chat (& other files via RAG) as context to another chat (new or existing)

### Detailed Feature Breakdown
1. **Chat Interface**
   - Send messages to LLM and receive responses
   - Real-time streaming responses
   - Markdown rendering for code blocks and formatting

2. **Virtual File System**
   - Create folders and subfolders to organize chats
   - Move, rename, and delete chats
   - Search across all chats

3. **Context/RAG System**
   - Select past chats to include as context for new conversations
   - Upload files (PDF, TXT, MD) to use as context
   - Visual indicator showing what context is attached to current chat

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

### Tech Stack (MVP)
| Component | Technology | Why |
|-----------|------------|-----|
| **LLM** | Gemini API (free tier) | $0 cost, 1500 req/day, good quality |
| **Embeddings** | Gemini Embeddings (free) | $0 cost, same API, good multilingual |
| **Vector DB** | ChromaDB | Local, free, supports metadata for folders |
| **Backend** | FastAPI (Python) | Easy LangChain integration |
| **Frontend** | React + Vite | Fast, modern, good ecosystem |
| **Metadata DB** | SQLite (MVP) → Postgres (scale) | Simple start, easy migration |
| **RAG Framework** | LangChain | Handles chunking, retrieval, context injection |

### API Endpoints (Draft)
```
POST   /api/chat                 - Send message, get response
GET    /api/chats                - List all chats
POST   /api/chats                - Create new chat
GET    /api/chats/:id            - Get chat history
DELETE /api/chats/:id            - Delete chat
PATCH  /api/chats/:id            - Update chat (rename, move folder)

GET    /api/folders              - List folder structure
POST   /api/folders              - Create folder
DELETE /api/folders/:id          - Delete folder

POST   /api/context/attach       - Attach chat/file as context
DELETE /api/context/detach       - Remove context
POST   /api/files/upload         - Upload file for RAG
```

### Data Models (Draft)
```
Chat:
  - id: string
  - title: string
  - folder_id: string (nullable)
  - messages: Message[]
  - created_at: datetime
  - updated_at: datetime

Message:
  - id: string
  - chat_id: string
  - role: "user" | "assistant"
  - content: string
  - timestamp: datetime

Folder:
  - id: string
  - name: string
  - parent_id: string (nullable)

ContextAttachment:
  - id: string
  - chat_id: string (the chat using this context)
  - source_type: "chat" | "file"
  - source_id: string
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

### Phase 1: Core Chat (Week 1)
- [ ] Basic chat UI with Gemini integration
- [ ] Message history persistence (SQLite)
- [ ] Basic styling

### Phase 2: File System (Week 2)
- [ ] Folder structure UI
- [ ] Create/rename/delete/move chats and folders
- [ ] SQLite schema for folders

### Phase 3: RAG/Context (Week 3)
- [ ] ChromaDB integration
- [ ] Embed and store chat messages
- [ ] Context selection UI
- [ ] Inject context into prompts

### Phase 4: Polish (Week 4)
- [ ] File upload support
- [ ] Search across chats
- [ ] UI polish and responsive design

## Additional Notes
- Start with local-only (no auth) for MVP
- Add user accounts in v2 if needed
- Consider Electron wrapper for desktop app later
