import { create } from 'zustand';
import type { Chat, ChatListItem, Message, FolderTreeItem, Muse, ModelInfo, SendErrorInfo } from '../types';
import { chatsAPI, foldersAPI, musesAPI, modelsAPI } from '../services/api';

interface ChatStore {
  // State
  chats: ChatListItem[];
  currentChat: Chat | null;
  folderTree: FolderTreeItem[];
  muses: Muse[];
  models: ModelInfo[];
  isLoading: boolean;
  isSending: boolean;
  streamingContent: string | null;
  error: string | null;
  sendError: SendErrorInfo | null;
  view: 'chat' | 'muse-library' | 'model-manager';
  museLibraryTarget: string | 'new' | null;

  // Actions
  goHome: () => void;
  openMuseLibrary: (target?: string | 'new') => void;
  closeMuseLibrary: () => void;
  openModelManager: () => void;
  closeModelManager: () => void;
  loadChats: () => Promise<void>;
  loadFolderTree: () => Promise<void>;
  loadMuses: () => Promise<void>;
  loadModels: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  createChat: (folderId?: string) => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  moveChat: (chatId: string, folderId: string | null) => Promise<void>;
  setMuse: (chatId: string, museId: string | null) => Promise<void>;
  setChatModel: (chatId: string, modelId: string | null) => Promise<void>;
  sendMessage: (message: string, contextIds?: string[]) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  createMuse: (data: { name: string; description?: string; system_prompt: string }) => Promise<Muse>;
  updateMuse: (museId: string, data: { name?: string; description?: string; system_prompt?: string }) => Promise<void>;
  deleteMuse: (museId: string) => Promise<void>;
  clearError: () => void;
  clearSendError: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChat: null,
  folderTree: [],
  muses: [],
  models: [],
  isLoading: false,
  isSending: false,
  streamingContent: null,
  error: null,
  sendError: null,
  view: 'chat',
  museLibraryTarget: null,

  goHome: () => set({ view: 'chat', currentChat: null, museLibraryTarget: null }),

  openMuseLibrary: (target?: string | 'new') =>
    set({ view: 'muse-library', museLibraryTarget: target ?? null }),

  closeMuseLibrary: () => set({ view: 'chat', museLibraryTarget: null }),

  openModelManager: () => set({ view: 'model-manager', museLibraryTarget: null }),

  closeModelManager: () => set({ view: 'chat' }),

  loadChats: async () => {
    try {
      set({ isLoading: true, error: null });
      const chats = await chatsAPI.list();
      set({ chats, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadFolderTree: async () => {
    try {
      const folderTree = await foldersAPI.getTree();
      set({ folderTree });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  loadMuses: async () => {
    try {
      const muses = await musesAPI.list();
      set({ muses });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  loadModels: async () => {
    try {
      const models = await modelsAPI.list();
      set({ models });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  selectChat: async (chatId: string) => {
    try {
      set({ isLoading: true, error: null });
      const chat = await chatsAPI.get(chatId);
      set({ currentChat: chat, isLoading: false, view: 'chat', museLibraryTarget: null });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  createChat: async (folderId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const chat = await chatsAPI.create({ folder_id: folderId });
      await get().loadChats();
      set({ currentChat: { ...chat, messages: [] }, isLoading: false });
      return chat;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      await chatsAPI.delete(chatId);
      if (get().currentChat?.id === chatId) {
        set({ currentChat: null });
      }
      await get().loadChats();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  renameChat: async (chatId: string, title: string) => {
    try {
      await chatsAPI.update(chatId, { title });
      await get().loadChats();
      if (get().currentChat?.id === chatId) {
        set((state) => ({
          currentChat: state.currentChat ? { ...state.currentChat, title } : null,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  moveChat: async (chatId: string, folderId: string | null) => {
    try {
      await chatsAPI.update(chatId, { folder_id: folderId || undefined });
      await get().loadChats();
      await get().loadFolderTree();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setMuse: async (chatId: string, museId: string | null) => {
    try {
      const updated = await chatsAPI.update(chatId, { muse_id: museId ?? '' });
      if (get().currentChat?.id === chatId) {
        set((state) => ({
          currentChat: state.currentChat ? { ...state.currentChat, muse_id: updated.muse_id } : null,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setChatModel: async (chatId: string, modelId: string | null) => {
    try {
      const updated = await chatsAPI.update(chatId, { model: modelId ?? '' });
      if (get().currentChat?.id === chatId) {
        set((state) => ({
          currentChat: state.currentChat ? { ...state.currentChat, model: updated.model } : null,
        }));
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  sendMessage: async (message: string, _contextIds: string[] = []) => {
    const currentChat = get().currentChat;
    if (!currentChat) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      chat_id: currentChat.id,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      currentChat: state.currentChat
        ? { ...state.currentChat, messages: [...state.currentChat.messages, userMessage] }
        : null,
      isSending: true,
      streamingContent: '',
      sendError: null,
    }));

    await new Promise<void>((resolve) => {
      chatsAPI.streamMessage(
        currentChat.id,
        message,
        (chunk) => {
          set((state) => ({ streamingContent: (state.streamingContent ?? '') + chunk }));
        },
        (messageId, title, model, contextSnapshot) => {
          const finalContent = get().streamingContent ?? '';
          const assistantMessage: Message = {
            id: messageId,
            chat_id: currentChat.id,
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
            model: model ?? null,
            context_snapshot: contextSnapshot ?? null,
          };
          set((state) => ({
            currentChat: state.currentChat
              ? {
                  ...state.currentChat,
                  title: title ?? state.currentChat.title,
                  messages: [...state.currentChat.messages, assistantMessage],
                }
              : null,
            isSending: false,
            streamingContent: null,
          }));
          get().loadChats();
          resolve();
        },
        (error, info) => {
          set({
            error: info ? null : error.message,
            sendError: info ?? null,
            isSending: false,
            streamingContent: null,
          });
          resolve();
        }
      );
    });
  },

  createFolder: async (name: string, parentId?: string) => {
    try {
      await foldersAPI.create({ name, parent_id: parentId });
      await get().loadFolderTree();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteFolder: async (folderId: string) => {
    try {
      await foldersAPI.delete(folderId);
      await get().loadFolderTree();
      await get().loadChats();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createMuse: async (data) => {
    try {
      const muse = await musesAPI.create(data);
      await get().loadMuses();
      return muse;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  updateMuse: async (museId, data) => {
    try {
      await musesAPI.update(museId, data);
      await get().loadMuses();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteMuse: async (museId) => {
    try {
      await musesAPI.delete(museId);
      await get().loadMuses();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  clearError: () => set({ error: null }),

  clearSendError: () => set({ sendError: null }),
}));
