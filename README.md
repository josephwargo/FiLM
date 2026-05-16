# FiLM — File-based LLM Management

A local chat app where you actually own and organize your conversations. Think of it like a file manager (Finder, Windows Explorer) bolted onto a ChatGPT-style interface — put chats in folders, upload documents, and explicitly tell the AI what background knowledge to use before it answers you.

```
You type a message
    → FiLM figures out what context you've attached
    → Sends your message + that context to Gemini
    → Streams the response back to you
```

Everything else in the UI is just organizing the inputs to that flow.

---

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Gemini API key — get one free at [aistudio.google.com](https://aistudio.google.com/app/apikey)

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r package_requirements.txt
```

Create a `.env` file in `backend/`:
```
GEMINI_API_KEY=your_key_here
```

Start the server:
```bash
uvicorn main:app --reload
```

Backend runs at `http://localhost:8000`.

### 2. Frontend

In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. Both servers must be running at the same time.

> The SQLite database, ChromaDB vector store, and uploaded files are all auto-created in `backend/` on first run. Nothing to configure.

### 3. Tests

```bash
cd backend
pip install pytest httpx   # one-time
pytest tests/ -v
```

---

## How It Works

### Where your data lives

FiLM uses two databases:

**SQLite** (`backend/film.db`) is the source of truth for everything you can see and name — chats, messages, folders, uploaded files, and context attachments. Think of it as the filing cabinet.

**ChromaDB** (`backend/chroma_data/`) stores vector embeddings — a mathematical representation of what each message or file *means*. Every message and uploaded file gets embedded here when first saved, linked to SQLite by the same UUID.

Raw uploaded files (PDFs, text, Markdown) live on disk in `backend/uploads/`. SQLite tracks their metadata; ChromaDB holds their extracted text.

### How context works

When you attach a chat or file and send a message:

1. FiLM looks up your attachments for the current chat in SQLite
2. For each attached **chat** — pulls the full message history and formats it as a transcript
3. For each attached **file** — fetches the extracted text from ChromaDB by ID
4. Bundles everything into a `<context>` block prepended to your message
5. Sends the whole thing to Gemini and streams the response back

What you attach is exactly what gets sent — no hidden filtering.

### How the file system works

The folder structure is purely organizational and doesn't affect how the AI works. It's metadata in SQLite.

- **Chat folders** (left sidebar) — organize your conversations
- **File folders** (right panel) — organize your uploaded files

Both support unlimited nesting. Moving something between folders just updates a field in SQLite — nothing moves on disk. Deleting a folder never deletes its contents: chats become unfiled, child folders are promoted to the grandparent.

### How the LLM connection works

FiLM uses **Gemini 2.0 Flash**. Every message is a fresh API call — Gemini is stateless, and FiLM reconstructs the full conversation history from SQLite on each send. Responses stream back word-by-word using SSE (Server-Sent Events).

### How embeddings work

When you save a message or upload a file, FiLM converts the text into ~384 numbers using **all-MiniLM-L6-v2** — a small model that runs entirely on your machine, no API call. These numbers encode the *meaning* of the text and are stored in ChromaDB. This is what makes semantic search possible (finding content by meaning, not just keywords). The search capability is built in and wired up — automatic retrieval is a planned enhancement.

### How Muses work

A Muse is a named AI personality you create and assign to a chat. You give it a name, an optional description, and a **system prompt** — a set of instructions that shapes how the AI responds in that chat (its tone, role, constraints, etc.).

When a chat has a Muse assigned, the system prompt is injected into every Gemini call for that chat via Gemini's native system instruction channel. Switching or removing the Muse takes effect on the next message. Muses are reusable — one Muse can be applied to many different chats.

The MusePicker lives in the chat header. Click it to assign a Muse, create a new one, or edit/delete existing ones.

### What "RAG" means

RAG = Retrieval-Augmented Generation. Before sending your question to the AI, add relevant background to the prompt. In FiLM you do the retrieval manually — you pick which chats and files to attach. A future version will surface relevant context automatically.

---

## Troubleshooting

**"GEMINI_API_KEY not found"**
- Make sure a `.env` file exists in `backend/` (not the project root)
- Key must be unquoted: `GEMINI_API_KEY=your_key` not `GEMINI_API_KEY="your_key"`

**ChromaDB errors on startup**
- Delete `backend/chroma_data/` and restart — this resets the vector store with no data loss (embeddings are regenerated from SQLite on next upload/message)

**Port already in use**
- Backend: add `--port 8001` to the uvicorn command and update the proxy target in `vite.config.ts`
- Frontend: Vite auto-increments to the next available port

---

## Stack

| Layer | Technology |
|-------|-----------|
| LLM | Gemini 2.0 Flash (Google AI) |
| Embeddings | all-MiniLM-L6-v2 (local, via Sentence Transformers) |
| Vector DB | ChromaDB (local) |
| Backend | FastAPI + Python |
| Frontend | React + Vite + TypeScript |
| Metadata DB | SQLite via SQLAlchemy |
| State | Zustand |
| PDF parsing | pypdf |

**Cost to run: $0** — Gemini free tier (1,500 req/day), everything else is local.

---

## Roadmap

- [x] Chat interface with streaming responses and markdown rendering
- [x] Virtual file system — chat folders with unlimited nesting
- [x] RAG context system — attach chats and files as context
- [x] File folders — organize uploaded files, attach entire folders at once
- [x] API test suite (57 tests — chats, folders, context, Muses, recursive context)
- [x] Muses — custom AI personalities with their own system prompts, assignable per chat
- [ ] Chat slicing — attach only a portion of a chat's history
- [ ] Search across all chats
