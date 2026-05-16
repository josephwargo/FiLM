# FiLM — Master PRD

**FiLM** (File-based LLM Management)

## Vision

Make LLM chat history actually usable. FiLM gives users a structured, navigable file system to organize their chats, and lets them feed past conversations and files as context into new ones — turning a pile of throwaway chat sessions into a reusable knowledge base.

## Problem

LLM chat apps dump every conversation into a flat, unstructured list. There's no way to organize by project, topic, or purpose — and no way to reuse what you've already told the AI. Users end up re-explaining context constantly and losing track of valuable past conversations.

## Target User

Individual power users who use LLMs frequently across multiple projects or topics and are frustrated by the lack of organization and context reuse in existing tools.

## Products

| Product | Status | PRD |
|---------|--------|-----|
| Chat Interface | Complete | [chat_interface_PRD.md](products/chat_interface_PRD.md) |
| Virtual File System | Complete | [file_system_PRD.md](products/file_system_PRD.md) |
| RAG / Context System | Complete | [rag_context_PRD.md](products/rag_context_PRD.md) |
| Chat Slicing | Planned | [chat_slicing_PRD.md](products/chat_slicing_PRD.md) |
| Personas | Planned | [personas_PRD.md](products/personas_PRD.md) |

## Test Coverage

API integration tests live in `backend/tests/`. See [test_plan.md](test_plan.md) for the full test inventory, priorities, and run instructions.

```bash
# Run all tests (from backend/ with venv active)
pip install pytest httpx   # one-time
pytest tests/ -v
```

## Success Metrics

- Users can find a past chat in under 10 seconds
- Users can attach context to a new chat without re-explaining prior work
- Zero cost to run locally (Gemini free tier + local DBs)

## Architecture

```
Frontend (React + Vite + TypeScript)
  Topbar | Sidebar (Library) | Chat Area | Context Panel

Backend (FastAPI / Python)
  Chat API | Folder API | File API | RAG Pipeline

Storage
  Gemini API (LLM) | ChromaDB (vectors) | SQLite (metadata)
```

## Design Principles

- Looks like a familiar chat app at first glance
- Collapsible, resizable sidebar on the left (VS Code-style) with red accent
- Chat area center with markdown rendering and real-time streaming
- Collapsible, resizable context panel on the right with indigo accent — visually distinct from sidebar
- Folder structure (chat folders + file folders) and attached-context badges are the key visual differentiators

## Scope Boundaries

**In scope (MVP):** Local-only, single user, no auth
**Out of scope (v1):** Multi-user, cloud sync, mobile
**Future:** Electron wrapper, user accounts, export/import

## Development Phases

- **Phase 1 — Core Chat:** COMPLETE
- **Phase 2 — File System:** COMPLETE
- **Phase 3 — RAG/Context:** COMPLETE
- **Phase 4 — Polish:** COMPLETE
- **Phase 5 — Personas:** PLANNED
