import axios from 'axios';
import { API_BASE_URL } from './config';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestConfig = error.config ?? {};
    const originalBaseUrl = String(requestConfig.baseURL || API_BASE_URL || '');

    if (!error.response) {
      error.response = {
        data: {
          error:
            error.code === 'ECONNREFUSED' || String(error.message).includes('Network Error')
              ? `Сервер недоступен (${originalBaseUrl || API_BASE_URL}). Проверьте адрес backend в .env/.env.production.`
              : 'Ошибка подключения к серверу. Проверьте интернет и настройки backend URL.',
        },
      };
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('vibe:user-cache:v1');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }

    return Promise.reject(error);
  },
);

export const authApi = {
  register: async (username: string, fullName: string, password: string) =>
    (await api.post('/auth/register', { username, fullName, password })).data,
  login: async (username: string, password: string) =>
    (await api.post('/auth/login', { username, password })).data,
  verify: async () => (await api.get('/auth/verify')).data,
  updateProfile: async (payload: Record<string, unknown>) => (await api.put('/users/me', payload)).data,
  changePassword: async (currentPassword: string, newPassword: string) =>
    (await api.put('/users/me/password', { currentPassword, newPassword })).data,
};

export const userApi = {
  getMe: async () => (await api.get('/users/me')).data,
  getById: async (id: string) => (await api.get(`/users/${id}`)).data,
  getByUsername: async (username: string) =>
    (await api.get(`/users/by-username/${encodeURIComponent(username)}`)).data,
  search: async (q: string) => (await api.get('/users/search', { params: { q } })).data,
  getNotificationSettings: async () => (await api.get('/users/me/notifications')).data,
  updateNotificationSettings: async (payload: { privateChats?: boolean; groupChats?: boolean }) =>
    (await api.put('/users/me/notifications', payload)).data,
};


export const profileApi = {
  uploadAvatar: async (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return (await api.post('/upload/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
};

export const aiApi = {
  getAIChat: async () => (await api.get('/ai/chat')).data,
  sendMessage: async (
    chatId: string,
    text: string,
    options?: {
      provider?: 'g4f' | 'custom';
      apiKey?: string;
      attachments?: unknown[];
    },
  ) =>
    (
      await api.post('/ai/message', {
        chatId,
        text,
        provider: options?.provider,
        apiKey: options?.apiKey,
        attachments: Array.isArray(options?.attachments) ? options?.attachments : [],
      })
    ).data,
};

export const savedApi = {
  getSavedChat: async () => (await api.get('/saved/chat')).data,
};

export const chatApi = {
  getChats: async () => (await api.get('/chats')).data,
  getById: async (chatId: string) => (await api.get(`/chats/${chatId}`)).data,
  create: async (name: string, type: string, participantIds: string[]) =>
    (await api.post('/chats', { name, type, participantIds })).data,
  updateGroup: async (chatId: string, payload: { name?: string; avatar?: string | null }) =>
    (await api.put(`/chats/${chatId}/group`, payload)).data,
  addParticipants: async (chatId: string, participantIds: string[]) =>
    (await api.post(`/chats/${chatId}/participants`, { participantIds })).data,
  removeParticipant: async (chatId: string, userId: string) =>
    (await api.delete(`/chats/${chatId}/participants/${encodeURIComponent(userId)}`)).data,
  clear: async (chatId: string) => (await api.delete(`/chats/${chatId}/messages`)).data,
  delete: async (chatId: string, deleteForAll = false) =>
    (await api.delete(`/chats/${chatId}`, { data: { deleteForAll } })).data,
  archive: async (chatId: string) => (await api.post(`/chats/${chatId}/archive`)).data,
  unarchive: async (chatId: string) => (await api.delete(`/chats/${chatId}/archive`)).data,
  mute: async (chatId: string) => (await api.post(`/chats/${chatId}/mute`)).data,
  pin: async (chatId: string) => (await api.post(`/chats/${chatId}/pin`)).data,
  block: async (chatId: string, userId: string) =>
    (await api.post(`/chats/${chatId}/block`, { userId })).data,
  unblock: async (chatId: string, userId: string) =>
    (await api.delete(`/chats/${chatId}/block`, { data: { userId } })).data,
};

export const messageApi = {
  getByChatId: async (chatId: string, limit = 50, offset = 0) =>
    (await api.get(`/messages/chat/${chatId}`, { params: { limit, offset } })).data,
  getPinnedByChatId: async (chatId: string) =>
    (await api.get(`/chats/${chatId}/pins`)).data,
  pinInChat: async (chatId: string, messageId: string) =>
    (await api.post(`/chats/${chatId}/pins`, { messageId })).data,
  unpinInChat: async (chatId: string, messageId: string) =>
    (await api.delete(`/chats/${chatId}/pins/${encodeURIComponent(messageId)}`)).data,
  send: async (chatId: string, text: string, attachments: unknown[] = [], replyToId?: string) =>
    (await api.post('/messages', { chatId, text, attachments, replyToId })).data,
  markAsRead: async (chatId: string) => (await api.post('/messages/read', { chatId })).data,
  setReaction: async (messageId: string, reaction: string) =>
    (await api.post(`/messages/${messageId}/reaction`, { reaction })).data,
  removeReaction: async (messageId: string) =>
    (await api.delete(`/messages/${messageId}/reaction`)).data,
  getReactions: async (messageId: string, limit = 300) =>
    (await api.get(`/messages/${messageId}/reactions`, { params: { limit } })).data,
  delete: async (messageId: string, deleteForAll = false) =>
    (await api.delete(`/messages/${messageId}`, { data: { deleteForAll } })).data,
  update: async (messageId: string, text: string) =>
    (await api.put(`/messages/${messageId}`, { text })).data,
};

export const notificationsApi = {
  getActive: async (versionCode: number) =>
    (await api.get('/notifications', { params: { vc: versionCode } })).data,
  dismiss: async (id: string) => (await api.post(`/notifications/${id}/dismiss`)).data,
  dismissAll: async () => (await api.post('/notifications/dismiss-all')).data,
};

export const adminApi = {
  getOverview: async () => (await api.get('/admin/overview')).data,
  getUsers: async () => (await api.get('/admin/users')).data,
  clearAllChats: async () => (await api.post('/admin/clear-chats')).data,
  clearAllMessages: async () => (await api.post('/admin/clear-messages')).data,
  clearAllContent: async () => (await api.post('/admin/clear-content')).data,
  clearPushTokens: async () => (await api.post('/admin/clear-push-tokens')).data,
  updateAppConfig: async (payload: { gameEnabled: boolean }) =>
    (await api.put('/admin/app-config', payload)).data,
  createEvent: async (payload: {
    template?: 'update' | 'custom';
    title?: string;
    message?: string;
    downloadUrl?: string;
  }) => (await api.post('/admin/events', payload)).data,
  resetUsersExceptCreator: async () => (await api.post('/admin/reset-users')).data,
  deleteUserByUsername: async (username: string) =>
    (await api.post('/admin/users/delete', { username })).data,
};

export const pushApi = {
  registerToken: async (token: string, platform: string) =>
    (await api.post('/push/token', { token, platform })).data,
  unregisterToken: async (token = '') =>
    (await api.delete('/push/token', { data: { token } })).data,
};

export const storyApi = {
  getFeed: async () => (await api.get('/stories')).data,
  getMine: async () => (await api.get('/stories/mine')).data,
  create: async (payload: { text?: string; mediaUrl?: string; mediaUrls?: string[] }) =>
    (await api.post('/stories', payload)).data,
  markViewed: async (storyId: string) => (await api.post(`/stories/${storyId}/view`)).data,
  getViewers: async (storyId: string) => (await api.get(`/stories/${storyId}/viewers`)).data,
  delete: async (storyId: string) => (await api.delete(`/stories/${storyId}`)).data,
};

export const gameApi = {
  getOnlineStatus: async () => (await api.get('/game/online')).data,
};

export const appConfigApi = {
  get: async () => (await api.get('/app/config')).data,
};

export const supportApi = {
  createTicket: async (category: string, subject: string) =>
    (await api.post('/support/tickets', { category, subject })).data,
  getMyTickets: async () => (await api.get('/support/tickets/my')).data,
  getAllTickets: async (status?: string) =>
    (await api.get('/support/tickets', { params: status ? { status } : {} })).data,
  getTicket: async (id: string) => (await api.get(`/support/tickets/${id}`)).data,
  claimTicket: async (id: string) => (await api.post(`/support/tickets/${id}/claim`)).data,
  closeTicket: async (id: string) => (await api.post(`/support/tickets/${id}/close`)).data,
  getMessages: async (id: string) => (await api.get(`/support/tickets/${id}/messages`)).data,
  sendMessage: async (id: string, text: string) =>
    (await api.post(`/support/tickets/${id}/messages`, { text })).data,
};

export const storageApi = {
  getStats: async () => (await api.get('/upload/storage-stats')).data,
  clearCache: async () => (await api.delete('/upload/clear-cache')).data,
};

export const privacyApi = {
  getSettings: async () => (await api.get('/users/me/privacy')).data,
  updateSetting: async (
    settingKey: string,
    value: string,
    alwaysShareWith: string[],
    neverShareWith: string[],
  ) =>
    (
      await api.put('/users/me/privacy', {
        settingKey,
        value,
        alwaysShareWith,
        neverShareWith,
      })
    ).data,
};

export const uploadApi = {
  uploadFiles: async (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    const response = await api.post('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data.files;
  },
  uploadGroupAvatar: async (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return (
      await api.post('/upload/group-avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
  uploadStoryFiles: async (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    const response = await api.post('/upload/story', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data.files;
  },
  getFileInfo: async (id: string) => (await api.get(`/upload/info/${id}`)).data,
  deleteFile: async (id: string) => (await api.delete(`/upload/${id}`)).data,
};

