// Service for communicating with Telegram MTProto client
// In Android APK and mobile environments, routes directly to telegramDirectClient (GramJS WSS).
// In web dev mode, routes to /api/telegram local backend with seamless telegramDirectClient fallback.

import { TeleForgeDialogFilter } from '../types';
import { telegramDirectClient } from './telegramDirectClient';

export interface TelegramUser {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  username: string;
  phone: string;
  bio?: string;
  isBot: boolean;
  isSelf: boolean;
  isVerified: boolean;
  hasAvatar?: boolean;
  photoId?: string;
  avatar?: string;
}

export interface TelegramDialog {
  id: string;
  title: string;
  username?: string;
  phone?: string;
  isUser: boolean;
  isGroup: boolean;
  isChannel: boolean;
  isVerified: boolean;
  hasAvatar?: boolean;
  avatar?: string;
  thumbUrl?: string;
  unreadCount: number;
  unreadMentionsCount: number;
  pinned: boolean;
  isJoined?: boolean;
  memberCount?: number;
  participantsCount?: number;
  date: number;
  lastMessage?: {
    id?: number;
    text: string;
    date: number;
    out: boolean;
    senderId?: string;
  };
}

export interface TelegramMessage {
  id: number;
  text: string;
  date: number;
  out: boolean;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderThumbUrl?: string;
  hasMedia?: boolean;
  mediaType?: 'photo' | 'video' | 'voice' | 'audio' | 'document' | null;
  mediaThumb?: string;
  fileName?: string;
  fileSize?: string;
  replyToMsgId?: number;
  reactions?: { emoji: string; count: number; userReacted?: boolean }[];
}

export interface AuthStatusResponse {
  authorized: boolean;
  configured: boolean;
  user?: TelegramUser;
  error?: string;
}

export interface SendCodeResponse {
  success: boolean;
  phoneCodeHash: string;
  isCodeViaApp: boolean;
  type?: string;
}

export interface SignInResponse {
  success: boolean;
  requires2FA?: boolean;
  user?: TelegramUser;
  message?: string;
}

export interface TelegramSessionInfo {
  hash: string;
  deviceModel: string;
  platform: string;
  systemVersion: string;
  appName: string;
  appVersion: string;
  dateActive: number;
  dateCreated: number;
  ip: string;
  country: string;
  region: string;
  current: boolean;
  officialApp?: boolean;
}

declare global {
  interface Window {
    __IS_TELEFORGE_ANDROID__?: boolean;
    __TELEFORGE_EMULATOR_HOST__?: string;
  }
}

export function isAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.__IS_TELEFORGE_ANDROID__ ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('TeleForgeAndroid')) ||
    window.location.origin.includes('androidplatform.net') ||
    window.location.origin.startsWith('file:') ||
    window.location.origin === 'null'
  );
}

export function getBackendServerHost(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = localStorage.getItem('teleforge_server_host');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  } catch (e) {}
  return '';
}

export function setBackendServerHost(host: string): void {
  try {
    if (!host || !host.trim()) {
      localStorage.removeItem('teleforge_server_host');
    } else {
      let clean = host.trim().replace(/\/+$/, '');
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = `http://${clean}`;
      }
      localStorage.setItem('teleforge_server_host', clean);
    }
  } catch (e) {}
}

export function getApiBase(): string {
  const host = getBackendServerHost();
  return host ? `${host}/api/telegram` : '/api/telegram';
}

export function resolveApiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const host = getBackendServerHost();
  if (!host) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${host}${cleanPath}`;
}

export function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function probeBackendServer(): Promise<string> {
  return '';
}

export const telegramApi = {
  async getConfig(): Promise<{ hasCredentials: boolean; apiId: number }> {
    if (isAndroidApp()) {
      return { hasCredentials: true, apiId: 30519813 };
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/config`, {}, 2000);
      if (res.ok) return res.json();
    } catch (e) {}
    return { hasCredentials: true, apiId: 30519813 };
  },

  async setConfig(apiId: number, apiHash: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async getAuthStatus(): Promise<AuthStatusResponse> {
    if (isAndroidApp()) {
      return telegramDirectClient.checkAuthStatus();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/status`, {}, 2000);
      if (res.ok) return res.json();
    } catch (e) {}
    return telegramDirectClient.checkAuthStatus();
  },

  async sendCode(phoneNumber: string): Promise<SendCodeResponse> {
    if (isAndroidApp()) {
      return telegramDirectClient.sendCode(phoneNumber);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/sendCode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      }, 8000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
      return data;
    } catch (err: any) {
      return telegramDirectClient.sendCode(phoneNumber);
    }
  },

  async signIn(phoneNumber: string, phoneCode: string, phoneCodeHash?: string): Promise<SignInResponse> {
    if (isAndroidApp()) {
      return telegramDirectClient.signIn(phoneNumber, phoneCode, phoneCodeHash);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/signIn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, phoneCode, phoneCodeHash }),
      }, 8000);
      const data = await res.json();
      if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Failed to sign in');
      return data;
    } catch (err: any) {
      return telegramDirectClient.signIn(phoneNumber, phoneCode, phoneCodeHash);
    }
  },

  async submit2FA(password: string): Promise<{ success: boolean; user?: TelegramUser }> {
    if (isAndroidApp()) {
      return telegramDirectClient.submit2FA(password);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }, 8000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Two-step verification password failed');
      return data;
    } catch (err: any) {
      return telegramDirectClient.submit2FA(password);
    }
  },

  async logout(): Promise<{ success: boolean }> {
    if (isAndroidApp()) {
      return telegramDirectClient.logout();
    }
    try {
      await fetchWithTimeout(`${getApiBase()}/auth/logout`, { method: 'POST' }, 2000);
    } catch (e) {}
    return telegramDirectClient.logout();
  },

  async getDialogs(limit = 50): Promise<TelegramDialog[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getDialogs(limit);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/dialogs?limit=${limit}`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        return data.dialogs || [];
      }
    } catch (e) {}
    return telegramDirectClient.getDialogs(limit);
  },

  async getMessages(chatId: string, limit = 50, offsetId?: number): Promise<TelegramMessage[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getMessages(chatId, limit, offsetId);
    }
    try {
      let url = `${getApiBase()}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}`;
      if (offsetId && offsetId > 0) {
        url += `&offsetId=${offsetId}`;
      }
      const res = await fetchWithTimeout(url, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (e) {}
    return telegramDirectClient.getMessages(chatId, limit, offsetId);
  },

  async sendMessage(chatId: string, message: string, replyToMsgId?: number): Promise<TelegramMessage> {
    if (isAndroidApp()) {
      return telegramDirectClient.sendMessage(chatId, message, replyToMsgId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message, replyToMsgId }),
      }, 6000);
      const data = await res.json();
      if (res.ok) return data.message;
    } catch (e) {}
    return telegramDirectClient.sendMessage(chatId, message, replyToMsgId);
  },

  async sendReaction(chatId: string, messageId: string, emoji?: string): Promise<{ success: boolean }> {
    if (isAndroidApp()) {
      return telegramDirectClient.sendReaction(chatId, messageId, emoji);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, emoji }),
      }, 4000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.sendReaction(chatId, messageId, emoji);
  },

  async editMessage(chatId: string, messageId: string, text: string): Promise<{ success: boolean; message: any }> {
    if (isAndroidApp()) {
      return telegramDirectClient.editMessage(chatId, messageId, text);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, text }),
      }, 5000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.editMessage(chatId, messageId, text);
  },

  async deleteMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    if (isAndroidApp()) {
      return telegramDirectClient.deleteMessage(chatId, messageId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId }),
      }, 5000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.deleteMessage(chatId, messageId);
  },

  async pinMessage(chatId: string, messageId: string, silent = false): Promise<{ success: boolean }> {
    if (isAndroidApp()) {
      return telegramDirectClient.pinMessage(chatId, messageId, silent);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, messageId, silent }),
      }, 5000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.pinMessage(chatId, messageId, silent);
  },

  async getContacts(): Promise<TelegramUser[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getContacts();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/contacts`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        return data.contacts || [];
      }
    } catch (e) {}
    return telegramDirectClient.getContacts();
  },

  getAvatarUrl(peerId: string): string {
    return `${getApiBase()}/avatar?id=${encodeURIComponent(peerId)}`;
  },

  getMediaUrl(chatId: string, messageId: number): string {
    return `${getApiBase()}/media?chatId=${encodeURIComponent(chatId)}&messageId=${messageId}`;
  },

  async getDialogFilters(): Promise<TeleForgeDialogFilter[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getDialogFilters();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/folders`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        return (data.folders || []).map((f: any) => ({
          ...f,
          title: typeof f.title === 'string' ? f.title : (f.title?.text ? String(f.title.text) : String(f.title || 'Folder')),
          emoticon: typeof f.emoticon === 'string' ? f.emoticon : (f.emoticon?.text ? String(f.emoticon.text) : ''),
        }));
      }
    } catch (e) {}
    return telegramDirectClient.getDialogFilters();
  },

  async saveDialogFilter(filter: Partial<TeleForgeDialogFilter> & { title: string }): Promise<{ success: boolean; filter: TeleForgeDialogFilter }> {
    if (isAndroidApp()) {
      return telegramDirectClient.saveDialogFilter(filter);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter),
      }, 6000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.saveDialogFilter(filter);
  },

  async deleteDialogFilter(id: string): Promise<{ success: boolean; id: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.deleteDialogFilter(id);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/folders/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }, 5000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.deleteDialogFilter(id);
  },

  async reorderDialogFilters(order: string[]): Promise<{ success: boolean; order: number[] }> {
    if (isAndroidApp()) {
      return telegramDirectClient.reorderDialogFilters(order);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/folders/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }, 5000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.reorderDialogFilters(order);
  },

  async getChatFullInfo(id: string): Promise<{ id: string; memberCount?: number; about?: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.getChatFullInfo(id);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/chat/info?id=${encodeURIComponent(id)}`, {}, 4000);
      if (res.ok) {
        const data = await res.json();
        return data.info || { id };
      }
    } catch (e) {}
    return telegramDirectClient.getChatFullInfo(id);
  },

  async markAsRead(chatId: string): Promise<void> {
    if (isAndroidApp()) {
      return telegramDirectClient.markAsRead(chatId);
    }
    try {
      await fetchWithTimeout(`${getApiBase()}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      }, 3000);
    } catch (e) {
      telegramDirectClient.markAsRead(chatId).catch(() => {});
    }
  },

  async searchGlobal(
    q: string,
    limit = 20
  ): Promise<{ myResults: TelegramDialog[]; globalResults: TelegramDialog[] }> {
    if (isAndroidApp()) {
      return telegramDirectClient.searchGlobal(q, limit);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/search?q=${encodeURIComponent(q.trim())}&limit=${limit}`, {}, 6000);
      if (res.ok) {
        const data = await res.json();
        return data || { myResults: [], globalResults: [] };
      }
    } catch (e) {}
    return telegramDirectClient.searchGlobal(q, limit);
  },

  async joinChat(chatId: string): Promise<{ success: boolean; error?: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.joinChat(chatId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      }, 6000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.joinChat(chatId);
  },

  async getProfile(): Promise<{ success: boolean; user: TelegramUser }> {
    if (isAndroidApp()) {
      return telegramDirectClient.getProfile();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/profile`, {}, 4000);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {}
    return telegramDirectClient.getProfile();
  },

  async updateProfile(params: {
    name?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    username?: string;
  }): Promise<{ success: boolean; user: TelegramUser }> {
    if (isAndroidApp()) {
      return telegramDirectClient.updateProfile(params);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }, 6000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.updateProfile(params);
  },

  async uploadProfilePhoto(params: {
    file?: File;
    fileBase64?: string;
    filename?: string;
    url?: string;
  }): Promise<{ success: boolean; user: TelegramUser; avatarUrl: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.uploadProfilePhoto(params);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/profile/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }, 15000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.uploadProfilePhoto(params);
  },

  async deleteProfilePhoto(): Promise<{ success: boolean; user: TelegramUser }> {
    if (isAndroidApp()) {
      return telegramDirectClient.deleteProfilePhoto();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/profile/photo`, {
        method: 'DELETE',
      }, 10000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.deleteProfilePhoto();
  },

  async downloadMessageMedia(
    chatId: string,
    messageId: string | number,
    options?: { fullRes?: boolean; fullVideo?: boolean }
  ): Promise<{ dataUrl: string; mimeType: string } | null> {
    return telegramDirectClient.downloadMessageMedia(chatId, messageId, options);
  },

  async getPrivacy(keyType: 'lastSeen' | 'phoneNumber'): Promise<'everybody' | 'contacts' | 'nobody'> {
    return telegramDirectClient.getPrivacy(keyType);
  },

  async setPrivacy(keyType: 'lastSeen' | 'phoneNumber', rule: 'everybody' | 'contacts' | 'nobody'): Promise<{ success: boolean }> {
    return telegramDirectClient.setPrivacy(keyType, rule);
  },

  async getAuthorizations(): Promise<TelegramSessionInfo[]> {
    return telegramDirectClient.getAuthorizations();
  },

  async terminateSession(hash: string): Promise<{ success: boolean }> {
    return telegramDirectClient.terminateSession(hash);
  },

  async terminateAllOtherSessions(): Promise<{ success: boolean }> {
    return telegramDirectClient.terminateAllOtherSessions();
  },

  async getUserFull(userId: string): Promise<{ bio?: string; phone?: string; username?: string; name?: string }> {
    return telegramDirectClient.getUserFull(userId);
  },

  async checkUsername(username: string): Promise<{ available: boolean; error?: string }> {
    return telegramDirectClient.checkUsername(username);
  },

  async createChannelOrGroup(params: {
    type: 'channel' | 'group';
    title: string;
    about?: string;
    isPublic: boolean;
    username?: string;
  }): Promise<TelegramDialog> {
    return telegramDirectClient.createChannelOrGroup(params);
  },

  onNewMessage(listener: (event: { chatId: string; message: TelegramMessage }) => void): () => void {
    return telegramDirectClient.onNewMessage(listener);
  },

  async getChatSharedMedia(
    chatId: string,
    type: 'photos' | 'videos' | 'files' | 'audio',
    limit = 50
  ): Promise<TelegramMessage[]> {
    return telegramDirectClient.getChatSharedMedia(chatId, type, limit);
  },
};
