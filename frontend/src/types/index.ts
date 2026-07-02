export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string | null;
}

export interface Chat {
  id: string;
  title: string;
  folder_id: string | null;
  muse_id: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  messages: Message[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  available: boolean;
  is_default: boolean;
}

export interface CatalogModel extends ModelInfo {
  enabled: boolean;
}

export interface ProviderStatus {
  configured: boolean;
  source: 'db' | 'env' | null;
  models?: string[]; // ollama only: discovered model tags
}

export interface ModelCatalog {
  models: CatalogModel[];
  providers: Record<string, ProviderStatus>;
}

export interface SendErrorInfo {
  type: 'auth' | 'provider';
  provider: string | null;
  model: string | null;
  message: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  folder_id: string | null;
  muse_id: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface Muse {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  created_at: string;
}

export interface MuseContext {
  id: string;
  muse_id: string;
  source_type: 'chat' | 'file';
  source_id: string;
  start_message_id: string | null;
  end_message_id: string | null;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolderTreeItem {
  id: string;
  name: string;
  parent_id: string | null;
  children: FolderTreeItem[];
  chats: { id: string; title: string }[];
}

export interface ContextAttachment {
  id: string;
  chat_id: string;
  source_type: 'chat' | 'file';
  source_id: string;
  start_message_id: string | null;
  end_message_id: string | null;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  size: number;
  file_folder_id: string | null;
  created_at: string;
}

export interface FileFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  files: UploadedFile[];
  children: FileFolder[];
}
