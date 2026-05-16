# Muses — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** In Progress (Phase 5)

---

## Overview

A Muse is a named AI personality you define once and reuse across chats. You give it a name, a system prompt that shapes how it responds, and optionally **pinned context** — files and past chats that are always included when the Muse is active. Think of it as a pre-configured AI role: "Product Manager mode trained on my PRDs" or "Code Reviewer that knows our conventions."

---

## Problem

Even with RAG context attached, every chat starts with a blank-slate AI. Users who want consistent behavior — a specific tone, expertise, or persona — have to re-prompt it every time. Muses encode that intent once and reuse it across chats. The system prompt sets the *behavior*; the pinned context sets the *knowledge*.

---

## User Stories

- As a user, I can create a Muse by giving it a name, an optional description, and a system prompt
- As a user, I can drag files and chats onto a Muse to pin them as permanent context for that Muse
- As a user, I can remove pinned context from a Muse
- As a user, I can assign a Muse to a chat from the chat header
- As a user, I can switch or remove a Muse on an existing chat without losing message history
- As a user, I can edit or delete Muses I've created
- As a user, I can see at a glance which Muse is active in a chat

---

## Functional Requirements

### Implemented (baseline)
- [x] Muse creation — name, description, system prompt
- [x] Muse CRUD — list, edit, delete via MusePicker dropdown in chat header
- [x] Muse assignment — per-chat; stored as `muse_id` FK in SQLite
- [x] System prompt injection — sent to Gemini via `GenerateContentConfig(system_instruction=...)` on every message
- [x] MusePicker — dropdown in chat header to assign/create/edit/delete Muses

### New: Muse Editor page with pinned context
- [ ] Dedicated **Muse Library** page — a full-screen view listing all Muses
- [ ] Each Muse card shows: name, description, system prompt (truncated), pinned context items, and which chats are using it
- [ ] Clicking a Muse opens a **Muse Editor** panel (or expands inline) with:
  - Editable name, description, system prompt fields
  - A **Pinned Context** zone — a drop target accepting files and chats dragged from the sidebar or file panel
  - List of pinned items (file or chat) with individual remove buttons
- [ ] Drag & drop: user drags a file or chat from the LHS/RHS panels and drops it onto a Muse card or into the Pinned Context zone
- [ ] Pinned context is stored in SQLite as a `muse_context` join table (many-to-many: muse ↔ file or chat)
- [ ] When a Muse is active in a chat, its pinned context is prepended to the per-chat context before every Gemini call
- [ ] Pinned context stacks on top of per-chat context (it does not replace it)

---

## Non-Functional Requirements

- Muses are stored locally; no cloud sync required for v1
- Switching Muses on an existing chat must not delete message history
- Pinned context injection must follow the same format as per-chat context attachments (so it's easy to reason about what's in the prompt)

---

## Data Model

### Current schema
```
Muse:
  id:            string (UUID, PK)
  name:          string
  description:   string | null
  system_prompt: string
  created_at:    datetime

Chat:
  + muse_id:     string | null (FK → Muse)
```

### New: pinned context join table
```
MuseContext:
  id:          string (UUID, PK)
  muse_id:     string (FK → Muse, CASCADE DELETE)
  source_type: enum ("chat" | "file")
  source_id:   string (ID of the chat or uploaded file)
  created_at:  datetime
```

Migration: `CREATE TABLE IF NOT EXISTS muse_contexts (...)` at startup.

---

## API Changes

### Existing endpoints (already built)
```
GET    /api/muses              → list all Muses
POST   /api/muses              → create Muse
GET    /api/muses/:id          → get Muse
PATCH  /api/muses/:id          → update name / description / system_prompt
DELETE /api/muses/:id          → delete Muse (unassigns from all chats)
```

### New: pinned context on a Muse
```
GET    /api/muses/:id/context
  → list pinned context items for a Muse

POST   /api/muses/:id/context
  Body: { source_type: "chat" | "file", source_id: string }
  → pin a file or chat to the Muse

DELETE /api/muses/:id/context/:context_id
  → unpin a specific item
```

### Context loading change (chats.py)
Context loading is recursive. A single `_resolve_context(db, chat)` helper handles both Muse pinned context and per-chat context using a shared `_build_context_parts()` recursive function:

```
_resolve_context(chat):
  visited = {chat.id}          # never inject the current chat into itself
  1. Muse pinned context → _build_context_parts(muse_pairs, visited)
  2. Per-chat context    → _build_context_parts(chat_pairs, visited)

_build_context_parts(pairs, visited, depth):
  for each (source_type, source_id):
    if CHAT and not in visited:
      add transcript
      visited.add(id)
      if depth < MAX_CONTEXT_DEPTH:
        recurse into that chat's own ContextAttachments
    if FILE:
      fetch content from ChromaDB
```

- Max depth: 3 (constant `MAX_CONTEXT_DEPTH` in `routers/chats.py`)
- `visited` is shared across Muse + per-chat context, so a chat pinned to both is only injected once

---

## UI / UX

### Entry point
A **"Muse Library"** link in the topbar or sidebar footer. Clicking it navigates to (or overlays) the Muse Library page.

### Muse Library layout
```
┌─────────────────────────────────────────────────────┐
│  Muse Library                          [+ New Muse] │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │ PM Mode          │  │ Code Reviewer    │  ...    │
│  │ "You are a PM…"  │  │ "Review code…"   │         │
│  │ 2 chats active   │  │ 1 chat active    │         │
│  │ [Edit] [Delete]  │  │ [Edit] [Delete]  │         │
│  └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────┘
```

### Muse Editor (inline expansion or side panel)
```
┌─────────────────────────────────────────────────────┐
│ Name:         [ PM Mode                           ] │
│ Description:  [ Acts as a product manager…        ] │
│ System prompt:                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ You are an experienced product manager. Always  │ │
│ │ respond with structured thinking…               │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Pinned Context  ← drop files or chats here          │
│ ┌─────────────────────────────────────────────────┐ │
│ │  📄 product_requirements.md          [✕]        │ │
│ │  💬 Q2 Planning Chat                 [✕]        │ │
│ │  ┄ ┄ ┄ drag files or chats here ┄ ┄ ┄          │ │
│ └─────────────────────────────────────────────────┘ │
│                              [Cancel]  [Save Muse]  │
└─────────────────────────────────────────────────────┘
```

### Drag & drop
- Files and chats dragged from the sidebar or file panel can be dropped onto the **Pinned Context** zone in the Muse Editor
- Same dataTransfer keys as the existing drag system (`chatId`, `folderId`, `contextType`, `contextId`)
- Dropping a folder pins all its files/chats (same bulk-attach pattern as the context panel)
- Visual feedback: drop zone highlights on hover

### MusePicker (existing — no change needed)
Active Muse shown in chat header. Badge shows the Muse name when one is active.

---

## Implementation Approach

1. **Backend — MuseContext model + migration** — add `muse_contexts` table; add pinned context endpoints
2. **Backend — context loading** — prepend Muse pinned context to per-chat context in both send endpoints
3. **Frontend types** — add `MuseContext` interface; add `pinned_context` to `Muse`
4. **Frontend API** — add `muses.getContext`, `muses.pinContext`, `muses.unpinContext`
5. **MuseLibrary page** — new route/view; Muse cards with edit/delete
6. **MuseEditor component** — inline editor with pinned context drop zone + drag & drop wiring
7. **Navigation** — add Muse Library entry point (topbar or sidebar footer)

---

## Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Does Muse pinned context replace or stack with per-chat context? | Replace / Stack | Stack — Muse is additive background knowledge |
| Where does Muse Library live in the nav? | Topbar link / Sidebar footer icon / Dedicated route | Topbar link keeps it accessible without cluttering sidebar |
| Can you pin a whole folder to a Muse? | Yes / No | Yes — same pattern as bulk-attach in context panel |
| What happens to pinned context if the source is deleted? | Error / Silently skip | Silently skip (same as per-chat attachment behavior) |

---

## Effort Estimate

*All estimates are Claude implementation time, not human-hours.*

| Area | Work |
|------|------|
| Backend: MuseContext model + endpoints | ~10 min |
| Backend: context loading update | ~5 min |
| Frontend: types + API service | ~5 min |
| MuseLibrary page + MuseEditor component | ~20 min |
| Drag & drop wiring | ~10 min |
| Navigation entry point | ~5 min |
| **Total** | **~55 min** |
