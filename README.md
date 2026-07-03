# FiLM — File-based LLM Management

A local chat app where you actually own and organize your conversations. Think of it like a file manager (Finder, Windows Explorer) bolted onto a ChatGPT-style interface — put chats in folders, upload documents, and explicitly tell the AI what background knowledge to use before it answers you.

```
You type a message
    → FiLM figures out what context you've attached
    → Sends your message + that context to the chat's model (Gemini by default)
    → Streams the response back to you
```

Everything else in the UI is just organizing the inputs to that flow.

---

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- A Gemini API key — get one free at [aistudio.google.com](https://aistudio.google.com/app/apikey) (Anthropic/OpenAI keys and local Ollama are optional add-ons via the in-app Model Manager)

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
5. Sends the whole thing to the chat's model and streams the response back

What you attach is exactly what gets sent — no hidden filtering.

### How the file system works

The folder structure is purely organizational and doesn't affect how the AI works. It's metadata in SQLite.

- **Chat folders** (left sidebar) — organize your conversations
- **File folders** (right panel) — organize your uploaded files

Both support unlimited nesting. Moving something between folders just updates a field in SQLite — nothing moves on disk. Deleting a folder never deletes its contents: chats become unfiled, child folders are promoted to the grandparent.

### How the LLM connection works

FiLM defaults to **Gemini 2.5 Flash**, but each chat can pick its own model via the model pill in the chat header — "Default" follows the app default, or pin a specific model for just that chat. The catalog spans four providers: **Google** (Gemini 2.5 Flash / Pro / Flash-Lite), **Anthropic** (Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5), **OpenAI** (GPT-5.5 / 5.4 mini / 5.4 nano), and **Ollama** (any model running on a local Ollama server — fully offline). Every assistant response is stamped with the model that produced it, and if a chat mixes models, a small label appears under each response. If a chat's saved model is ever retired, disabled, or its Ollama server goes away, FiLM quietly falls back to the default (your preference is kept in case the model returns). Every message is a fresh API call — the LLM is stateless, and FiLM reconstructs the full conversation history from SQLite on each send. Responses stream back word-by-word using SSE (Server-Sent Events).

### How the Model Manager works

Open it from **Manage Models** at the bottom of the model picker. Only Google models are enabled out of the box (FiLM's zero-cost path); Anthropic and OpenAI models are opt-in — paste an API key, and FiLM **validates it with a live call before saving** (a bad key is rejected on the spot with the provider's error). Keys are stored in the local SQLite database; a key in `backend/.env` (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`) works as a fallback and shows up as "Key from .env". Click a model row to show or hide it in the picker. For Ollama, save the server URL (usually `http://localhost:11434`) and every model the server reports appears in the picker automatically. If a send ever fails because a key is missing or revoked, a banner appears above the chat input naming the provider, with a one-click jump to the Model Manager.

### How embeddings work

When you save a message or upload a file, FiLM converts the text into ~384 numbers using **all-MiniLM-L6-v2** — a small model that runs entirely on your machine, no API call. These numbers encode the *meaning* of the text and are stored in ChromaDB. This is what makes semantic search possible (finding content by meaning, not just keywords). The search capability is built in and wired up — automatic retrieval is a planned enhancement.

### How Muses work

A Muse is a named AI personality you create and assign to a chat. You give it a name, an optional description, and a **system prompt** — a set of instructions that shapes how the AI responds in that chat (its tone, role, constraints, etc.).

When a chat has a Muse assigned, the system prompt is injected into every LLM call for that chat via the provider's native system-instruction channel (this works the same across Gemini, Claude, GPT, and Ollama). Switching or removing the Muse takes effect on the next message. Muses are reusable — one Muse can be applied to many different chats.

The Muse picker lives inside the **Current Context** card in the right-hand Context panel — click it to assign a Muse to the current chat, and whatever context that Muse pins appears read-only directly beneath it. All creating, editing, and deleting happens in one place: the **Muse Library** — open it via the "New Muse" / "Manage Muses" shortcuts in the picker or the pencil icon next to any Muse. The Library replaces only the middle column: the chat sidebar and Context panel stay put, so you drag chats from the left sidebar and files from the right panel straight onto a Muse's pinned context. Pinned context (chats and files, sliceable just like per-chat attachments) is staged locally — nothing persists until you hit **Save Changes**.

### How chat slicing works

Attaching a chat as context normally injects every message in that chat. If only the first part of a long chat is relevant, you can **slice** it: click the attached chat in the Current Context panel (look for the scissors icon) to expand an inline message timeline. Clicking a message sets it as the end of the slice; shift-clicking sets the start. Outside-range messages dim and only the in-range messages get sent to the model on the next message. Bounds are stored in SQLite, so they persist across sessions and survive re-opening the chat. Clear the slice to restore full inclusion. If a referenced message is later deleted, that bound silently falls back to the chat's natural start or end. Chats pinned to a Muse can be sliced the same way from inside the Muse Library.

### What "RAG" means

RAG = Retrieval-Augmented Generation. Before sending your question to the AI, add relevant background to the prompt. In FiLM you do the retrieval manually — you pick which chats and files to attach. A future version will surface relevant context automatically.

---

## Troubleshooting

**"GEMINI_API_KEY not found"**
- Make sure a `.env` file exists in `backend/` (not the project root)
- Key must be unquoted: `GEMINI_API_KEY=your_key` not `GEMINI_API_KEY="your_key"`
- Alternatively, paste the key into the **Model Manager** (Manage Models in the model picker) — no `.env` needed

**A send fails with "rejected the API key"**
- Open the Model Manager from the banner and re-save the provider's key — it's validated with a live call before it's stored

**ChromaDB errors on startup**
- Delete `backend/chroma_data/` and restart — this resets the vector store with no data loss (embeddings are regenerated from SQLite on next upload/message)

**Port already in use**
- Backend: add `--port 8001` to the uvicorn command and update the proxy target in `vite.config.ts`
- Frontend: Vite auto-increments to the next available port

---

## Deployment (single host)

FiLM ships as one Docker image: the `Dockerfile` builds the frontend, then FastAPI serves both the static app and the API from a single port — no CORS, no separate frontend host. All persistent data (SQLite, ChromaDB, uploads) lives under `FILM_DATA_DIR` (defaults to `/data` in the image), so the host needs a **persistent volume** — on an ephemeral filesystem your chats would be wiped every restart.

> **Warning — no authentication.** FiLM has no login. Anyone with the URL can read every chat, upload files, and burn through your API keys. Only deploy somewhere private, keep the URL to yourself, or put an auth proxy in front of it.

### Railway (recommended)

1. Push the repo to GitHub
2. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → pick your fork (the Dockerfile is detected automatically)
3. On the service: **Settings → Volumes → Add Volume**, mount path `/data`
4. Optional — **Variables**: add `GEMINI_API_KEY` (or skip it and paste keys into the in-app Model Manager instead; they're stored in SQLite on the volume)
5. **Settings → Networking → Generate Domain** — that's your app URL

Notes:
- The first message after a fresh deploy is slow — ChromaDB downloads its embedding model once (it's cached on the volume thereafter)
- Ollama models won't work from a cloud host — Ollama runs on *your* machine at `localhost`. Local models are a local-run feature.
- Any Docker host with a volume works the same way (Fly.io, Render paid tier, a VPS): run the image, mount storage at `/data`, expose the port (`$PORT` respected, default 8000)

### Why not Vercel?

Vercel only hosts static sites and short-lived serverless functions. FiLM's backend needs a persistent process and disk (SQLite writes, ChromaDB, file uploads) — that can never run on Vercel. Hosting just the frontend there would still require the backend to live somewhere else, so a single Docker host is simpler.

---

## Stack

| Layer | Technology |
|-------|-----------|
| LLM | Gemini, Claude, GPT, or local Ollama models — selectable per chat, keys managed in-app |
| Embeddings | all-MiniLM-L6-v2 (local, via Sentence Transformers) |
| Vector DB | ChromaDB (local) |
| Backend | FastAPI + Python |
| Frontend | React + Vite + TypeScript |
| Metadata DB | SQLite via SQLAlchemy |
| State | Zustand |
| PDF parsing | pypdf |

**Cost to run: $0** — Gemini free tier (1,500 req/day) and/or local Ollama models, everything else is local. Claude and GPT are pay-per-use opt-ins via the Model Manager.

---

## Roadmap

- [x] Chat interface with streaming responses and markdown rendering
- [x] Virtual file system — chat folders with unlimited nesting
- [x] RAG context system — attach chats and files as context
- [x] File folders — organize uploaded files, attach entire folders at once
- [x] API test suite (76 tests — chats, folders, context, Muses, recursive context, slicing, models, credentials)
- [x] Muses — custom AI personalities with their own system prompts and pinned context, assignable per chat
- [x] Chat slicing — attach only a portion of a chat's history via inline scissors editor
- [x] UX flow redesign — single Muse editing surface, "From Muse" context visibility, click-to-slice, welcome guide
- [x] Persistent layout — sidebar and Context panel always visible (with drag-resize that persists across views), Muse picker in the Context panel, staged Muse saves, Muse-context slicing
- [x] Model Selector (Phase 1) — per-chat Gemini model choice with provenance stamps and retired-model fallback
- [x] Model Selector (Phase 2) — multi-provider models (Anthropic, OpenAI, Ollama) + Model Manager with API-key validation and send-failure recovery
- [ ] Search across all chats
