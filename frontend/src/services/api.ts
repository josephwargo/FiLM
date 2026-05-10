const API_BASE = 'http://localhost:8000/api';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'API request failed');
  }

  return response.json();
}

// Chats
export const chatsAPI = {
  list: (folderId?: string) =>
    fetchAPI<any[]>(`/chats${folderId ? `?folder_id=${folderId}` : ''}`),

  get: (chatId: string) =>
    fetchAPI<any>(`/chats/${chatId}`),

  create: (data: { title?: string; folder_id?: string }) =>
    fetchAPI<any>('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (chatId: string, data: { title?: string; folder_id?: string }) =>
    fetchAPI<any>(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (chatId: string) =>
    fetchAPI<any>(`/chats/${chatId}`, { method: 'DELETE' }),

  sendMessage: (chatId: string, message: string, contextIds: string[] = []) =>
    fetchAPI<{ response: string; message_id: string }>(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, context_ids: contextIds }),
    }),

  streamMessage: async (
    chatId: string,
    message: string,
    onChunk: (chunk: string) => void,
    onDone: (messageId: string, title?: string) => void,
    onError: (error: Error) => void
  ) => {
    try {
      const response = await fetch(`${API_BASE}/chats/${chatId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context_ids: [] }),
      });

      if (!response.ok) throw new Error('Stream request failed');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.chunk !== undefined) onChunk(data.chunk);
          else if (data.done) onDone(data.message_id, data.title);
        }
      }
    } catch (error) {
      onError(error as Error);
    }
  },
};

// Folders
export const foldersAPI = {
  list: (parentId?: string) =>
    fetchAPI<any[]>(`/folders${parentId ? `?parent_id=${parentId}` : ''}`),

  getTree: () =>
    fetchAPI<any[]>('/folders/tree'),

  create: (data: { name: string; parent_id?: string }) =>
    fetchAPI<any>('/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (folderId: string, data: { name?: string; parent_id?: string | null }) =>
    fetchAPI<any>(`/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (folderId: string) =>
    fetchAPI<any>(`/folders/${folderId}`, { method: 'DELETE' }),
};

// Context
export const contextAPI = {
  getAttachments: (chatId: string) =>
    fetchAPI<any[]>(`/context/${chatId}`),

  attach: (chatId: string, sourceType: 'chat' | 'file', sourceId: string) =>
    fetchAPI<any>('/context/attach', {
      method: 'POST',
      body: JSON.stringify({ chat_id: chatId, source_type: sourceType, source_id: sourceId }),
    }),

  detach: (attachmentId: string) =>
    fetchAPI<any>(`/context/detach/${attachmentId}`, { method: 'DELETE' }),

  listFiles: () =>
    fetchAPI<any[]>('/context/files'),

  deleteFile: (fileId: string) =>
    fetchAPI<any>(`/context/files/${fileId}`, { method: 'DELETE' }),

  moveFile: (fileId: string, folderId: string | null) =>
    fetchAPI<any>(`/context/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ file_folder_id: folderId }),
    }),

  listFileFolders: () =>
    fetchAPI<any[]>('/context/file-folders'),

  createFileFolder: (name: string) =>
    fetchAPI<any>('/context/file-folders', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteFileFolder: (folderId: string) =>
    fetchAPI<any>(`/context/file-folders/${folderId}`, { method: 'DELETE' }),

  moveFileFolder: (folderId: string, parentId: string | null) =>
    fetchAPI<any>(`/context/file-folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: parentId }),
    }),

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/context/files/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('File upload failed');
    }

    return response.json();
  },
};
