// Service for communicating with the real Telegram MTProto client backend
import { TeleForgeDialogFilter } from '../types';

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
  mediaType?: 'photo' | 'voice' | 'audio' | 'document' | null;
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

  if (isAndroidApp()) {
    return 'http://10.0.2.2:3000';
  }

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

export async function testBackendServer(host: string): Promise<{ ok: boolean; message: string }> {
  try {
    let clean = host.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    const res = await fetchWithTimeout(`${clean}/api/telegram/auth/status`, {}, 2500);
    if (res.ok) {
      return { ok: true, message: 'Connected to TeleForge MTProto server!' };
    }
    return { ok: false, message: `Server returned HTTP ${res.status}.` };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Connection failed' };
  }
}

export async function probeBackendServer(): Promise<string> {
  const current = getBackendServerHost();
  if (current) {
    try {
      const res = await fetchWithTimeout(`${current}/api/telegram/auth/status`, {}, 1500);
      if (res.ok) return current;
    } catch (e) {}
  }

  if (isAndroidApp()) {
    const candidates = [
      'http://10.0.2.2:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://172.31.5.192:3000',
    ];
    for (const candidate of candidates) {
      if (candidate === current) continue;
      try {
        const res = await fetchWithTimeout(`${candidate}/api/telegram/auth/status`, {}, 1500);
        if (res.ok) {
          setBackendServerHost(candidate);
          return candidate;
        }
      } catch (e) {}
    }
  }

  return current;
}

export const telegramApi = {
  async getConfig(): Promise<{ hasCredentials: boolean; apiId: number }> {
    const res = await fetch(`${getApiBase()}/config`);
    if (!res.ok) throw new Error('Failed to fetch Telegram configuration');
    return res.json();
  },

  async setConfig(apiId: number, apiHash: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId, apiHash }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update credentials');
    }
    return res.json();
  },

  async getAuthStatus(): Promise<AuthStatusResponse> {
    const res = await fetch(`${getApiBase()}/auth/status`);
    if (!res.ok) throw new Error('Failed to check Telegram auth status');
    return res.json();
  },

  async sendCode(phoneNumber: string): Promise<SendCodeResponse> {
    const res = await fetch(`${getApiBase()}/auth/sendCode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
    return data;
  },

  async signIn(phoneNumber: string, phoneCode: string, phoneCodeHash?: string): Promise<SignInResponse> {
    const res = await fetch(`${getApiBase()}/auth/signIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, phoneCode, phoneCodeHash }),
    });
    const data = await res.json();
    if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Failed to sign in');
    return data;
  },

  async submit2FA(password: string): Promise<{ success: boolean; user?: TelegramUser }> {
    const res = await fetch(`${getApiBase()}/auth/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Two-step verification password failed');
    return data;
  },

  async logout(): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/auth/logout`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Logout failed');
    return res.json();
  },

  async getDialogs(limit = 40): Promise<TelegramDialog[]> {
    const res = await fetch(`${getApiBase()}/dialogs?limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load Telegram chats');
    }
    const data = await res.json();
    return data.dialogs || [];
  },

  async getMessages(chatId: string, limit = 50, offsetId?: number): Promise<TelegramMessage[]> {
    let url = `${getApiBase()}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}`;
    if (offsetId && offsetId > 0) {
      url += `&offsetId=${offsetId}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load messages');
    }
    const data = await res.json();
    return data.messages || [];
  },

  async sendMessage(chatId: string, message: string, replyToMsgId?: number): Promise<TelegramMessage> {
    const res = await fetch(`${getApiBase()}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, replyToMsgId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.message;
  },

  async sendReaction(chatId: string, messageId: string, emoji?: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/messages/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, emoji }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send reaction');
    return data;
  },

  async editMessage(chatId: string, messageId: string, text: string): Promise<{ success: boolean; message: any }> {
    const res = await fetch(`${getApiBase()}/messages/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to edit message');
    return data;
  },

  async deleteMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/messages/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete message');
    return data;
  },

  async pinMessage(chatId: string, messageId: string, silent = false): Promise<{ success: boolean }> {
    const res = await fetch(`${getApiBase()}/messages/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, silent }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to pin message');
    return data;
  },

  async getContacts(): Promise<TelegramUser[]> {
    const res = await fetch(`${getApiBase()}/contacts`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load contacts');
    }
    const data = await res.json();
    return data.contacts || [];
  },

  getAvatarUrl(peerId: string): string {
    return `${getApiBase()}/avatar?id=${encodeURIComponent(peerId)}`;
  },

  getMediaUrl(chatId: string, messageId: number): string {
    return `${getApiBase()}/media?chatId=${encodeURIComponent(chatId)}&messageId=${messageId}`;
  },

  async getDialogFilters(): Promise<TeleForgeDialogFilter[]> {
    const res = await fetch(`${getApiBase()}/folders`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load Telegram folders');
    }
    const data = await res.json();
    return (data.folders || []).map((f: any) => ({
      ...f,
      title: typeof f.title === 'string' ? f.title : (f.title?.text ? String(f.title.text) : String(f.title || 'Folder')),
      emoticon: typeof f.emoticon === 'string' ? f.emoticon : (f.emoticon?.text ? String(f.emoticon.text) : ''),
    }));
  },

  async saveDialogFilter(filter: Partial<TeleForgeDialogFilter> & { title: string }): Promise<{ success: boolean; filter: TeleForgeDialogFilter }> {
    const res = await fetch(`${getApiBase()}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filter),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save folder to Telegram');
    }
    return data;
  },

  async deleteDialogFilter(id: string): Promise<{ success: boolean; id: string }> {
    const res = await fetch(`${getApiBase()}/folders/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete folder from Telegram');
    }
    return data;
  },

  async reorderDialogFilters(order: string[]): Promise<{ success: boolean; order: number[] }> {
    const res = await fetch(`${getApiBase()}/folders/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update folder order in Telegram');
    }
    return data;
  },

  async getChatFullInfo(id: string): Promise<{ id: string; memberCount?: number; about?: string }> {
    const res = await fetch(`${getApiBase()}/chat/info?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch chat info');
    }
    return data.info || { id };
  },

  async markAsRead(chatId: string): Promise<void> {
    try {
      await fetch(`${getApiBase()}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      });
    } catch (e) {
      // Non-critical — unread badge is already cleared client-side
    }
  },

  async searchGlobal(
    q: string,
    limit = 20
  ): Promise<{ myResults: TelegramDialog[]; globalResults: TelegramDialog[] }> {
    if (!q || q.trim().length < 2) {
      return { myResults: [], globalResults: [] };
    }
    const res = await fetch(`${getApiBase()}/search?q=${encodeURIComponent(q.trim())}&limit=${limit}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to search Telegram');
    }
    return data || { myResults: [], globalResults: [] };
  },

  async joinChat(chatId: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${getApiBase()}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to join chat');
    }
    return data;
  },

  async getProfile(): Promise<{ success: boolean; user: TelegramUser }> {
    const res = await fetch(`${getApiBase()}/profile`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch profile from Telegram');
    }
    return data;
  },

  async updateProfile(params: {
    name?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    username?: string;
  }): Promise<{ success: boolean; user: TelegramUser }> {
    const res = await fetch(`${getApiBase()}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile on Telegram');
    }
    return data;
  },

  async uploadProfilePhoto(params: {
    fileBase64?: string;
    filename?: string;
    url?: string;
  }): Promise<{ success: boolean; user: TelegramUser; avatarUrl: string }> {
    const res = await fetch(`${getApiBase()}/profile/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload profile photo to Telegram');
    }
    return data;
  },

  async deleteProfilePhoto(): Promise<{ success: boolean; user: TelegramUser }> {
    const res = await fetch(`${getApiBase()}/profile/photo`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove profile photo from Telegram');
    }
    return data;
  },
};
