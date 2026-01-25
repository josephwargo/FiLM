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

  update: (folderId: string, data: { name?: string; parent_id?: string }) =>
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
