# Personas — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Planned (Phase 5)

## Overview

Personas let users define a custom AI personality or role, backed by specific context they provide. Instead of a generic assistant, you get a "Product Manager mode" trained on your PRDs, or a "Code Reviewer" that knows your codebase conventions. The persona selection happens before or during a chat.

## Problem

Even with RAG context attached, every chat starts with a blank-slate AI. Users who want consistent behavior (a specific tone, expertise, or perspective) have to re-prompt it every time. Personas encode that intent once and reuse it across chats.

## User Stories

- As a user, I can create a persona by giving it a name, a system prompt, and optional context files/chats
- As a user, I can select a persona when starting a new chat
- As a user, I can switch personas on an existing chat
- As a user, I can edit or delete personas I've created

## Functional Requirements

### Planned
- [ ] Persona creation UI (name, description, system prompt, pinned context)
- [ ] Persona selection at chat creation
- [ ] Persona stored and associated with a chat in SQLite
- [ ] System prompt injected into Gemini call alongside RAG context
- [ ] Persona management screen (list, edit, delete)

## Non-Functional Requirements

- Personas are stored locally; no cloud sync required for v1
- Switching personas on an existing chat should not delete message history

## Data Model (Proposed)

```
Persona:
  id: string (UUID)
  name: string
  description: string (optional, shown in picker)
  system_prompt: string
  pinned_context_ids: string[] (optional — chat or file IDs always included)
  created_at: datetime

Chat:
  + persona_id: string (nullable FK to Persona)
```

## Open Questions

- Should a persona's pinned context stack on top of per-chat context, or replace it?
- Do we show persona as a visible badge in the chat header?
- Can users share/export personas, or is this local-only for v1?
- How does persona interact with the existing context panel UX?
