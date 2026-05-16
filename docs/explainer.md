# FiLM — How It Works (Plain English)

A living document. Updated as the system evolves.

---

## The Big Picture

FiLM is a chat app where you own and organize everything. Think of it like a file manager (Finder, Windows Explorer) bolted onto a ChatGPT-style interface. You can put chats in folders, upload documents, and explicitly tell the AI what background knowledge to use before it answers you.

There are three things happening at once:

```
You type a message
    → FiLM figures out what context you've attached
    → Sends your message + that context to Gemini
    → Streams the response back to you
```

Everything else in the UI is just organizing the inputs to that flow.

---

## Where Your Data Lives

FiLM uses two databases, each responsible for a different kind of storage.

### SQLite (`backend/film.db`)
This is the "source of truth" for everything you can see and name. It stores:
- Every chat, its title, and which folder it's in
- Every message (text, role, timestamp)
- Every uploaded file's name, size, and which file folder it's in
- Every context attachment (which file or chat is attached to which chat)
- The folder structures (both chat folders and file folders)

Think of SQLite as the filing cabinet. It holds the actual content and the relationships between things.

### ChromaDB (`backend/chroma_data/`)
This is the "semantic search index." It stores **vector embeddings** — a mathematical representation of what each message or file *means*. You can't read these directly; they're just numbers.

ChromaDB is used when the system needs to find relevant content by meaning rather than by ID. Every message and uploaded file gets embedded here when it's first saved.

**The link between them:** every record uses the same UUID in both databases. A message with `id = "abc-123"` in SQLite has its embedding stored under the key `"abc-123"` in ChromaDB.

### Uploaded Files (`backend/uploads/`)
The raw files you upload (PDFs, text files, Markdown) are saved here on disk. SQLite tracks their metadata; ChromaDB stores their extracted text as embeddings.

---

## How Context Actually Works

When you attach a chat or file as context and send a message, here's what happens:

1. FiLM looks up all your context attachments for the current chat in SQLite
2. For each attached **chat**: it pulls the full message history from SQLite and formats it as a readable transcript
3. For each attached **file**: it fetches the file's text from ChromaDB by ID
4. All of that gets bundled into a big `<context>` block prepended to your message
5. The whole thing gets sent to Gemini as one prompt

**ChromaDB isn't doing the retrieval here** — it's just used as a convenient store for file text. The context you see attached is exactly what gets sent; there's no hidden semantic filtering happening on attachment. (ChromaDB's vector search capability is available but currently not used in the attachment flow.)

---

## How the File System Works

The folder structure is purely organizational — it doesn't affect how the AI works. It's just metadata in SQLite.

**Chat folders** (left sidebar): organize your conversations, like folders on a desktop
**File folders** (right panel): organize your uploaded files

Both support unlimited nesting. Moving something between folders is just updating a `parent_id` or `folder_id` field in SQLite — nothing moves on disk.

When you delete a folder, its contents don't get deleted:
- Chats inside move to "Unfiled Chats"
- Child folders get promoted to the deleted folder's parent (so you don't lose nesting depth)

---

## How the LLM Connection Works

FiLM uses **Gemini 2.0 Flash** via Google's API. Every message send is a fresh API call — there's no persistent "session" on Google's side. FiLM reconstructs the conversation history from SQLite and passes it with each request.

Responses stream back using **SSE (Server-Sent Events)**: the backend opens a connection and sends chunks of text as Gemini produces them, rather than waiting for the full response. This is why you see text appear word-by-word.

Gemini is stateless from its perspective — FiLM is responsible for remembering the conversation.

---

## How Embeddings Work (and When They Matter)

When you save a message or upload a file, FiLM converts the text into a list of ~384 numbers using a local model called **all-MiniLM-L6-v2** (runs entirely on your machine, no API call). This list of numbers is the "embedding" — it encodes the *meaning* of the text in a way that lets you find similar content by comparing the numbers.

ChromaDB stores these embeddings and can search them: "find me the 5 messages most semantically similar to this query." This is the foundation of RAG (Retrieval-Augmented Generation).

Currently, FiLM uses this for storing file content so it can be retrieved by ID. The vector search capability (finding the most *relevant* parts of your context automatically) is built in but not yet wired into the UI — that's a future enhancement.

---

## What "RAG" Means

RAG = Retrieval-Augmented Generation. The "augmented" part just means: before sending your question to the AI, add some relevant background information to the prompt.

In FiLM, you do the retrieval manually — you pick which chats and files to attach. A more automated version would have FiLM search your entire library and automatically surface the most relevant pieces. Both approaches are "RAG"; FiLM currently uses the manual, explicit version.

---

## Planned Features

- **Chat Slicing**: attach only a portion of a chat's history (e.g., "use this chat but only the first 10 messages")
- **Personas**: define a named AI persona with a custom system prompt and select it per chat
- **Search**: find chats by title or message content across your entire library
