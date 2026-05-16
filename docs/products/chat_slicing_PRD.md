# Chat Slicing — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Planned
**Depends on:** RAG / Context System (Complete)

---

## Problem

When a chat is attached as context, the entire conversation history is injected into the prompt. Long or wide-ranging chats create two problems:

1. **Noise** — the second half of a chat may be off-topic or contradictory to what you want the AI to know
2. **Token pressure** — injecting a 50-message chat wastes context window space when only the first 10 messages were relevant

Users need a way to say "use this chat, but only up to this point."

---

## User Stories

- As a user, I can attach a chat as context and limit it to only the first N messages
- As a user, I can define a start and end point within a chat for more surgical context selection
- As a user, I can see at a glance which attached chats are sliced vs. fully included
- As a user, I can adjust or remove a slice after attaching without re-attaching

---

## Functional Requirements

### Implemented (baseline)
- Attach a full chat as context (all messages included)

### New: Slicing
- After attaching a chat, a user can open a **slice editor** for that attachment
- The slice editor shows a condensed message timeline (role + first ~60 chars of content)
- The user sets a **start point** and/or **end point** by clicking on a message
- Only messages within the selected range are injected as context on the next send
- Default (no slice set) = full chat, same behavior as today
- A visual indicator on the attachment badge shows when a slice is active (e.g., "Sliced")
- The user can clear the slice to restore full-chat inclusion

---

## Non-Functional Requirements

- Slice configuration must persist across sessions (stored in DB, not client state)
- Slicing must not change the source chat — it only affects how context is read
- No re-attachment needed to change a slice; one PATCH call updates the bounds

---

## API Changes

### `ContextAttachment` — new optional fields
```
start_message_id:  string | null   (first message to include; null = beginning of chat)
end_message_id:    string | null   (last message to include; null = end of chat)
```

### New endpoint
```
PATCH /api/context/attachments/:id
  Body: { start_message_id?: string | null, end_message_id?: string | null }
  → Updates slice bounds on an existing attachment
```

### Context loading logic (chats.py)
When building the context string for an attached chat, filter messages:
```python
messages = source_chat.messages
if attachment.start_message_id:
    start_idx = next((i for i, m in enumerate(messages) if m.id == attachment.start_message_id), 0)
    messages = messages[start_idx:]
if attachment.end_message_id:
    end_idx = next((i for i, m in enumerate(messages) if m.id == attachment.end_message_id), len(messages) - 1)
    messages = messages[:end_idx + 1]
```

---

## Data Model Changes

```
ContextAttachment (additions):
  start_message_id:  string | null  (FK to Message — nullable)
  end_message_id:    string | null  (FK to Message — nullable)
```

Migration: two `ALTER TABLE context_attachments ADD COLUMN` statements at startup (existing inline migration pattern).

---

## UI / UX

### Where slicing lives
Each attached chat in the **Current Context** zone gets a `⋯` or scissors icon button. Clicking it opens the slice editor inline (no modal — keeps interaction light).

### Slice editor (inline, below the attachment row)
```
┌─────────────────────────────────────────────┐
│  [user]  Hey, can you help me with X?       │  ← click = set start
│  [asst]  Sure! Here's how...               │
│  [user]  What about edge case Y?            │  ← click = set end   ← selected range
│  [asst]  Good question — Y works by...     │  ← dimmed (outside range)
│  [user]  Thanks, one more thing...          │  ← dimmed
└─────────────────────────────────────────────┘
  [Clear slice]
```

- Clicking a message once sets it as the **end** point (most common case: "up to here")
- Shift-clicking sets the **start** point
- Selected range highlighted; messages outside are dimmed
- Changes save on click (optimistic update, PATCH in background)

### Attachment badge states
| State | Badge |
|-------|-------|
| Full chat included | _(no badge)_ |
| Only end set | `Sliced ↑12` (up to message 12) |
| Start and end set | `Sliced 3–12` |

---

## Implementation Approach

1. **Backend** — Add `start_message_id` / `end_message_id` columns via inline migration; update context-loading logic in both `send_message` and `send_message_stream` to apply slice; add `PATCH /api/context/attachments/:id` endpoint
2. **Frontend types** — Add `start_message_id` / `end_message_id` to `ContextAttachment` type
3. **Frontend API** — Add `updateAttachment(id, { start_message_id, end_message_id })` to `contextAPI`
4. **ContextPanel UI** — Add toggle button per attached chat item; render inline slice editor when open; show badge when slice is active

---

## Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Should slicing apply to file attachments? | Yes (byte range) / No | No — slicing only makes sense for chat message sequences |
| Should start point default to 0 or be optional? | Always require both / end-only is sufficient | End-only is the common case; start is optional |
| What if a referenced message is deleted? | Error / fall back to full chat | Fall back silently to full chat |
| Show message previews in the slice editor? | Full content / truncated / role only | Truncated (~60 chars) — enough to identify the turn |

---

## Effort Estimate

*All estimates are Claude implementation time (conversation turns), not human-hours.*

| Area | Work |
|------|------|
| Backend migration + context filter | ~5 min |
| PATCH endpoint | ~5 min |
| Frontend type + API service | ~2 min |
| ContextPanel slice editor UI | ~15 min |
| **Total** | **~30 min** |
