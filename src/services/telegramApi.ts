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

const API_BASE = '/api/telegram';

export const telegramApi = {
  async getConfig(): Promise<{ hasCredentials: boolean; apiId: number }> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('Failed to fetch Telegram configuration');
    return res.json();
  },

  async setConfig(apiId: number, apiHash: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/config`, {
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
    const res = await fetch(`${API_BASE}/auth/status`);
    if (!res.ok) throw new Error('Failed to check Telegram auth status');
    return res.json();
  },

  async sendCode(phoneNumber: string): Promise<SendCodeResponse> {
    const res = await fetch(`${API_BASE}/auth/sendCode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
    return data;
  },

  async signIn(phoneNumber: string, phoneCode: string, phoneCodeHash?: string): Promise<SignInResponse> {
    const res = await fetch(`${API_BASE}/auth/signIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, phoneCode, phoneCodeHash }),
    });
    const data = await res.json();
    if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Failed to sign in');
    return data;
  },

  async submit2FA(password: string): Promise<{ success: boolean; user?: TelegramUser }> {
    const res = await fetch(`${API_BASE}/auth/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Two-step verification password failed');
    return data;
  },

  async logout(): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Logout failed');
    return res.json();
  },

  async getDialogs(limit = 40): Promise<TelegramDialog[]> {
    const res = await fetch(`${API_BASE}/dialogs?limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load Telegram chats');
    }
    const data = await res.json();
    return data.dialogs || [];
  },

  async getMessages(chatId: string, limit = 50, offsetId?: number): Promise<TelegramMessage[]> {
    let url = `${API_BASE}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}`;
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
    const res = await fetch(`${API_BASE}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, replyToMsgId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send message');
    return data.message;
  },

  async sendReaction(chatId: string, messageId: string, emoji?: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, emoji }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send reaction');
    return data;
  },

  async editMessage(chatId: string, messageId: string, text: string): Promise<{ success: boolean; message: any }> {
    const res = await fetch(`${API_BASE}/messages/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, text }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to edit message');
    return data;
  },

  async deleteMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete message');
    return data;
  },

  async pinMessage(chatId: string, messageId: string, silent = false): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/messages/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, messageId, silent }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to pin message');
    return data;
  },

  async getContacts(): Promise<TelegramUser[]> {
    const res = await fetch(`${API_BASE}/contacts`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load contacts');
    }
    const data = await res.json();
    return data.contacts || [];
  },

  getAvatarUrl(peerId: string): string {
    return `${API_BASE}/avatar?id=${encodeURIComponent(peerId)}`;
  },

  getMediaUrl(chatId: string, messageId: number): string {
    return `${API_BASE}/media?chatId=${encodeURIComponent(chatId)}&messageId=${messageId}`;
  },

  async getDialogFilters(): Promise<TeleForgeDialogFilter[]> {
    const res = await fetch(`${API_BASE}/folders`);
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
    const res = await fetch(`${API_BASE}/folders`, {
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
    const res = await fetch(`${API_BASE}/folders/delete`, {
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
    const res = await fetch(`${API_BASE}/folders/order`, {
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
    const res = await fetch(`${API_BASE}/chat/info?id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch chat info');
    }
    return data.info || { id };
  },

  async markAsRead(chatId: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/read`, {
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
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q.trim())}&limit=${limit}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to search Telegram');
    }
    return data || { myResults: [], globalResults: [] };
  },

  async joinChat(chatId: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/join`, {
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
    const res = await fetch(`${API_BASE}/profile`);
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
    const res = await fetch(`${API_BASE}/profile`, {
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
    const res = await fetch(`${API_BASE}/profile/photo`, {
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
    const res = await fetch(`${API_BASE}/profile/photo`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove profile photo from Telegram');
    }
    return data;
  },
};
