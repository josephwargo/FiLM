# RAG / Context System — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Complete

## Overview

The RAG system lets users attach past chats and uploaded files as context to any conversation. Instead of re-explaining background to the AI every time, users build up a library of context and reuse it. This is the core value proposition that separates FiLM from a standard chat wrapper.

## User Stories

- As a user, I can select one or more past chats to include as context in a new or existing chat
- As a user, I can upload a PDF, TXT, or MD file and use it as context
- As a user, I can organize uploaded files into folders and subfolders
- As a user, I can attach an entire file folder as context (all files in it, including subfolders)
- As a user, I can see exactly what context is attached to my current chat
- As a user, I can remove a context attachment without affecting the source chat or file
- As a user, I can delete uploaded files I no longer need
- As a user, I can collapse the context panel when I need more screen space
- As a user, I can resize the context panel to my preferred width

## Functional Requirements

### Implemented
- Select past chats as context for new or existing conversations
- Upload files (PDF, TXT, MD) for use as RAG context
- PDF text extraction via pypdf
- Embed and store chat messages and file content in ChromaDB
- Inject retrieved context into Gemini prompts
- Visual indicator showing attached context per chat
- Drag & drop context panel with "Current Context" drop zone
- Context attachments persist per chat across sessions
- Delete uploaded files

**File Folders (new)**
- Create file folders to organize uploaded files
- Nest file folders inside other file folders (arbitrary depth)
- Drag files onto file folder rows to move them into that folder
- Drag file folders onto other file folder rows to nest them
- Cycle detection — cannot drop a folder into its own descendant
- Attach an entire file folder as context: recursively collects all files in the folder and its children and attaches each one individually
- Unattached count badge shows how many items in a folder/subfolder tree are not yet attached
- When a file folder is deleted, its files become unfiled; its child folders are promoted to the grandparent

**Context Panel UX (new)**
- Collapsible panel: collapses to a 40px strip on the right edge
- Drag-to-resize panel (left edge handle; min and max width enforced)
- Visually distinct from the sidebar: indigo/purple palette (`--ctx-accent: #6366f1`) vs. sidebar's red palette
- Sections: Current Context (drop zone), Chat Folders, Unfiled Chats, File Folders, Unfiled Files
- "Chat Folders" section in the context panel mirrors the sidebar's folder tree for easy selection

### Out of Scope (v1)
- Web page / URL ingestion
- Auto-suggested context based on chat topic

## Non-Functional Requirements

- Embeddings generated locally via Sentence Transformers (all-MiniLM-L6-v2) — no external embedding cost
- ChromaDB stored locally; no cloud dependency
- Context retrieval must not noticeably delay message send

## API Surface

```
# Attachments
GET    /api/context/:chat_id              - Get all context attachments for a chat
POST   /api/context/attach               - Attach a chat or file as context
DELETE /api/context/detach/:attachment_id - Remove a context attachment

# Uploaded files
GET    /api/context/files                - List all uploaded files (includes file_folder_id)
POST   /api/context/files/upload         - Upload file (PDF, TXT, MD)
PATCH  /api/context/files/:id            - Move file to a folder (set file_folder_id)
DELETE /api/context/files/:id            - Delete uploaded file

# File folders
GET    /api/context/file-folders         - List file folder tree (recursive)
POST   /api/context/file-folders         - Create file folder
PATCH  /api/context/file-folders/:id     - Move/rename file folder (set parent_id)
DELETE /api/context/file-folders/:id     - Delete file folder (promotes children)
```

## Data Models

```
ContextAttachment:
  id:          string (UUID)
  chat_id:     string (FK to Chat — the chat using this context)
  source_type: "chat" | "file"
  source_id:   string
  created_at:  datetime

UploadedFile:
  id:                string (UUID)
  filename:          string (stored filename on disk)
  original_filename: string
  content_type:      string
  size:              int
  file_folder_id:    string | null  (FK to FileFolder)
  created_at:        datetime

FileFolder:
  id:         string (UUID)
  name:       string
  parent_id:  string | null  (self-referential FK — enables unlimited nesting)
  created_at: datetime
```

## Tech Details

| Component | Choice | Notes |
|-----------|--------|-------|
| Vector DB | ChromaDB | Local, metadata filtering |
| Embeddings | Sentence Transformers | all-MiniLM-L6-v2, runs locally |
| PDF parsing | pypdf | Text extraction only |
| LLM | Gemini 2.0 Flash | Context injected into prompt |

## Implementation Notes

- `file_folder_id` added to `UploadedFile` via inline `ALTER TABLE` migration at startup (no manual DB deletion required)
- `parent_id` added to `FileFolder` via same inline migration strategy
- `_file_folder_is_descendant()` backend helper prevents cycle creation when nesting folders
- Frontend `collectFileFolderFiles(folder)` recurses through children to gather all files for bulk-attach
- `fileFolderUnattached(folder, attachedIds)` recursively counts unattached items for the badge
- Drag disambiguation: `dataTransfer` keys `contextType` + `contextId` distinguish file drags from file-folder drags on the same drop target
