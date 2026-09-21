// Service for communicating with Telegram MTProto client
// In Android APK and mobile environments, routes directly to telegramDirectClient (GramJS WSS).
// In web dev mode, routes to /api/telegram local backend with seamless telegramDirectClient fallback.

import {
  TeleForgeDialogFilter,
  TelegramReplyMarkup,
  TelegramKeyboardButton,
  TelegramButtonType,
  ForumTopicItem,
  TelegramAdminFullInfo,
  TelegramAdminParticipant,
  TelegramMemberParticipant,
  TelegramBannedParticipant,
  TelegramInviteLinkItem,
  TelegramAdminLogItem,
} from '../types';
import { telegramDirectClient } from './telegramDirectClient';

export type {
  TelegramReplyMarkup,
  TelegramKeyboardButton,
  TelegramButtonType,
  ForumTopicItem,
  TelegramAdminFullInfo,
  TelegramAdminParticipant,
  TelegramMemberParticipant,
  TelegramBannedParticipant,
  TelegramInviteLinkItem,
  TelegramAdminLogItem,
};

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
  isForum?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  isCreator?: boolean;
  topics?: ForumTopicItem[];
  isVerified: boolean;
  hasAvatar?: boolean;
  avatar?: string;
  thumbUrl?: string;
  unreadCount: number;
  unreadMentionsCount: number;
  pinned: boolean;
  isJoined?: boolean;
  isMuted?: boolean;
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
  mediaType?: 'photo' | 'video' | 'voice' | 'audio' | 'document' | 'sticker' | 'gif' | 'videoNote' | null;
  mediaThumb?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string;
  replyToMsgId?: number;
  replyToText?: string;
  replyToSenderName?: string;
  reactions?: { emoji: string; count: number; userReacted?: boolean }[];
  isRound?: boolean;
  isSticker?: boolean;
  isGif?: boolean;
  stickerEmoji?: string;
  stickerSet?: {
    id?: string;
    accessHash?: string;
    shortName?: string;
    title?: string;
  };
  documentId?: string;
  accessHash?: string;
  fileReference?: string;
  actionText?: string;
  editDate?: number;
  webPage?: { title?: string; description?: string; url?: string; siteName?: string };
  poll?: { question: string; totalVoters?: number; closed?: boolean };
  forwardFrom?: { id?: string; name: string; avatar?: string; thumbUrl?: string; isChannel?: boolean };
  replyMarkup?: TelegramReplyMarkup;
}

export interface OnlineGifItem {
  id: string;
  url: string;
  thumbUrl: string;
  title: string;
  width?: number;
  height?: number;
  queryId: string;
  rawItem?: any;
}

export interface TelegramStickerItem {
  id: string;
  documentId: string;
  accessHash: string;
  fileReference?: string;
  emoji?: string;
  thumbUrl?: string;
  url?: string;
  rawDoc?: any;
}

export interface TelegramStickerSet {
  id: string;
  accessHash: string;
  title: string;
  shortName: string;
  count: number;
  thumbUrl?: string;
  stickers?: TelegramStickerItem[];
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

type MessageListener = (event: { chatId: string; message: TelegramMessage }) => void;
const messageListeners = new Set<MessageListener>();
const reactionListeners = new Set<(event: { chatId: string; messageId: string; reactions: any[] }) => void>();
const seenMessageKeys = new Set<string>();

let sseEventSource: EventSource | null = null;
let sseReconnectTimer: any = null;
let directUnsubscribe: (() => void) | null = null;

function dispatchIncomingMessage(chatId: string, message: TelegramMessage) {
  if (!chatId || !message || message.id == null) return;
  const key = `${chatId}_${message.id}_${message.editDate || message.date}_${(message.text || '').slice(0, 32)}_${message.replyMarkup ? JSON.stringify(message.replyMarkup).length : 0}`;
  if (seenMessageKeys.has(key)) return;
  seenMessageKeys.add(key);
  if (seenMessageKeys.size > 2000) {
    const it = seenMessageKeys.values();
    for (let i = 0; i < 500; i++) {
      const next = it.next();
      if (!next.done) seenMessageKeys.delete(next.value);
    }
  }

  messageListeners.forEach((listener) => {
    try {
      listener({ chatId, message });
    } catch (e) {
      console.warn('[telegramApi] Message listener error:', e);
    }
  });
}

function dispatchReactionUpdate(chatId: string, messageId: string, reactions: any[]) {
  if (!chatId || !messageId) return;
  reactionListeners.forEach((listener) => {
    try {
      listener({ chatId, messageId, reactions });
    } catch (e) {
      console.warn('[telegramApi] Reaction listener error:', e);
    }
  });
}

function initRealtimeUpdates() {
  // 1. Direct MTProto client listener (for Android or Direct WSS mode)
  if (!directUnsubscribe) {
    try {
      directUnsubscribe = telegramDirectClient.onNewMessage((evt: any) => {
        if (evt.type === 'message_reactions' && evt.chatId && evt.messageId) {
          dispatchReactionUpdate(evt.chatId, evt.messageId, evt.reactions);
        } else if (evt.chatId && evt.message) {
          dispatchIncomingMessage(evt.chatId, evt.message);
        }
      });
    } catch (e) {}
  }

  // 2. Server-Sent Events (SSE) from backend (for Web browser mode)
  if (!isAndroidApp() && typeof window !== 'undefined' && 'EventSource' in window) {
    if (sseEventSource) return;

    const connectSse = () => {
      if (sseEventSource) {
        try {
          sseEventSource.close();
        } catch (e) {}
      }

      const sseUrl = resolveApiUrl(`${getApiBase()}/updates`);
      try {
        const es = new EventSource(sseUrl);
        sseEventSource = es;

        es.onmessage = (event) => {
          try {
            if (!event.data) return;
            const data = JSON.parse(event.data);
            if (data.type === 'new_message' && data.chatId && data.message) {
              dispatchIncomingMessage(data.chatId, data.message);
            } else if (data.type === 'message_reactions' && data.chatId && data.messageId) {
              dispatchReactionUpdate(data.chatId, data.messageId, data.reactions);
            }
          } catch (err) {}
        };

        es.onerror = () => {
          try {
            es.close();
          } catch (e) {}
          sseEventSource = null;
          clearTimeout(sseReconnectTimer);
          sseReconnectTimer = setTimeout(() => {
            connectSse();
          }, 4000);
        };
      } catch (err) {
        console.warn('[telegramApi] SSE connection error:', err);
      }
    };

    connectSse();
  }
}

function registerMessageListener(listener: MessageListener): () => void {
  messageListeners.add(listener);
  initRealtimeUpdates();
  return () => {
    messageListeners.delete(listener);
  };
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
      if (res.ok) {
        const data = await res.json();
        if (data?.session && typeof localStorage !== 'undefined') {
          localStorage.setItem('teleforge_session', data.session);
        }
        return data;
      }
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
      if (data?.session && typeof localStorage !== 'undefined') {
        localStorage.setItem('teleforge_session', data.session);
      }
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
      if (data?.session && typeof localStorage !== 'undefined') {
        localStorage.setItem('teleforge_session', data.session);
      }
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

  async getMessages(
    chatId: string,
    limit = 50,
    offsetId?: number,
    options?: { replyTo?: number | string; search?: string; addOffset?: number; ids?: number[] }
  ): Promise<TelegramMessage[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getMessages(chatId, limit, offsetId, options);
    }
    try {
      let url = `${getApiBase()}/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}`;
      if (offsetId && offsetId > 0) {
        url += `&offsetId=${offsetId}`;
      }
      if (options?.replyTo !== undefined && options?.replyTo !== null && parseInt(String(options.replyTo), 10) > 0) {
        url += `&replyTo=${encodeURIComponent(String(options.replyTo))}`;
      }
      const res = await fetchWithTimeout(url, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (e) {}
    return telegramDirectClient.getMessages(chatId, limit, offsetId, options);
  },

  async searchMessages(chatId: string, query: string, limit = 30): Promise<TelegramMessage[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.searchMessages(chatId, query, limit);
    }
    try {
      const url = `${getApiBase()}/messages/search?chatId=${encodeURIComponent(chatId)}&query=${encodeURIComponent(query)}&limit=${limit}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (e) {}
    return telegramDirectClient.searchMessages(chatId, query, limit);
  },

  async getMessagesAround(chatId: string, messageId: number | string, limit = 50): Promise<TelegramMessage[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getMessagesAround(chatId, messageId, limit);
    }
    try {
      const url = `${getApiBase()}/messages/around?chatId=${encodeURIComponent(chatId)}&messageId=${encodeURIComponent(String(messageId))}&limit=${limit}`;
      const res = await fetchWithTimeout(url, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        return data.messages || [];
      }
    } catch (e) {}
    return telegramDirectClient.getMessagesAround(chatId, messageId, limit);
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

  async getMessageReactionsList(chatId: string, messageId: string, limit = 50): Promise<{
    count: number;
    reactions: Array<{
      peerId: string | null;
      user: {
        id: string;
        name: string;
        username?: string;
        avatar?: string;
        isSelf?: boolean;
      };
      emoji: string;
      date: number;
      isSelf: boolean;
    }>;
    nextOffset: string | null;
  }> {
    if (isAndroidApp()) {
      return telegramDirectClient.getMessageReactionsList(chatId, messageId, limit);
    }
    try {
      const res = await fetchWithTimeout(
        `${getApiBase()}/messages/reactions-list?chatId=${encodeURIComponent(chatId)}&messageId=${encodeURIComponent(messageId)}&limit=${limit}`,
        {},
        5000
      );
      const data = await res.json();
      if (res.ok && data) return data;
    } catch (e) {}
    return telegramDirectClient.getMessageReactionsList(chatId, messageId, limit);
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

  async forwardMessages(
    fromChatId: string,
    toChatId: string,
    messageIds: string[] | number[],
    options: { silent?: boolean; dropAuthor?: boolean } = {}
  ): Promise<{ success: boolean; count?: number }> {
    if (isAndroidApp()) {
      return telegramDirectClient.forwardMessages(fromChatId, toChatId, messageIds, options);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChatId,
          toChatId,
          messageIds,
          silent: options.silent,
          dropAuthor: options.dropAuthor,
        }),
      }, 8000);
      const data = await res.json();
      if (res.ok) return data;
    } catch (e) {}
    return telegramDirectClient.forwardMessages(fromChatId, toChatId, messageIds, options);
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

  async checkInvite(hashOrUsername: string): Promise<{
    success: boolean;
    title?: string;
    about?: string;
    participantsCount?: number;
    photo?: string;
    isChannel?: boolean;
    isGroup?: boolean;
    alreadyJoined?: boolean;
    chatId?: string;
    error?: string;
  }> {
    if (isAndroidApp()) {
      return telegramDirectClient.checkInvite(hashOrUsername);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/check-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashOrUsername }),
      }, 12000);
      const data = await res.json();
      return data;
    } catch (e: any) {
      try {
        return await telegramDirectClient.checkInvite(hashOrUsername);
      } catch (err: any) {
        return { success: false, error: e?.message || 'Failed to check invite' };
      }
    }
  },

  async joinChat(chatId: string): Promise<{ success: boolean; chat?: any; alreadyJoined?: boolean; requestSent?: boolean; message?: string; error?: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.joinChat(chatId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId }),
      }, 12000);
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to join chat' };
    }
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
  }): Promise<{ success: boolean; user: TelegramUser; avatarUrl: string; dataUrl?: string; photoId?: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.uploadProfilePhoto(params);
    }
    const res = await fetchWithTimeout(`${getApiBase()}/profile/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: params.fileBase64,
        filename: params.filename,
        url: params.url,
      }),
    }, 60000);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `Failed to upload photo (HTTP ${res.status})`);
    }
    return data;
  },

  async deleteProfilePhoto(): Promise<{ success: boolean; user: TelegramUser }> {
    if (isAndroidApp()) {
      return telegramDirectClient.deleteProfilePhoto();
    }
    const res = await fetchWithTimeout(`${getApiBase()}/profile/photo`, {
      method: 'DELETE',
    }, 20000);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `Failed to delete photo (HTTP ${res.status})`);
    }
    return data;
  },

  async downloadMessageMedia(
    chatId: string,
    messageId: string | number,
    options?: { fullRes?: boolean; fullVideo?: boolean; onProgress?: (progress: number, downloaded: number, total: number) => void; onStreamReady?: (streamUrl: string) => void }
  ): Promise<{ dataUrl: string; mimeType: string } | null> {
    return telegramDirectClient.downloadMessageMedia(chatId, messageId, options);
  },

  async getPrivacy(keyType: 'lastSeen' | 'phoneNumber'): Promise<'everybody' | 'contacts' | 'nobody'> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/privacy?type=${encodeURIComponent(keyType)}`, {}, 6000);
        if (res.ok) {
          const data = await res.json();
          if (data.rule) return data.rule;
        }
      } catch (e) {}
    }
    return telegramDirectClient.getPrivacy(keyType);
  },

  async setPrivacy(keyType: 'lastSeen' | 'phoneNumber', rule: 'everybody' | 'contacts' | 'nobody'): Promise<{ success: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/privacy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyType, rule }),
        }, 6000);
        if (res.ok) {
          const data = await res.json();
          return { success: Boolean(data.success) };
        }
      } catch (e) {}
    }
    return telegramDirectClient.setPrivacy(keyType, rule);
  },

  async getAuthorizations(): Promise<TelegramSessionInfo[]> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/sessions`, {}, 6000);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.sessions)) return data.sessions;
        }
      } catch (e) {}
    }
    return telegramDirectClient.getAuthorizations();
  },

  async getOnlineGifs(query = '', offset = ''): Promise<{ results: OnlineGifItem[]; nextOffset: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.getOnlineGifs(query, offset);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/gifs?q=${encodeURIComponent(query)}&offset=${encodeURIComponent(offset)}`, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {}
    return telegramDirectClient.getOnlineGifs(query, offset);
  },

  async downloadDocumentThumb(doc: any): Promise<string | null> {
    if (!doc) return null;
    if (!isAndroidApp()) {
      const docId = doc.id?.toString() || doc.documentId;
      if (docId) return resolveApiUrl(`/api/telegram/document?id=${docId}&thumb=m`);
    }
    return telegramDirectClient.downloadDocumentThumb(doc);
  },

  async downloadStickerThumb(docOrSticker: any): Promise<string | null> {
    if (!docOrSticker) return null;
    if (docOrSticker.thumbUrl && (docOrSticker.thumbUrl.startsWith('data:') || docOrSticker.thumbUrl.startsWith('blob:') || docOrSticker.thumbUrl.startsWith('http'))) {
      return docOrSticker.thumbUrl;
    }
    if (!isAndroidApp()) {
      if (docOrSticker.thumbUrl) {
        return resolveApiUrl(docOrSticker.thumbUrl);
      }
      if (docOrSticker.url) {
        return resolveApiUrl(docOrSticker.url);
      }
      const docId = docOrSticker.documentId || docOrSticker.id;
      if (docId) {
        return resolveApiUrl(`/api/telegram/document?id=${docId}&thumb=m`);
      }
    }
    return telegramDirectClient.downloadStickerThumb(docOrSticker);
  },

  async downloadDocumentBlob(doc: any): Promise<string | null> {
    return telegramDirectClient.downloadDocumentBlob(doc);
  },

  async sendInlineBotResult(
    chatId: string,
    queryId: string,
    resultId: string,
    replyToMsgId?: number
  ): Promise<{ success: boolean; messageId?: number }> {
    return telegramDirectClient.sendInlineBotResult(chatId, queryId, resultId, replyToMsgId);
  },

  async getInstalledStickerSets(): Promise<TelegramStickerSet[]> {
    if (isAndroidApp()) {
      return telegramDirectClient.getInstalledStickerSets();
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/stickers/installed`, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        return data.sets || [];
      }
    } catch (e) {}
    return telegramDirectClient.getInstalledStickerSets();
  },

  async getStickerSet(stickerset: { id?: string; accessHash?: string; shortName?: string }): Promise<TelegramStickerSet | null> {
    if (isAndroidApp()) {
      return telegramDirectClient.getStickerSet(stickerset);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/stickers/set?id=${encodeURIComponent(stickerset.id || '')}&accessHash=${encodeURIComponent(stickerset.accessHash || '')}&shortName=${encodeURIComponent(stickerset.shortName || '')}`, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        return data.set || null;
      }
    } catch (e) {}
    return telegramDirectClient.getStickerSet(stickerset);
  },

  async installStickerSet(stickerset: { id?: string; accessHash?: string; shortName?: string }): Promise<boolean> {
    if (isAndroidApp()) {
      return telegramDirectClient.installStickerSet(stickerset);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/stickers/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stickerset }),
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        return Boolean(data.success);
      }
    } catch (e) {}
    return telegramDirectClient.installStickerSet(stickerset);
  },

  async faveSticker(documentId: string, accessHash: string, fileReference?: string): Promise<boolean> {
    if (isAndroidApp()) {
      return telegramDirectClient.faveSticker(documentId, accessHash, fileReference);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/stickers/fave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, accessHash, fileReference }),
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        return Boolean(data.success);
      }
    } catch (e) {}
    return telegramDirectClient.faveSticker(documentId, accessHash, fileReference);
  },

  async sendStickerDocument(chatId: string, docOrInput: any, replyToMsgId?: number): Promise<TelegramMessage> {
    if (isAndroidApp()) {
      return telegramDirectClient.sendStickerDocument(chatId, docOrInput, replyToMsgId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/stickers/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, docOrInput, replyToMsgId }),
      }, 8000);
      if (res.ok) {
        const data = await res.json();
        return data.message;
      }
    } catch (e) {}
    return telegramDirectClient.sendStickerDocument(chatId, docOrInput, replyToMsgId);
  },

  async terminateSession(hash: string): Promise<{ success: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/sessions/terminate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hash }),
        }, 6000);
        if (res.ok) {
          const data = await res.json();
          return { success: Boolean(data.success) };
        }
      } catch (e) {}
    }
    return telegramDirectClient.terminateSession(hash);
  },

  async terminateAllOtherSessions(): Promise<{ success: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(`${getApiBase()}/sessions/terminate-all`, {
          method: 'POST',
        }, 6000);
        if (res.ok) {
          const data = await res.json();
          return { success: Boolean(data.success) };
        }
      } catch (e) {}
    }
    return telegramDirectClient.terminateAllOtherSessions();
  },

  async getUserFull(userId: string): Promise<{ bio?: string; phone?: string; username?: string; name?: string }> {
    if (isAndroidApp()) {
      return telegramDirectClient.getUserFull(userId);
    }
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/user/full?id=${encodeURIComponent(userId)}`, {}, 4000);
      if (res.ok) {
        const data = await res.json();
        return data.user || {};
      }
    } catch (e) {}
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
    return registerMessageListener(listener);
  },

  onReactionUpdate(listener: (event: { chatId: string; messageId: string; reactions: any[] }) => void): () => void {
    reactionListeners.add(listener);
    initRealtimeUpdates();
    return () => {
      reactionListeners.delete(listener);
    };
  },

  async getChatSharedMedia(
    chatId: string,
    type: 'photos' | 'videos' | 'files' | 'audio',
    limit = 50
  ): Promise<TelegramMessage[]> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/shared-media?chatId=${encodeURIComponent(chatId)}&type=${encodeURIComponent(type)}&limit=${limit}`,
          {},
          8000
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages)) {
            return data.messages;
          }
        }
      } catch (e) {}
    }
    return telegramDirectClient.getChatSharedMedia(chatId, type, limit);
  },

  async sendBotCallbackAnswer(
    chatId: string,
    messageId: number,
    data?: string,
    game = false
  ): Promise<{ message?: string; alert?: boolean; url?: string }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/bot/callback`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, messageId, data, game }),
          },
          12000
        );
        if (res.ok) {
          return await res.json();
        }
        const errJson = await res.json().catch(() => ({}));
        return { message: errJson.error || 'Action failed' };
      } catch (e: any) {
        return { message: e?.message || 'Callback timed out' };
      }
    }
    return telegramDirectClient.sendBotCallbackAnswer(chatId, messageId, data, game);
  },

  async addBotToChat(
    chatId: string,
    botUsername: string,
    startParam?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/bot/add-to-chat`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, botUsername, startParam }),
          },
          15000
        );
        if (res.ok) {
          return await res.json();
        }
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || `HTTP ${res.status}` };
      } catch (e: any) {}
    }
    return telegramDirectClient.addBotToChat(chatId, botUsername, startParam);
  },

  async toggleChatMute(
    chatId: string,
    mute = true
  ): Promise<{ success: boolean; isMuted: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/chat/mute`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, mute }),
          },
          10000
        );
        if (res.ok) {
          return await res.json();
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.toggleChatMute(chatId, mute);
  },

  async leaveChat(chatId: string): Promise<{ success: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/chats/leave`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId }),
          },
          8000
        );
        if (res.ok) {
          return await res.json();
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.leaveChat(chatId);
  },

  async clearChatHistory(chatId: string, revoke = false): Promise<{ success: boolean }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/chats/clear-history`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, revoke }),
          },
          10000
        );
        if (res.ok) {
          return await res.json();
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.clearChatHistory(chatId, revoke);
  },

  async getForumTopics(chatId: string, limit = 50): Promise<{ count: number; topics: ForumTopicItem[] }> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/forum/topics?chatId=${encodeURIComponent(chatId)}&limit=${limit}`,
          {},
          8000
        );
        if (res.ok) {
          return await res.json();
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.getForumTopics(chatId, limit);
  },

  async deleteChannelOrGroup(chatId: string): Promise<boolean> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/chats/delete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId }),
          },
          10000
        );
        if (res.ok) {
          const data = await res.json();
          return Boolean(data.success);
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.deleteChannelOrGroup(chatId);
  },

  async editChatDetails(chatId: string, details: { title?: string; about?: string }): Promise<boolean> {
    if (!isAndroidApp()) {
      try {
        const res = await fetchWithTimeout(
          `${getApiBase()}/chats/edit-info`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, title: details.title, about: details.about }),
          },
          10000
        );
        if (res.ok) {
          const data = await res.json();
          return Boolean(data.success);
        }
      } catch (e: any) {}
    }
    return telegramDirectClient.editChatDetails(chatId, details);
  },

  async getChatAdminFull(chatId: string): Promise<TelegramAdminFullInfo> {
    const res = await fetchWithTimeout(`${getApiBase()}/chat/admin-full?chatId=${encodeURIComponent(chatId)}`, {}, 10000);
    if (!res.ok) {
      throw new Error(`Failed to load admin chat details: ${res.statusText}`);
    }
    return await res.json();
  },

  async updateChatGeneralSettings(chatId: string, settings: { title?: string; about?: string; username?: string; hiddenPrehistory?: boolean }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/update-settings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...settings }),
      },
      12000
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update chat settings');
    }
    return true;
  },

  async updateChatPermissions(chatId: string, payload: { permissions?: any; slowmodeSeconds?: number }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/update-permissions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...payload }),
      },
      12000
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update chat permissions');
    }
    return true;
  },

  async getChatAdministrators(chatId: string): Promise<TelegramAdminParticipant[]> {
    const res = await fetchWithTimeout(`${getApiBase()}/chat/administrators?chatId=${encodeURIComponent(chatId)}`, {}, 10000);
    if (!res.ok) throw new Error('Failed to load administrators');
    const data = await res.json();
    return data.admins || [];
  },

  async editChatAdministrator(chatId: string, payload: { userId: string; adminRights?: any; rank?: string }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/edit-admin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...payload }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to edit administrator');
    return true;
  },

  async transferChatOwnership(chatId: string, payload: { userId: string; password?: string }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/transfer-ownership`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...payload }),
      },
      15000
    );
    if (!res.ok) throw new Error('Failed to transfer chat ownership');
    return true;
  },

  async getChatMembers(chatId: string, query = '', offset = 0, limit = 50): Promise<{ members: TelegramMemberParticipant[]; count: number }> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/members?chatId=${encodeURIComponent(chatId)}&query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}`,
      {},
      10000
    );
    if (!res.ok) throw new Error('Failed to load members');
    return await res.json();
  },

  async inviteMemberToChat(chatId: string, user: string): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/invite-member`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, user }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to invite member');
    return true;
  },

  async restrictChatMember(chatId: string, payload: { userId: string; bannedRights?: any; untilDate?: number }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/restrict-member`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...payload }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to restrict member');
    return true;
  },

  async kickChatMember(chatId: string, userId: string): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/kick-member`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to kick member');
    return true;
  },

  async getBannedMembers(chatId: string): Promise<TelegramBannedParticipant[]> {
    const res = await fetchWithTimeout(`${getApiBase()}/chat/banned-members?chatId=${encodeURIComponent(chatId)}`, {}, 10000);
    if (!res.ok) throw new Error('Failed to load banned members');
    const data = await res.json();
    return data.banned || [];
  },

  async unbanChatMember(chatId: string, userId: string): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/unban-member`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, userId }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to unban member');
    return true;
  },

  async getChatInviteLinks(chatId: string): Promise<TelegramInviteLinkItem[]> {
    const res = await fetchWithTimeout(`${getApiBase()}/chat/invite-links?chatId=${encodeURIComponent(chatId)}`, {}, 10000);
    if (!res.ok) throw new Error('Failed to load invite links');
    const data = await res.json();
    return data.invites || [];
  },

  async createChatInviteLink(chatId: string, payload: { title?: string; expireDate?: string; usageLimit?: number; requestNeeded?: boolean }): Promise<TelegramInviteLinkItem> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/create-invite-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...payload }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to create invite link');
    return await res.json();
  },

  async revokeChatInviteLink(chatId: string, link: string): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/revoke-invite-link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, link }),
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to revoke invite link');
    return true;
  },

  async getChatAdminLog(chatId: string, query = '', limit = 50): Promise<TelegramAdminLogItem[]> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/admin-log?chatId=${encodeURIComponent(chatId)}&query=${encodeURIComponent(query)}&limit=${limit}`,
      {},
      10000
    );
    if (!res.ok) throw new Error('Failed to load admin log');
    const data = await res.json();
    return data.events || [];
  },

  async checkChatUsernameAvailability(chatId: string, username: string): Promise<{ available: boolean; username: string; error?: string }> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/check-username?chatId=${encodeURIComponent(chatId)}&username=${encodeURIComponent(username)}`,
      {},
      8000
    );
    if (!res.ok) throw new Error('Failed to check username availability');
    return await res.json();
  },

  async uploadChatPhoto(chatId: string, data: { fileBase64?: string; filename?: string; url?: string }): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/photo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, ...data }),
      },
      25000
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload chat photo');
    }
    return true;
  },

  async removeChatPhoto(chatId: string): Promise<boolean> {
    const res = await fetchWithTimeout(
      `${getApiBase()}/chat/photo?chatId=${encodeURIComponent(chatId)}`,
      {
        method: 'DELETE',
      },
      12000
    );
    if (!res.ok) throw new Error('Failed to remove chat photo');
    return true;
  },
};

