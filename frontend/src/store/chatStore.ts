import { create } from 'zustand';
import type { Chat, ChatListItem, Message, FolderTreeItem } from '../types';
import { chatsAPI, foldersAPI } from '../services/api';

interface ChatStore {
  // State
  chats: ChatListItem[];
  currentChat: Chat | null;
  folderTree: FolderTreeItem[];
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  // Actions
  loadChats: () => Promise<void>;
  loadFolderTree: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  createChat: (folderId?: string) => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  moveChat: (chatId: string, folderId: string | null) => Promise<void>;
  sendMessage: (message: string, contextIds?: string[]) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  clearError: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChat: null,
  folderTree: [],
  isLoading: false,
  isSending: false,
  error: null,

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

  selectChat: async (chatId: string) => {
    try {
      set({ isLoading: true, error: null });
      const chat = await chatsAPI.get(chatId);
      set({ currentChat: chat, isLoading: false });
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

  sendMessage: async (message: string, contextIds: string[] = []) => {
    const currentChat = get().currentChat;
    if (!currentChat) return;

    // Optimistically add user message
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
    }));

    try {
      const response = await chatsAPI.sendMessage(currentChat.id, message, contextIds);

      // Add assistant message
      const assistantMessage: Message = {
        id: response.message_id,
        chat_id: currentChat.id,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      };

      set((state) => ({
        currentChat: state.currentChat
          ? { ...state.currentChat, messages: [...state.currentChat.messages, assistantMessage] }
          : null,
        isSending: false,
      }));

      // Reload chats to update title if needed
      await get().loadChats();
    } catch (error) {
      set({ error: (error as Error).message, isSending: false });
    }
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

  clearError: () => set({ error: null }),
}));
