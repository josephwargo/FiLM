# FiLM — Test Plan

**Part of:** [FiLM Master PRD](Master_PRD.md)
**Test type:** API integration tests (pytest + FastAPI TestClient)
**Last updated:** 2026-07-02

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
| CTX-016 | Recursive: sub-attachments pulled in | P0 | Smoke | Attach Chat B (which has a file) to Chat A; send message from A | File attached to B appears in resolved context |
| CTX-017 | Circular reference doesn't loop | P0 | Regression | Attach A→B and B→A; send from A | Request completes (no infinite loop) |
| CTX-018 | Current chat excluded from own context | P0 | Regression | Attach a chat to itself; send message | Request completes (no self-injection) |
| CTX-019 | Shared chat not duplicated across Muse + per-chat | P1 | Regression | Same chat pinned to Muse and attached per-chat | Chat transcript appears exactly once in LLM context |
| CTX-020 | Update slice bounds on attachment | P0 | Smoke | PATCH /api/context/attachments/:id with start/end message IDs | Bounds stored; nulls clear them |
| CTX-021 | Sliced attachment trims LLM context | P0 | Smoke | Slice a chat attachment, send message | Only in-range messages appear in context; "(sliced)" header present |
| CTX-022 | End-only slice includes from start | P1 | Integration | Set only `end_message_id` | Everything from the beginning up to the bound is included |
| CTX-023 | Unknown bound ID falls back | P1 | Regression | Slice with a message ID not in the source chat | Falls back silently to the chat's natural bounds |
| CTX-024 | Context snapshot stored on assistant message | P1 | Smoke | Send with muse + attached chat, then plain send | Assistant message carries JSON snapshot (muse, system_prompt, parts with type/label/sliced/content); null when no context |

---

## Suite 4 — Muses
*PRD: [muses_PRD.md](products/muses_PRD.md)*
*File: `backend/tests/test_muses.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| MUSE-001 | Create Muse | P0 | Smoke | POST /api/muses with name, description, system_prompt | 200, all fields in response |
| MUSE-002 | Create Muse without description | P1 | Smoke | POST /api/muses omitting description | 200, description is null |
| MUSE-003 | List Muses | P0 | Smoke | GET /api/muses after creating two | Both names present |
| MUSE-004 | Get Muse by id | P0 | Smoke | GET /api/muses/:id | 200, correct id |
| MUSE-005 | Get nonexistent Muse | P0 | Regression | GET /api/muses/bad-id | 404 |
| MUSE-006 | Update Muse | P1 | Integration | PATCH /api/muses/:id with new name + system_prompt | Response reflects updated values |
| MUSE-007 | Delete Muse | P1 | Integration | DELETE /api/muses/:id | Muse absent from subsequent list |
| MUSE-008 | Delete Muse unassigns chats | P0 | Regression | Delete a Muse used by a chat | Chat's muse_id becomes null |
| MUSE-009 | Assign Muse to chat | P0 | Smoke | PATCH /api/chats/:id with muse_id | muse_id persisted on chat |
| MUSE-010 | Clear Muse from chat | P1 | Integration | PATCH /api/chats/:id with muse_id: "" | muse_id becomes null |
| MUSE-011 | System prompt injected on send | P0 | Smoke | Send message in Muse-assigned chat | system_prompt passed to LLM equals Muse's system_prompt |
| MUSE-012 | No system prompt without Muse | P1 | Regression | Send message with no Muse assigned | system_prompt passed to LLM is null |
| MUSE-013 | Pin chat as Muse context | P0 | Smoke | POST /api/muses/:id/context (source_type: chat) | 200; appears in GET /api/muses/:id/context |
| MUSE-014 | Pin file as Muse context | P0 | Smoke | POST /api/muses/:id/context (source_type: file) | 200; appears in context list |
| MUSE-015 | Pin context is idempotent | P1 | Regression | Pin same source twice | Second call returns same record; list has 1 entry |
| MUSE-016 | Unpin Muse context | P1 | Integration | DELETE /api/muses/:id/context/:ctx_id | Item absent from context list |
| MUSE-017 | Pin context to nonexistent Muse | P0 | Regression | POST /api/muses/bad-id/context | 404 |
| MUSE-018 | Muse pinned context in LLM call | P0 | Smoke | Muse has file pinned; send message from assigned chat | File name appears in context string passed to LLM |
| MUSE-019 | Pin with slice bounds + PATCH | P1 | Integration | Pin chat with bounds; PATCH /api/muses/:id/context/:ctx_id | Bounds stored, updated, and cleared with nulls |
| MUSE-020 | Sliced muse-pinned chat trims LLM context | P0 | Smoke | Muse pins a sliced chat; send from assigned chat | Only in-range messages injected; "(sliced)" header present |

---

## Suite 5 — Model Selector
*PRD: [model_selector_PRD.md](products/model_selector_PRD.md)*
*File: `backend/tests/test_models.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| MODEL-001 | Models catalog | P0 | Smoke | GET /api/models | ≥2 models with full shape; exactly one `is_default` matching the app default |
| MODEL-002 | Set and clear per-chat model | P0 | Smoke | PATCH /api/chats/:id with `model`, then `model: ""` | Model persisted; empty string clears back to null |
| MODEL-003 | Send routes to chat model + provenance | P0 | Smoke | Set chat model, send message | LLM call uses the chat's model; assistant message stamped with it, user message not |
| MODEL-004 | Retired model falls back to default | P1 | Regression | Chat stores an id missing from the catalog; send | Default model used and stamped; stored preference preserved |
| MODEL-005 | SSE done event carries model | P1 | Regression | POST /api/chats/:id/messages/stream | `done` event includes the resolved model id |
| MODEL-006 | Full catalog + provider status | P0 | Smoke | GET /api/models/catalog | All 9 curated models; Google enabled by default, Anthropic/OpenAI disabled; 4 providers with `configured`/`source` status |
| MODEL-007 | Enable/disable models | P0 | Smoke | PATCH /api/models/:id | Enabled model appears in picker; disabled model disappears and sends fall back to default; unknown id 404 |
| MODEL-008 | Credential validation on save | P0 | Smoke | PUT /api/models/providers/:p/credential | Invalid key → 400, nothing stored; valid key → saved with source `db`, provider models become available |
| MODEL-009 | Credential deletion + env fallback | P1 | Regression | DELETE /api/models/providers/:p/credential | Provider unconfigured, or falls back to `.env` when an env key exists; unknown provider 404 |
| MODEL-010 | Ollama discovery + routing | P1 | Integration | Configure Ollama URL; GET /api/models; send | Discovered `ollama:<tag>` models appear in picker; sends route to the Ollama adapter |
| MODEL-011 | Auth failure returns structured error | P0 | Regression | Send with provider raising 401-style error | 502 with `{type: "auth", provider, model, message}` detail |
| MODEL-012 | Auth failure surfaces on SSE stream | P1 | Regression | Stream send with failing provider | SSE `error` event with auth type; no assistant message persisted |
| MODEL-013 | Blank credential rejected | P2 | Regression | PUT credential with whitespace value | 400 before any validation call |

---

## Suite 6 — Password Gate
*File: `backend/tests/test_auth.py`*

| ID | Test Name | Priority | Type | Description | Expected Result |
|----|-----------|----------|------|-------------|-----------------|
| AUTH-001 | Auth disabled when password unset | P0 | Smoke | No `FILM_PASSWORD`; GET /api/chats and /api/auth/status | API open; status reports `auth_required: false, authenticated: true` |
| AUTH-002 | API locked when password set | P0 | Smoke | Set `FILM_PASSWORD`; hit /api/chats without a session | 401 on API routes; /api/auth/status stays reachable and reports unauthenticated |
| AUTH-003 | Login flow | P0 | Smoke | POST /api/auth/login with wrong then correct password | Wrong → 401; correct → 200, `film_session` cookie set, API unlocked, status authenticated |
| AUTH-004 | Logout + forged cookie rejected | P1 | Regression | Logout after login; then set a fabricated cookie value | API 401s after logout; forged cookie does not authenticate |

---

## Pass/Fail Criteria for Release

| Gate | Requirement |
|------|-------------|
| **Ship** | All P0 tests pass (46 P0 tests across all suites) |
| **Ship with caveats** | All P0 pass; any P1 failures documented as known issues |
| **Do not ship** | Any P0 failure |

---

## Out of Scope (not covered by this suite)

| Area | Reason |
|------|--------|
| UI / frontend interactions | No E2E test framework set up yet. Manual test using the running app. |
| Drag & drop behavior | Requires browser automation (Playwright). Planned for Phase 5. |
| Real LLM responses (Gemini/Claude/GPT/Ollama) | Mocked — quality of AI output is not a regression test concern. Credential validation is also mocked (no live key checks in CI). |
| Real vector search (ChromaDB) | Mocked — RAG retrieval accuracy is evaluated manually against known docs. |
| PDF text extraction quality | Covered by pypdf library's own tests. |
| Search across chats | Feature not yet implemented. |

---

## Adding New Tests

When a new feature is built:
1. Add test cases to the appropriate file (`test_chats.py`, `test_folders.py`, `test_context.py`, `test_muses.py`, `test_models.py`, or `test_auth.py`)
2. Assign the next ID in sequence (e.g., MUSE-019, CTX-020)
3. Add a row to the corresponding table above
4. Mark priority based on: P0 if a regression would break the UI for any user, P1 if it degrades a named feature, P2 otherwise
