# Model Selector — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Complete — Phase 1 and Phase 2 (multi-provider + Model Manager) implemented 2026-07-02
**Depends on:** Chat Interface (Complete), Muses (Complete)

---

## Problem

FiLM is hard-wired to a single model (`gemini-2.5-flash`, set as a constant in `gemini_service.py`). Users can't:

1. **Match the model to the task** — a quick lookup doesn't need the same model as a long-form writing session
2. **Use models they prefer or already pay for** — Claude, GPT, or a fully local model via Ollama
3. **Survive model retirements gracefully** — when Google retired `gemini-2.0-flash`, the app silently broke until the constant was updated (Session 7)

Architecture check (already validated): embeddings are generated locally by all-MiniLM-L6-v2 and are **independent of the chat model** — swapping the LLM never invalidates ChromaDB. Context injection is plain text and history is reconstructed from SQLite on every send, so any provider can serve any existing chat.

---

## User Stories

- As a user, I can pick which model a chat uses from a visible selector
- As a user, I can set a different model per chat, and it persists across sessions
- As a user, I can switch models mid-chat and the full history carries over
- As a user, I can see which model wrote each response after switching
- As a user, I only see models I can actually use (providers whose API keys I've configured)
- As a user, I can keep using FiLM at zero cost (Gemini free tier and/or local Ollama models)
- As a user, I can go to the "Model Manager" UI to add/remove models from different providers - which requires an API key

---

## Functional Requirements

### Model catalog
- The backend owns a static catalog of supported models: id, display name, provider, and short description
- `GET /api/models` returns the catalog with an `available` flag per model (true when that provider's credential is configured, always true for Ollama models when the Ollama URL responds)
- *(Implemented decision)* credentials are entered in the Model Manager UI and stored in SQLite (`provider_credentials`); `.env` keys work as a fallback when no in-app credential exists

### Model manager
- A UI to add/remove models from different providers
- This page has a set list of models from the top providers that the user can choose to add, as long as they can provide the appropriate API key
- When a model is added, verification is done to validate the API key
- Models to not fail silently. If the user's API key stops working or expires, that is surface within the UI, and the user is prompted to visit the Model manager page

### Per-chat model
- Each chat has an optional `model` field; `null` means "app default" (the default lives in the catalog, initially `gemini-2.5-flash`)
- The selector updates the chat via the existing `PATCH /api/chats/:id` (same pattern as `muse_id`)
- Switching takes effect on the next message — no restart, no data migration
- If a chat's stored model is no longer in the catalog (retired), fall back to the app default and surface a small notice in the selector

### Provider abstraction
- Replace direct `gemini_service` usage with an `LLMService` interface: `generate_response(...)` and `generate_response_stream(...)` with the existing signature `(message, history, context, system_prompt)`
- One adapter per provider maps FiLM's plain-text history + system prompt to the provider's format:
  | FiLM concept | Gemini | Anthropic | OpenAI | Ollama |
  |---|---|---|---|---|
  | System prompt (Muse) | `system_instruction` | `system` param | `system` message | `system` message |
  | History roles | `user` / `model` | `user` / `assistant` | `user` / `assistant` | `user` / `assistant` |
  | Streaming | SDK stream | SDK stream | SDK stream | HTTP stream |
- A registry resolves `model id → adapter` at send time; both `send_message` and `send_message_stream` go through it

### Response provenance
- Assistant messages record which model produced them (`Message.model`, nullable — old rows stay null)
- Shown as a subtle label on assistant messages only when it differs from the chat's current model (avoids visual noise in single-model chats)

### Explicitly unchanged
- Embeddings: all-MiniLM-L6-v2 stays the only embedding model (vectors from different embedding models are incompatible — changing it would force a full re-embed; out of scope)
- Context building (`_build_context_parts`, slicing, recursion) — model-agnostic today, stays that way
- Muses — the system prompt is passed through the adapter, so Muses work identically on every provider

---

## Non-Functional Requirements

- Zero-cost path preserved: Gemini free tier remains the default; Ollama offers a fully-local option
- Missing API keys must never crash startup — providers load lazily, catalog just marks them unavailable
- No provider SDK imports at module top-level except the ones installed; optional dependencies (`anthropic`, `openai`) guarded so `pip install` stays minimal for Gemini-only users

---

## Phasing

**Phase 1 — Gemini model choice (small):** catalog of 2–3 Gemini models (e.g., 2.5 Flash, 2.5 Pro, Flash-Lite), per-chat `model` field, selector UI. No new SDKs — proves the plumbing end to end.

**Phase 2 — Multi-provider:** Anthropic + OpenAI adapters behind API keys, Ollama adapter for local models, provenance labels.

---

## API Changes

### New endpoint
```
GET /api/models
  → [ { id, name, provider, description, available: bool, is_default: bool } ]
```

### Existing endpoints — new fields
```
Chat:            model: string | null      (PATCH /api/chats/:id accepts it, same as muse_id)
Message:         model: string | null      (set by backend on assistant messages)
```

### `.env` additions (all optional — fallbacks; a credential saved in the Model Manager takes precedence)
```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
OLLAMA_BASE_URL=http://localhost:11434
```

### Model Manager endpoints (Phase 2, implemented)
```
GET    /api/models/catalog                        → { models: [ ...+enabled ], providers: { p: { configured, source } } }
PUT    /api/models/providers/{p}/credential       → validates with a live call before storing; 400 on failure
DELETE /api/models/providers/{p}/credential       → removes the stored credential (env fallback may remain)
PATCH  /api/models/{model_id}                     → { enabled: bool } — show/hide in the picker
```

---

## Data Model Changes

```
Chat (addition):
  model: string | null    (null = app default)

Message (addition):
  model: string | null    (provenance; null on user messages and legacy rows)
```

Migration: two `ALTER TABLE ... ADD COLUMN` statements at startup (existing inline migration pattern in `main.py`).

---

## UI / UX

### Where the selector lives
A compact pill in the **chat header** (middle column), next to the chat title:

```
┌──────────────────────────────────────────────────┐
│  My Research Chat            [ ✦ Gemini 2.5 Flash ▾ ]
└──────────────────────────────────────────────────┘
```

Rationale: the model is a property of the *conversation*, like its title — not of the context being sent. The Context panel's Current Context card stays a pure "what the AI sees" status surface (per the 2026-07-02 redesign: state on top, tools below). Putting the model there would re-mix state and controls.

### Dropdown
- Models grouped by provider; the chat's current model checked
- "Default (Gemini 2.5 Flash)" as the first option — clears the per-chat override
- Unavailable models disabled with the enabling hint
- Same inline/expanding interaction language as the Muse picker

### Mid-chat switches
- Assistant messages carry a small model label when a chat contains responses from more than one model
- No warning dialog on switch — it's cheap, reversible, and history is plain text

---

## Implementation Approach

1. **Backend catalog + abstraction** — `app/services/llm/` package: `base.py` (interface), `catalog.py`, `gemini.py` (move existing code); registry function `get_service(model_id)`; `GET /api/models` router
2. **Data model** — `Chat.model` + `Message.model` columns, inline migrations, Pydantic models updated
3. **Send paths** — `chats.py` resolves the chat's model (or default) via the registry; stamps `Message.model` on assistant rows
4. **Frontend** — `modelsAPI.list()`, `Chat.model` in types/store, header pill + dropdown in `ChatArea.tsx`, provenance label in message rendering
5. **Phase 2** — `anthropic.py`, `openai.py`, `ollama.py` adapters with guarded imports; catalog entries; availability checks
6. **Tests** — catalog endpoint, PATCH model on chat, fallback for retired model id, adapter selection (mocked), provenance stamping

---

## Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Can a Muse pin a preferred model? | Yes / No | Not in v1 — keep Muses about personality + context; a chat's model stays a chat setting. Revisit if users ask |
| Global default configurable in UI? | UI setting / `.env` / hardcoded catalog flag | Catalog flag for now; a Settings surface doesn't exist yet and isn't worth building for one knob |
| Per-model params (temperature, max tokens)? | Expose / hide | Hide in v1 — sensible per-adapter defaults; params multiply UI surface fast |
| Ollama model discovery | Static catalog entries / query `/api/tags` live | Query live when `OLLAMA_BASE_URL` is set — local model lists vary too much for a static catalog |
| Show cost/tier info in the dropdown? | Yes / No | Light touch: a "free" badge on Gemini free-tier and Ollama models, nothing else |

---

## Effort Estimate

*All estimates are Claude implementation time (conversation turns), not human-hours.*

| Area | Work |
|------|------|
| Phase 1: catalog + registry + Gemini refactor | ~15 min |
| Phase 1: migrations + PATCH + provenance | ~10 min |
| Phase 1: frontend selector + labels | ~15 min |
| Phase 2: Anthropic/OpenAI/Ollama adapters | ~20 min |
| Tests (both phases) | ~15 min |
| **Total** | **~75 min** |
