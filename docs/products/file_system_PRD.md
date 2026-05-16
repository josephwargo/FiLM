# Virtual File System — PRD

**Part of:** [FiLM Master PRD](../Master_PRD.md)
**Status:** Complete

## Overview

The virtual file system lets users organize chats into folders and subfolders, just like a file manager. It is the primary differentiator of FiLM from a standard chat app. The goal is to make it feel natural and fast to navigate — not like an afterthought bolted onto a chat UI.

## User Stories

- As a user, I can create folders and subfolders to organize my chats by project or topic
- As a user, I can rename, move, and delete chats and folders
- As a user, I can drag and drop chats into folders without leaving the current view
- As a user, I can nest folders inside other folders to create a deep hierarchy
- As a user, I can collapse the sidebar when I need more screen space
- As a user, I can resize the sidebar to my preferred width
- As a user, I can find any chat quickly via search

## Functional Requirements

### Implemented
- Create folders and subfolders (arbitrary nesting depth)
- Move, rename, and delete chats and folders
- Drag & drop chats into folders
- Drag & drop folders into other folders (nesting)
- Cycle detection — cannot drop a folder into its own descendant
- Persistent folder structure in SQLite (self-referential `parent_id` FK)
- Collapsible sidebar (collapses to a 40px strip; expands back to saved width)
- Drag-to-resize sidebar (min 160px, max 520px)
- "Library" header label mirrors the Context panel header style
- "Chat Folders" section label for the folder tree
- "Unfiled Chats" section label for root-level chats
- Root drop zone: drag a chat to the "Unfiled Chats" area to remove it from any folder
- When a folder is deleted, its chats stay; child folders are promoted to the deleted folder's parent

### In Progress / Planned
- [ ] Search across all chats (title + message content)

## Non-Functional Requirements

- Folder tree must render instantly (local data, no perceptible lag)
- Drag & drop must feel responsive and provide clear visual feedback (highlighted drop targets)
- Sidebar collapse/resize must be smooth with no layout flash

## API Surface

```
GET    /api/folders            - List full folder tree (recursive)
POST   /api/folders            - Create folder
PATCH  /api/folders/:id        - Update folder (rename, set parent_id for nesting)
DELETE /api/folders/:id        - Delete folder (promotes children to grandparent)
PATCH  /api/chats/:id          - Move or rename a chat (folder_id update)
```

## Data Models

```
Folder:
  id:         string (UUID)
  name:       string
  parent_id:  string | null  (self-referential FK — enables unlimited nesting)
  created_at: datetime

Chat:
  id:         string (UUID)
  title:      string
  folder_id:  string | null  (FK to Folder — null = unfiled)
  ...
```

## Implementation Notes

- `parent_id` is set via PATCH with Pydantic `model_fields_set` to distinguish "not sent" from "explicitly null" — allows moving a folder to root by sending `{ "parent_id": null }`
- Backend `_is_descendant()` helper walks the parent chain to prevent cycles
- Frontend tracks `draggedFolderId` in state; folder rows skip `drag-over` highlight when the dragged folder is hovering over itself
- Sidebar collapse saves current width to a ref so it restores to the exact same width on expand
