# FiLM — Test Plan

**Part of:** [FiLM Master PRD](Master_PRD.md)
**Test type:** API integration tests (pytest + FastAPI TestClient)
**Last updated:** 2026-05-10

---

## How to Run

```bash
# From the backend/ directory, with the venv active:
pip install pytest httpx        # one-time setup
pytest tests/ -v                # run all suites
pytest tests/test_chats.py -v   # single suite
pytest tests/ -k "FS-007"       # single test by keyword
```

Tests use an isolated SQLite DB (`tests/test_film.db`) and mock all external calls (Gemini API, ChromaDB). No `.env` file or running server is needed.

---

## Priority Definitions

| Priority | Meaning |
|----------|---------|
| **P0** | Blocking — app is broken without this. Must pass before any release. |
| **P1** | Important — core feature is degraded. Should pass before release. |
| **P2** | Nice-to-have — edge case or minor UX. Can ship with known failure. |

---

## Suite 1 — Chat Interface
*PRD: [chat_interface_PRD.md](products/chat_interface_PRD.md)*
*File: `backend/tests/test_chats.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| CHAT-001 | Create chat (default title) | P0 | Smoke | POST /api/chats with empty body | 200, returns `id` and non-empty `title` |
| CHAT-002 | Create chat (custom title) | P0 | Smoke | POST /api/chats with `title` field | 200, `title` matches input |
| CHAT-003 | List all chats | P0 | Smoke | GET /api/chats after creating two chats | Both titles present in response array |
| CHAT-004 | Get chat with messages | P0 | Smoke | GET /api/chats/:id | 200, `messages` array present |
| CHAT-005 | Get nonexistent chat | P0 | Regression | GET /api/chats/bad-id | 404 |
| CHAT-006 | Rename a chat | P1 | Integration | PATCH /api/chats/:id with new `title` | Subsequent GET reflects new title |
| CHAT-007 | Move chat to folder | P1 | Integration | PATCH /api/chats/:id with `folder_id` | `folder_id` updated in response |
| CHAT-008 | Delete a chat | P0 | Smoke | DELETE /api/chats/:id | 200; follow-up GET returns 404 |
| CHAT-009 | Send message persists history | P0 | Smoke | POST /api/chats/:id/messages | User + assistant turns in chat history |
| CHAT-010 | Streaming endpoint returns SSE | P1 | Integration | POST /api/chats/:id/messages/stream | 200, `text/event-stream`, `done` event present |

---

## Suite 2 — Virtual File System
*PRD: [file_system_PRD.md](products/file_system_PRD.md)*
*File: `backend/tests/test_folders.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| FS-001 | Create folder | P0 | Smoke | POST /api/folders with `name` | 200, `id` and `name` present, `parent_id` null |
| FS-002 | Create nested folder | P0 | Smoke | POST /api/folders with `parent_id` | `parent_id` reflects the parent |
| FS-003 | Folder tree is recursive | P1 | Integration | GET /api/folders/tree after nesting | Child appears under parent's `children` array |
| FS-004 | Rename folder | P1 | Integration | PATCH /api/folders/:id with new `name` | Response `name` updated |
| FS-005 | Move folder into another | P1 | Integration | PATCH /api/folders/:id with new `parent_id` | `parent_id` updated to target |
| FS-006 | Move folder to root | P1 | Regression | PATCH /api/folders/:id with `parent_id: null` | `parent_id` becomes null |
| FS-007 | Prevent self-nesting | P0 | Regression | PATCH /api/folders/:id with own id as `parent_id` | 400 |
| FS-008 | Prevent cycle | P0 | Regression | Move ancestor into its descendant | 400 |
| FS-009 | Delete promotes children | P1 | Integration | DELETE middle folder in 3-level tree | Grandchildren promoted to grandparent |
| FS-010 | Chat appears in folder tree | P1 | Integration | Create chat with `folder_id`, GET /api/folders/tree | Chat title visible in folder's `chats` array |

---

## Suite 3 — RAG / Context System
*PRD: [rag_context_PRD.md](products/rag_context_PRD.md)*
*File: `backend/tests/test_context.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| CTX-001 | Upload TXT file | P0 | Smoke | POST /api/context/files/upload (text/plain) | 200, `id` and `filename` in response |
| CTX-002 | Upload Markdown file | P1 | Smoke | Upload `text/markdown` | 200 |
| CTX-003 | Reject unsupported type | P0 | Regression | Upload `application/javascript` | 400 |
| CTX-004 | List uploaded files | P0 | Smoke | GET /api/context/files after two uploads | Both filenames present |
| CTX-005 | Delete file | P1 | Integration | DELETE /api/context/files/:id | File absent from subsequent list |
| CTX-006 | Attach chat as context | P0 | Smoke | POST /api/context/attach (source_type: chat) | 200, attachment returned with correct IDs |
| CTX-007 | Attach file as context | P0 | Smoke | POST /api/context/attach (source_type: file) | 200 |
| CTX-008 | Prevent duplicate attachment | P0 | Regression | Attach same source twice | Second attach returns 400 |
| CTX-009 | Detach context | P1 | Integration | DELETE /api/context/detach/:id | Attachment absent from GET /api/context/:chat_id |
| CTX-010 | List attachments for chat | P1 | Integration | GET /api/context/:chat_id after attach | Returns array with the attached source |
| CTX-011 | Create file folder | P0 | Smoke | POST /api/context/file-folders | 200, `id` and `name`, `parent_id` null |
| CTX-012 | Nest file folder | P1 | Integration | PATCH /api/context/file-folders/:id with `parent_id` | `parent_id` updated |
| CTX-013 | Prevent file folder cycle | P0 | Regression | Move ancestor folder into descendant | 400 |
| CTX-014 | Move file to folder | P1 | Integration | PATCH /api/context/files/:id with `file_folder_id` | `file_folder_id` updated in response |
| CTX-015 | Delete folder promotes children | P1 | Integration | DELETE middle folder in 3-level tree | Grandchildren promoted to grandparent |

---

## Pass/Fail Criteria for Release

| Gate | Requirement |
|------|-------------|
| **Ship** | All P0 tests pass (15 tests) |
| **Ship with caveats** | All P0 pass; any P1 failures documented as known issues |
| **Do not ship** | Any P0 failure |

---

## Out of Scope (not covered by this suite)

| Area | Reason |
|------|--------|
| UI / frontend interactions | No E2E test framework set up yet. Manual test using the running app. |
| Drag & drop behavior | Requires browser automation (Playwright). Planned for Phase 5. |
| Real Gemini responses | Mocked — quality of AI output is not a regression test concern. |
| Real vector search (ChromaDB) | Mocked — RAG retrieval accuracy is evaluated manually against known docs. |
| PDF text extraction quality | Covered by pypdf library's own tests. |
| Search across chats | Feature not yet implemented. |

---

## Adding New Tests

When a new feature is built:
1. Add test cases to the appropriate file (`test_chats.py`, `test_folders.py`, or `test_context.py`)
2. Assign the next ID in sequence (e.g., CHAT-011)
3. Add a row to the corresponding table above
4. Mark priority based on: P0 if a regression would break the UI for any user, P1 if it degrades a named feature, P2 otherwise
