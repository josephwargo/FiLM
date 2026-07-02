# Muses — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Complete (last updated 2026-06-28)

---

## Overview

A Muse is a named AI personality you define once and reuse across chats. You give it a name, an optional description, a system prompt that shapes how it responds, and **pinned context** — files and past chats that are always included when the Muse is active. Think of it as a pre-configured AI role: "Product Manager mode trained on my PRDs" or "Code Reviewer that knows our conventions."

---

## Problem

Even with RAG context attached, every chat starts with a blank-slate AI. Users who want consistent behavior — a specific tone, expertise, or persona — have to re-prompt it every time. Muses encode that intent once and reuse it across chats. The system prompt sets the *behavior*; the pinned context sets the *knowledge*.

---

## User Stories

- As a user, I can create a Muse by giving it a name, an optional description, and a system prompt
- As a user, I can drag files and chats onto a Muse to pin them as permanent context for that Muse
- As a user, I can drag a whole chat folder or file folder to bulk-pin all its contents
- As a user, I can remove pinned context from a Muse
- As a user, I can assign a Muse to a chat from the chat header
- As a user, I can switch or remove a Muse on an existing chat without losing message history
- As a user, I can edit or delete Muses I've created
- As a user, I can see at a glance which Muse is active in a chat, and how many chats are using each Muse

---

## Functional Requirements

### Muse CRUD
- [x] Muse creation — name, description, system prompt
- [x] Muse list, edit, delete via Muse Library page and MusePicker dropdown
- [x] Muse assignment — per-chat; stored as `muse_id` FK in SQLite
- [x] Deleting a Muse unassigns it from every chat (chats keep their history)
- [x] System prompt injection — sent to Gemini via `GenerateContentConfig(system_instruction=...)` on every message
- [x] MusePicker — dropdown in chat header to assign/create/edit/delete Muses

### Muse Library page
- [x] Dedicated full-screen Muse Library view, accessible from a topbar "Muses" button (toggles between Muse Library and the normal chat view)
- [x] Three-column layout: Muse list (left) · Muse Editor (middle) · draggable source panel (right)
- [x] Each Muse card in the list shows name, description, and the count of chats currently using it
- [x] Clicking a Muse card opens it in the inline editor; "+ New Muse" starts an empty editor
- [x] Editor fields: editable name, description (optional), system prompt
- [x] Save button is disabled until name + system prompt are filled and the form is dirty (or a new Muse)
- [x] Delete button on the editor header removes the Muse (with the unassign-from-chats behavior above)

### Pinned context
- [x] Pinned Context drop zone inside the Muse Editor
- [x] List of pinned items with per-item remove (unpin) button; each item shows whether it's a file or a chat
- [x] Drag-and-drop sources:
  - From the right-hand draggable source panel inside Muse Library (chats organized by folder tree, plus a flat file list)
  - Drag a single chat → pins the chat
  - Drag a single file → pins the file
  - Drag a chat folder → recursively pins every chat inside it (including nested subfolders)
  - Drag a file folder → pins every file in that file folder
- [x] Drop-zone visual feedback on dragover
- [x] Pinning is idempotent — re-pinning the same source is a no-op (both frontend and backend)
- [x] Pinned context is stored in SQLite as a `muse_contexts` join table
- [x] When a Muse is active in a chat, its pinned context is prepended to per-chat context before every Gemini call (stacks on top, does not replace)
- [x] Pinned context flows through the same recursive resolver as per-chat context, with a shared `visited` set so a chat referenced from both Muse and per-chat context is injected exactly once

---

## Non-Functional Requirements

- Muses are stored locally; no cloud sync
- Switching Muses on an existing chat must not delete message history
- Pinned context injection uses the same format as per-chat context attachments (so it's easy to reason about what's in the prompt)
- Pinning requires the Muse to exist first — the drop zone is disabled when creating a new (unsaved) Muse

---

## Data Model

```
Muse:
  id:            string (UUID, PK)
  name:          string
  description:   string | null
  system_prompt: string
  created_at:    datetime

  pinned_context: MuseContext[]   # relationship, cascade delete

Chat:
  muse_id: string | null (FK → Muse, nullable)

MuseContext:                       # table: muse_contexts
  id:          string (UUID, PK)
  muse_id:     string (FK → Muse, cascade delete)
  source_type: enum ("chat" | "file")
  source_id:   string (ID of the chat or uploaded file)
  created_at:  datetime
```

Inline migration in `backend/main.py` adds `chats.muse_id` if missing; `Base.metadata.create_all` creates `muses` and `muse_contexts` on startup.

---

## API

All endpoints live under `/api/muses`.

### Muses
```
GET    /api/muses              → list all Muses
POST   /api/muses              → create Muse           {name, description?, system_prompt}
GET    /api/muses/:id          → get Muse
PATCH  /api/muses/:id          → update name / description / system_prompt
DELETE /api/muses/:id          → delete Muse (unassigns from all chats)
```

### Pinned context
```
GET    /api/muses/:id/context
  → list pinned context items for a Muse

POST   /api/muses/:id/context
  Body: { source_type: "chat" | "file", source_id: string }
  → pin a file or chat to the Muse (idempotent — returns existing pin if already pinned)

DELETE /api/muses/:id/context/:context_id
  → unpin a specific item
```

### Context resolution (in `routers/chats.py`)
A single `_resolve_context(db, chat)` helper returns `(context_parts, system_prompt)`:

```
_resolve_context(chat):
  visited = {chat.id}          # never inject the current chat into itself
  if chat has a Muse:
    system_prompt = muse.system_prompt
    prepend Muse pinned context via _build_context_parts(muse_pairs, visited)
  append per-chat context via _build_context_parts(chat_pairs, visited)

_build_context_parts(pairs, visited, depth):
  for each (source_type, source_id):
    if CHAT and not in visited:
      add transcript
      visited.add(id)
      if depth < MAX_CONTEXT_DEPTH:
        recurse into that chat's own ContextAttachments
    if FILE:
      fetch content from ChromaDB; silently skip if missing
```

- `MAX_CONTEXT_DEPTH = 3` (constant in `routers/chats.py`)
- `visited` is shared across Muse + per-chat context, so a chat pinned to both is injected once
- Missing source files/chats are silently skipped (no error)

---

## UI / UX

### Entry point
A **"Muses"** button in the topbar (with a `Wand2` icon) toggles between the normal chat workspace and the Muse Library view. The button highlights when the library is open.

### Muse Library layout (three columns)
```
┌──────────────────────────────────────────────────────────────────────┐
│  Muses [+]   │  New Muse                                  [Delete]   │
│              │                                                       │
│  ┌────────┐  │  Name:         [ PM Mode                          ]   │
│  │ PM Mode│  │  Description:  [ Acts as a product manager…       ]   │
│  │ 2 chats│  │  System prompt:                                       │
│  └────────┘  │  ┌─────────────────────────────────────────────────┐  │
│  ┌────────┐  │  │ You are an experienced PM. Respond with…        │  │
│  │ Code   │  │  └─────────────────────────────────────────────────┘  │
│  │Reviewer│  │                                                       │
│  │ 1 chat │  │  Pinned Context — drag from the panel on the right    │
│  └────────┘  │  ┌─────────────────────────────────────────────────┐  │
│              │  │  📄 product_requirements.md            [✕]      │  │
│              │  │  💬 Q2 Planning Chat                    [✕]      │  │
│              │  │  ┄ Drop more here ┄                             │  │
│              │  └─────────────────────────────────────────────────┘  │
│              │                              [Save Muse]              │
└──────────────────────────────────────────────────────────────────────┘
   Left column                Middle column (editor)
                                         + Right column: draggable
                                           Chats (by folder) and Files
```

The right column holds a self-contained tree of chat folders + unfiled chats and a list of uploaded files, all draggable into the Pinned Context zone. Users do not need to drag from the main app sidebar.

### Drag & drop dataTransfer keys
Identical to the existing drag system in the rest of the app:
- `chatId` — a single chat
- `folderId` — a chat folder (pins every chat inside it, recursively)
- `contextType: "file"` + `contextId` — a single file
- `contextType: "file-folder"` + `contextId` — a file folder (pins every file in that folder)

### MusePicker (chat header)
Unchanged. Shows the active Muse on each chat; lets the user assign, switch, create, edit, or remove a Muse without leaving the chat.

---

## Resolved Design Questions

| Question | Resolution |
|----------|------------|
| Does Muse pinned context replace or stack with per-chat context? | **Stack** — Muse pinned context is prepended; per-chat context is appended; a shared `visited` set dedupes |
| Where does Muse Library live in the nav? | **Topbar button** that toggles between chat view and library view |
| Can you pin a whole folder to a Muse? | **Yes** — both chat folders (recursive) and file folders are supported |
| What happens to pinned context if the source is deleted? | **Silently skipped** at resolution time (same as per-chat attachments) |
| What if a chat is referenced from both Muse pinned context and per-chat context? | Injected **once** thanks to the shared `visited` set across resolvers |
| Where do users drag pinned-context sources from? | **Right-hand source panel** inside the Muse Library — self-contained, no need to drag from the main sidebar |

---

## Notable deltas from the original spec

These are intentional improvements over the initial design:

1. **Three-column layout** instead of a card grid + separate editor panel. The Muse list, editor, and draggable source live side-by-side in a single view.
2. **Dedicated source panel** in the right column so users can drag chats and files without leaving the Muse Library.
3. **Idempotent pinning** on the backend — re-pinning the same source returns the existing record instead of erroring.
4. **Cascade delete** on `MuseContext` via the SQLAlchemy relationship, so deleting a Muse cleans up its pinned-context rows.
