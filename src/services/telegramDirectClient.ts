// Direct MTProto Telegram Client for TeleForge
// Connects directly to Telegram production servers over secure WebSocket (WSS)
// Runs entirely client-side inside the Android WebView and browser without requiring an external backend server.

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { strippedPhotoToJpg } from 'telegram/Utils.js';
import { CustomFile } from 'telegram/client/uploads.js';
import bigInt from 'big-integer';
import { TeleForgeDialogFilter } from '../types';
import {
  TelegramUser,
  TelegramDialog,
  TelegramMessage,
  AuthStatusResponse,
  SendCodeResponse,
  SignInResponse,
} from './telegramApi';

// Production Telegram API Credentials
const TELEGRAM_API_ID = 30519813;
const TELEGRAM_API_HASH = 'f7aff79dc2063c06ebc30a5ffbebcc66';

const SESSION_STORAGE_KEY = 'teleforge_session';
const USER_CACHE_KEY = 'teleforge_cached_user';

let clientInstance: TelegramClient | null = null;
let clientInitPromise: Promise<TelegramClient> | null = null;

// Entity and media caches
const peerEntityCache = new Map<string, any>();
const thumbCache = new Map<string, string>(); // peerId -> base64 data URL
const avatarBlobUrlCache = new Map<string, string>(); // peerId -> object URL
const messageMediaMap = new Map<string, any>(); // `${chatId}_${messageId}` -> media object
const pendingLogins = new Map<string, { phoneCodeHash: string; isCodeViaApp: boolean; type?: string }>();

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg = 'Operation timed out'): Promise<T> {
  let timer: any;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function getStoredSessionString(): string {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveSessionString(sessionStr: string): void {
  try {
    if (sessionStr) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionStr);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {}
}

export function hasSavedSession(): boolean {
  return Boolean(getStoredSessionString().trim());
}

/**
 * Get or create the singleton GramJS TelegramClient instance
 */
export async function getDirectClient(): Promise<TelegramClient> {
  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  if (clientInitPromise) {
    return clientInitPromise;
  }

  clientInitPromise = (async () => {
    try {
      const sessionStr = getStoredSessionString();
      const session = new StringSession(sessionStr);

      const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
        useWSS: true,
        timeout: 15,
        deviceModel: 'TeleForge Mobile',
        systemVersion: 'Android 14',
        appVersion: '1.0.0',
        langCode: 'en',
        systemLangCode: 'en',
      });

      console.log('[MTProto-Direct] Connecting to Telegram production servers over WSS...');
      await withTimeout(client.connect(), 12000, 'Could not connect to Telegram servers (timeout).');
      console.log('[MTProto-Direct] Connected to Telegram production servers.');

      clientInstance = client;
      return client;
    } catch (err: any) {
      console.error('[MTProto-Direct] Connection error:', err.message);
      clientInstance = null;
      throw err;
    } finally {
      clientInitPromise = null;
    }
  })();

  return clientInitPromise;
}

function hasEntityPhoto(entity: any): boolean {
  if (!entity || !entity.photo) return false;
  const p = entity.photo;
  const cls = p.className || p._ || '';
  if (cls.includes('Empty') || cls.includes('empty')) return false;
  return true;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractPeerId(peer: any): string | null {
  if (!peer) return null;
  if (typeof peer === 'string' || typeof peer === 'number') return peer.toString();
  if (peer.userId != null) return peer.userId.toString();
  if (peer.chatId != null) return `-${peer.chatId.toString()}`;
  if (peer.channelId != null) return `-100${peer.channelId.toString()}`;
  if (peer.id != null) return peer.id.toString();
  return null;
}

function serializeUser(u: any): TelegramUser | null {
  if (!u) return null;
  const firstName = u.firstName || '';
  const lastName = u.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Telegram User';
  const idStr = u.id ? u.id.toString() : '';

  if (idStr) {
    peerEntityCache.set(idStr, u);
  }

  const hasPhoto = hasEntityPhoto(u);
  const photoId = u.photo?.photoId ? u.photo.photoId.toString() : (u.photo?.id ? u.photo.id.toString() : '');

  // Extract stripped thumb if present
  if (u.photo?.strippedThumb && idStr) {
    try {
      const thumbBuf = strippedPhotoToJpg(u.photo.strippedThumb);
      if (thumbBuf && thumbBuf.length > 0) {
        const thumbUrl = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
        thumbCache.set(idStr, thumbUrl);
      }
    } catch (e) {}
  }

  return {
    id: idStr,
    firstName,
    lastName,
    name: fullName,
    username: u.username || '',
    phone: u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : '',
    isBot: Boolean(u.bot),
    isSelf: Boolean(u.self),
    isVerified: Boolean(u.verified),
    hasAvatar: hasPhoto,
    photoId: photoId || undefined,
    avatar: hasPhoto ? (thumbCache.get(idStr) || '') : undefined,
  };
}

async function resolveInputPeer(client: TelegramClient, id: string): Promise<any> {
  if (!id) return null;
  const str = id.toString();
  try {
    const entity = await client.getInputEntity(str);
    if (entity) return entity;
  } catch (e) {}

  try {
    if (str.startsWith('-100')) {
      const channelId = BigInt(str.slice(4)) as any;
      return new Api.InputPeerChannel({ channelId, accessHash: BigInt(0) as any });
    } else if (str.startsWith('-')) {
      const chatId = BigInt(str.slice(1)) as any;
      return new Api.InputPeerChat({ chatId });
    } else {
      const userId = BigInt(str) as any;
      return new Api.InputPeerUser({ userId, accessHash: BigInt(0) as any });
    }
  } catch (e) {
    return null;
  }
}

export const telegramDirectClient = {
  /**
   * Check whether user is already logged in via MTProto session.
   * If no session string is saved in localStorage, completes INSTANTLY without network.
   */
  async checkAuthStatus(): Promise<AuthStatusResponse> {
    const sessionStr = getStoredSessionString();
    if (!sessionStr.trim()) {
      return { authorized: false, configured: true };
    }

    try {
      const client = await getDirectClient();
      const isAuth = await withTimeout(client.isUserAuthorized(), 5000, 'Auth check timed out');
      if (!isAuth) {
        return { authorized: false, configured: true };
      }

      const me = await withTimeout(client.getMe(), 5000, 'User profile fetch timed out');
      let bio = '';
      try {
        const full = await withTimeout(client.invoke(new Api.users.GetFullUser({ id: 'me' })), 3000);
        bio = (full as any)?.fullUser?.about || (full as any)?.about || '';
      } catch (e) {}

      const sUser = serializeUser(me);
      if (sUser) {
        sUser.bio = bio;
        if (hasEntityPhoto(me)) {
          try {
            const highResBuf = await withTimeout(client.downloadProfilePhoto('me', { isBig: true }), 4000);
            if (highResBuf && highResBuf.length > 0) {
              const b64 = `data:image/jpeg;base64,${Buffer.from(highResBuf).toString('base64')}`;
              avatarBlobUrlCache.set('me', b64);
              if (sUser.id) avatarBlobUrlCache.set(sUser.id, b64);
              sUser.avatar = b64;
            }
          } catch (e) {}
        }
        try {
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(sUser));
        } catch (e) {}
      }

      return {
        authorized: true,
        configured: true,
        user: sUser || undefined,
      };
    } catch (e: any) {
      console.warn('[MTProto-Direct] Auth check network error:', e.message);
      const isExplicitRevocation = e?.message && (
        e.message.includes('AUTH_KEY_UNREGISTERED') ||
        e.message.includes('SESSION_REVOKED') ||
        e.message.includes('USER_DEACTIVATED') ||
        e.message.includes('SESSION_EXPIRED')
      );

      if (isExplicitRevocation) {
        saveSessionString('');
        try {
          localStorage.removeItem(USER_CACHE_KEY);
        } catch (err) {}
        return {
          authorized: false,
          configured: true,
          error: e.message,
        };
      }

      // If we have a saved session string, do NOT kick user out on temporary handshake/network delays
      if (hasSavedSession()) {
        try {
          const cached = localStorage.getItem(USER_CACHE_KEY);
          if (cached) {
            const u = JSON.parse(cached);
            return { authorized: true, configured: true, user: u };
          }
        } catch (err) {}

        return {
          authorized: true,
          configured: true,
          user: {
            id: 'me',
            firstName: 'Telegram',
            lastName: 'User',
            name: 'Telegram User',
            username: '',
            phone: '',
            isBot: false,
            isSelf: true,
            isVerified: false,
          },
        };
      }

      return {
        authorized: false,
        configured: true,
        error: e.message,
      };
    }
  },

  /**
   * Send phone verification code via Telegram MTProto
   */
  async sendCode(phoneNumber: string): Promise<SendCodeResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const client = await getDirectClient();

    try {
      const result = await client.sendCode(
        {
          apiId: TELEGRAM_API_ID,
          apiHash: TELEGRAM_API_HASH,
        },
        cleanPhone
      );

      pendingLogins.set(cleanPhone, {
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp,
      });

      return {
        success: true,
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp,
      };
    } catch (err: any) {
      console.error('[MTProto-Direct] sendCode error:', err);
      throw err;
    }
  },

  /**
   * Sign in with received verification code
   */
  async signIn(phoneNumber: string, phoneCode: string, phoneCodeHash?: string): Promise<SignInResponse> {
    const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const client = await getDirectClient();

    let codeHash = phoneCodeHash;
    if (!codeHash) {
      codeHash = pendingLogins.get(cleanPhone)?.phoneCodeHash;
    }

    if (!codeHash) {
      throw new Error('Verification session expired or missing code hash. Please request a new code.');
    }

    try {
      const user = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: cleanPhone,
          phoneCodeHash: codeHash,
          phoneCode: phoneCode.trim(),
        })
      );

      pendingLogins.delete(cleanPhone);
      const sessionStr = client.session.save() as unknown as string;
      saveSessionString(sessionStr);

      const me = await client.getMe();
      let bio = '';
      try {
        const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
        bio = (full as any)?.fullUser?.about || (full as any)?.about || '';
      } catch (e) {}

      const sUser = serializeUser(me || user);
      if (sUser) {
        sUser.bio = bio;
        try {
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(sUser));
        } catch (e) {}
      }

      return {
        success: true,
        user: sUser || undefined,
      };
    } catch (err: any) {
      if (err?.message && err.message.includes('SESSION_PASSWORD_NEEDED')) {
        return {
          success: false,
          requires2FA: true,
          message: 'Two-Step Verification (2FA) password required.',
        };
      }
      throw err;
    }
  },

  /**
   * Submit 2FA Cloud Password (SRP)
   */
  async submit2FA(password: string): Promise<{ success: boolean; user?: TelegramUser }> {
    const client = await getDirectClient();

    await client.signInWithPassword(
      {
        apiId: TELEGRAM_API_ID,
        apiHash: TELEGRAM_API_HASH,
      },
      {
        password: async () => password,
        onError: (err: any) => {
          throw err;
        },
      }
    );

    const sessionStr = client.session.save() as unknown as string;
    saveSessionString(sessionStr);

    const me = await client.getMe();
    let bio = '';
    try {
      const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      bio = (full as any)?.fullUser?.about || (full as any)?.about || '';
    } catch (e) {}

    const sUser = serializeUser(me);
    if (sUser) {
      sUser.bio = bio;
      try {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(sUser));
      } catch (e) {}
    }

    return {
      success: true,
      user: sUser || undefined,
    };
  },

  /**
   * Log out and clear session
   */
  async logout(): Promise<{ success: boolean }> {
    try {
      if (clientInstance) {
        await clientInstance.invoke(new Api.auth.LogOut());
        await clientInstance.disconnect();
      }
    } catch (e) {}

    clientInstance = null;
    saveSessionString('');
    try {
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem('teleforge_cached_chats');
    } catch (e) {}

    return { success: true };
  },

  /**
   * Get user's Telegram dialogs (chats, channels, groups)
   */
  async getDialogs(limit = 50): Promise<TelegramDialog[]> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      throw new Error('Not authorized with Telegram MTProto');
    }

    const dialogs = await client.getDialogs({ limit: Math.min(limit, 100) });

    return dialogs.map((d: any) => {
      const entity = d.entity;
      const peerIdStr = d.id?.toString() || '';

      if (entity && peerIdStr) {
        peerEntityCache.set(peerIdStr, entity);
        if (entity.id) {
          peerEntityCache.set(entity.id.toString(), entity);
          if (entity.className === 'Channel') {
            peerEntityCache.set(`-100${entity.id.toString()}`, entity);
          } else if (entity.className === 'Chat') {
            peerEntityCache.set(`-${entity.id.toString()}`, entity);
          }
        }

        if (entity.photo?.strippedThumb) {
          try {
            const thumbBuf = strippedPhotoToJpg(entity.photo.strippedThumb);
            if (thumbBuf && thumbBuf.length > 0) {
              const b64 = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
              thumbCache.set(peerIdStr, b64);
              if (entity.id) thumbCache.set(entity.id.toString(), b64);
            }
          } catch (e) {}
        }
      }

      const hasPhoto = hasEntityPhoto(entity);
      const isUser = Boolean(d.isUser);
      const isGroup = Boolean(d.isGroup || (entity && (entity.megagroup || entity.gigagroup || entity.className === 'Chat')));
      const isChannel = Boolean(d.isChannel && !isGroup);

      let title = d.title || d.name || 'Telegram User';
      let username = entity?.username || '';
      let phone = entity?.phone || '';
      let isVerified = Boolean(entity?.verified);

      let messageText = d.message?.message || '';
      if (!messageText && d.message?.media) {
        const mediaType = d.message.media.className || d.message.media._ || '';
        if (mediaType.includes('Photo')) messageText = '📷 Photo';
        else if (mediaType.includes('Document')) {
          messageText = d.message.media.document?.attributes?.some((a: any) => a._ === 'documentAttributeAudio')
            ? '🎤 Voice message'
            : '📁 Document';
        } else messageText = '📎 Media';
      }

      const thumbUrl = hasPhoto ? thumbCache.get(peerIdStr) || (entity?.id ? thumbCache.get(entity.id.toString()) : undefined) : undefined;

      let participantsCount: number | undefined = undefined;
      if (entity) {
        if (typeof entity.participantsCount === 'number') participantsCount = entity.participantsCount;
        else if (typeof entity.participants_count === 'number') participantsCount = entity.participants_count;
      }

      return {
        id: peerIdStr,
        title,
        username,
        phone,
        isUser,
        isGroup,
        isChannel,
        isVerified,
        hasAvatar: hasPhoto,
        avatar: hasPhoto ? avatarBlobUrlCache.get(peerIdStr) : undefined,
        thumbUrl,
        unreadCount: d.unreadCount || 0,
        unreadMentionsCount: d.unreadMentionsCount || 0,
        pinned: Boolean(d.pinned),
        participantsCount,
        memberCount: participantsCount,
        date: d.date ? d.date * 1000 : Date.now(),
        lastMessage: {
          id: d.message?.id,
          text: messageText,
          date: d.message?.date ? d.message.date * 1000 : Date.now(),
          out: Boolean(d.message?.out),
          senderId: d.message?.senderId?.toString(),
        },
      };
    });
  },

  /**
   * Get messages for a given chat or channel
   */
  async getMessages(chatId: string, limit = 50, offsetId?: number): Promise<TelegramMessage[]> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      throw new Error('Not authorized with Telegram MTProto');
    }

    let targetPeer = peerEntityCache.get(chatId);
    if (!targetPeer) {
      try {
        targetPeer = await client.getInputEntity(chatId);
        if (targetPeer) peerEntityCache.set(chatId, targetPeer);
      } catch (e) {
        targetPeer = chatId;
      }
    }

    const fetchOptions: any = { limit: Math.min(limit, 100) };
    if (offsetId && offsetId > 0) {
      fetchOptions.offsetId = offsetId;
    }

    const messages = await client.getMessages(targetPeer, fetchOptions);

    return messages.map((m: any) => {
      let senderIdStr = m.senderId ? m.senderId.toString() : (m.fromId ? extractPeerId(m.fromId) : null);
      const senderEntity = m.sender || m._sender || (senderIdStr ? peerEntityCache.get(senderIdStr) : null);

      if (senderEntity && senderEntity.id) {
        const sId = senderEntity.id.toString();
        if (!senderIdStr) senderIdStr = sId;
        peerEntityCache.set(sId, senderEntity);

        if (senderEntity.photo?.strippedThumb) {
          try {
            const thumbBuf = strippedPhotoToJpg(senderEntity.photo.strippedThumb);
            if (thumbBuf && thumbBuf.length > 0) {
              const b64 = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
              thumbCache.set(sId, b64);
              if (senderIdStr) thumbCache.set(senderIdStr, b64);
            }
          } catch (e) {}
        }
      }

      let senderName = '';
      if (senderEntity) {
        if (senderEntity.title) senderName = senderEntity.title;
        else senderName = [senderEntity.firstName, senderEntity.lastName].filter(Boolean).join(' ');
      }
      if (!senderName && m.postAuthor) senderName = m.postAuthor;

      const senderThumbUrl = !m.out && senderIdStr ? thumbCache.get(senderIdStr) : undefined;

      let hasMedia = Boolean(m.media);
      let mediaType: 'photo' | 'video' | 'voice' | 'audio' | 'document' | null = null;
      let mediaThumb: string | undefined = undefined;
      let fileName: string | undefined = undefined;
      let fileSize: string | undefined = undefined;

      if (m.media) {
        messageMediaMap.set(`${chatId}_${m.id}`, m.media);
        messageMediaMap.set(String(m.id), m.media);
        const cls = m.media.className || m.media._ || '';
        if (cls.includes('Photo')) {
          mediaType = 'photo';
          if (m.media.photo?.strippedThumb) {
            try {
              const thumbBuf = strippedPhotoToJpg(m.media.photo.strippedThumb);
              if (thumbBuf && thumbBuf.length > 0) {
                mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
              }
            } catch (e) {}
          }
        } else if (cls.includes('Document')) {
          const attrs = m.media.document?.attributes || [];
          const isVideoAttr = attrs.some((a: any) =>
            a._ === 'documentAttributeVideo' ||
            a.className === 'DocumentAttributeVideo' ||
            a._ === 'documentAttributeAnimated' ||
            a.className === 'DocumentAttributeAnimated'
          );
          const isVoice = attrs.some((a: any) =>
            (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && a.voice
          );
          const isAudio = attrs.some((a: any) =>
            (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && !a.voice
          );
          const filenameAttr = attrs.find((a: any) =>
            a._ === 'documentAttributeFilename' || a.className === 'DocumentAttributeFilename'
          );

          const mime = (m.media.document?.mimeType || '').toLowerCase();

          if (isVideoAttr || mime.startsWith('video/')) {
            mediaType = 'video';
          } else if (isVoice) {
            mediaType = 'voice';
          } else if (isAudio || mime.startsWith('audio/')) {
            mediaType = 'audio';
          } else if (mime.startsWith('image/')) {
            mediaType = 'photo';
          } else {
            mediaType = 'document';
          }

          if (m.media.document?.thumbs) {
            const stripped = m.media.document.thumbs.find((t: any) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize');
            if (stripped?.bytes) {
              try {
                const thumbBuf = strippedPhotoToJpg(stripped.bytes);
                if (thumbBuf && thumbBuf.length > 0) {
                  mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
                }
              } catch (e) {}
            }
          }

          if (filenameAttr) fileName = filenameAttr.fileName;
          fileSize = m.media.document?.size ? formatBytes(Number(m.media.document.size)) : undefined;
        }
      }

      let reactions: { emoji: string; count: number; userReacted?: boolean }[] = [];
      if (m.reactions && m.reactions.results) {
        reactions = m.reactions.results.map((r: any) => {
          let emojiStr = '👍';
          if (r.reaction && r.reaction.emoticon) emojiStr = r.reaction.emoticon;
          return {
            emoji: emojiStr,
            count: r.count || 1,
            userReacted: Boolean(r.chosenOrder !== undefined || r.chosen),
          };
        });
      }

      return {
        id: m.id,
        text: m.message || '',
        date: m.date ? m.date * 1000 : Date.now(),
        out: Boolean(m.out),
        senderId: senderIdStr || undefined,
        senderName: senderName || undefined,
        senderAvatar: (!m.out && senderIdStr) ? avatarBlobUrlCache.get(senderIdStr) : undefined,
        senderThumbUrl,
        hasMedia,
        mediaType,
        mediaThumb,
        fileName,
        fileSize,
        replyToMsgId: m.replyTo?.replyToMsgId,
        reactions,
      };
    });
  },

  /**
   * Send a text message to a chat or channel
   */
  async sendMessage(chatId: string, message: string, replyToMsgId?: number): Promise<TelegramMessage> {
    const client = await getDirectClient();
    const sendParams: any = { message };
    if (replyToMsgId) {
      sendParams.replyTo = parseInt(String(replyToMsgId), 10);
    }

    let targetPeer = peerEntityCache.get(chatId) || chatId;
    const result: any = await client.sendMessage(targetPeer, sendParams);

    return {
      id: result.id,
      text: message,
      date: result.date ? result.date * 1000 : Date.now(),
      out: true,
      reactions: [],
    };
  },

  /**
   * Send an emoji reaction to a message
   */
  async sendReaction(chatId: string, messageId: string, emoji = '👍'): Promise<{ success: boolean }> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId) || chatId;

    await client.invoke(
      new Api.messages.SendReaction({
        peer: targetPeer,
        msgId: parseInt(messageId, 10),
        reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
      })
    );

    return { success: true };
  },

  /**
   * Edit a message
   */
  async editMessage(chatId: string, messageId: string, text: string): Promise<{ success: boolean; message: any }> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId) || chatId;

    const result = await client.editMessage(targetPeer, {
      message: parseInt(messageId, 10),
      text,
    });

    return { success: true, message: result };
  },

  /**
   * Delete a message
   */
  async deleteMessage(chatId: string, messageId: string): Promise<{ success: boolean }> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId) || chatId;

    await client.deleteMessages(targetPeer, [parseInt(messageId, 10)], { revoke: true });
    return { success: true };
  },

  /**
   * Pin a message in a chat
   */
  async pinMessage(chatId: string, messageId: string, silent = false): Promise<{ success: boolean }> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId) || chatId;

    await client.pinMessage(targetPeer, parseInt(messageId, 10), { notify: !silent });
    return { success: true };
  },

  /**
   * Get user's contacts
   */
  async getContacts(): Promise<TelegramUser[]> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) return [];

    const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) as any }));
    if (!result || !result.users) return [];

    return result.users.map((u: any) => serializeUser(u)).filter(Boolean) as TelegramUser[];
  },

  /**
   * Get dialog filters (folders)
   */
  async getDialogFilters(): Promise<TeleForgeDialogFilter[]> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) return [];

    const res: any = await client.invoke(new Api.messages.GetDialogFilters());
    const rawFilters = Array.isArray(res) ? res : res?.filters || [];

    const filters: TeleForgeDialogFilter[] = [];
    for (const f of rawFilters) {
      if (!f) continue;
      if (f.className === 'DialogFilterDefault' || f._ === 'dialogFilterDefault') {
        filters.push({
          id: 'all',
          numericId: 0,
          title: 'All Chats',
          emoticon: '',
          isDefault: true,
        });
        continue;
      }

      let titleStr = 'Folder';
      if (typeof f.title === 'string') titleStr = f.title;
      else if (f.title?.text) titleStr = f.title.text;

      let emoticonStr = '';
      if (typeof f.emoticon === 'string') emoticonStr = f.emoticon;
      else if (f.emoticon?.text) emoticonStr = f.emoticon.text;

      filters.push({
        id: f.id ? f.id.toString() : `filter-${Date.now()}`,
        numericId: f.id || 0,
        title: titleStr,
        emoticon: emoticonStr,
        contacts: Boolean(f.contacts),
        nonContacts: Boolean(f.nonContacts),
        groups: Boolean(f.groups),
        channels: Boolean(f.broadcasts),
        bots: Boolean(f.bots),
        excludeMuted: Boolean(f.excludeMuted),
        excludeRead: Boolean(f.excludeRead),
        unreadOnly: Boolean(f.excludeRead),
        excludeArchived: f.excludeArchived !== false,
        pinnedChatIds: (f.pinnedPeers || []).map(extractPeerId).filter(Boolean),
        includeChatIds: (f.includePeers || []).map(extractPeerId).filter(Boolean),
        excludeChatIds: (f.excludePeers || []).map(extractPeerId).filter(Boolean),
      });
    }

    return filters;
  },

  /**
   * Save a dialog filter (folder)
   */
  async saveDialogFilter(filterData: Partial<TeleForgeDialogFilter> & { title: string }): Promise<{ success: boolean; filter: TeleForgeDialogFilter }> {
    const client = await getDirectClient();
    let numericId = parseInt(String(filterData.numericId || filterData.id), 10);
    if (isNaN(numericId) || numericId <= 1) {
      const existing = await this.getDialogFilters();
      const existingIds = existing.map((f) => f.numericId).filter((n): n is number => typeof n === 'number' && n >= 2);
      numericId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 2;
    }

    const pinnedPeers: any[] = [];
    for (const id of filterData.pinnedChatIds || []) {
      const p = await resolveInputPeer(client, id);
      if (p) pinnedPeers.push(p);
    }
    const includePeers: any[] = [];
    for (const id of filterData.includeChatIds || []) {
      const p = await resolveInputPeer(client, id);
      if (p) includePeers.push(p);
    }
    const excludePeers: any[] = [];
    for (const id of filterData.excludeChatIds || []) {
      const p = await resolveInputPeer(client, id);
      if (p) excludePeers.push(p);
    }

    const cleanTitle = (filterData.title || 'Folder').trim();
    const cleanEmoticon = (filterData.emoticon || '').trim();

    const dialogFilter = new Api.DialogFilter({
      id: numericId,
      title: new Api.TextWithEntities({ text: cleanTitle, entities: [] }),
      emoticon: cleanEmoticon || undefined,
      contacts: Boolean(filterData.contacts),
      nonContacts: Boolean(filterData.nonContacts),
      groups: Boolean(filterData.groups),
      broadcasts: Boolean(filterData.channels),
      bots: Boolean(filterData.bots),
      excludeMuted: Boolean(filterData.excludeMuted),
      excludeRead: Boolean(filterData.unreadOnly || filterData.excludeRead),
      excludeArchived: filterData.excludeArchived !== false,
      pinnedPeers,
      includePeers,
      excludePeers,
    });

    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: numericId,
        filter: dialogFilter,
      })
    );

    return {
      success: true,
      filter: {
        id: numericId.toString(),
        numericId,
        title: cleanTitle,
        emoticon: cleanEmoticon,
        contacts: Boolean(filterData.contacts),
        nonContacts: Boolean(filterData.nonContacts),
        groups: Boolean(filterData.groups),
        channels: Boolean(filterData.channels),
        bots: Boolean(filterData.bots),
        excludeMuted: Boolean(filterData.excludeMuted),
        excludeRead: Boolean(filterData.unreadOnly || filterData.excludeRead),
        unreadOnly: Boolean(filterData.unreadOnly || filterData.excludeRead),
        excludeArchived: filterData.excludeArchived !== false,
        pinnedChatIds: filterData.pinnedChatIds || [],
        includeChatIds: filterData.includeChatIds || [],
        excludeChatIds: filterData.excludeChatIds || [],
      },
    };
  },

  /**
   * Delete a dialog filter (folder)
   */
  async deleteDialogFilter(id: string): Promise<{ success: boolean; id: string }> {
    const client = await getDirectClient();
    const numericId = parseInt(id, 10);
    if (isNaN(numericId) || numericId <= 0) {
      throw new Error('Invalid folder ID');
    }

    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: numericId,
        filter: undefined,
      })
    );

    return { success: true, id: numericId.toString() };
  },

  /**
   * Reorder dialog filters
   */
  async reorderDialogFilters(order: string[]): Promise<{ success: boolean; order: number[] }> {
    const client = await getDirectClient();
    const numericOrder = order.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n) && n >= 2);

    await client.invoke(
      new Api.messages.UpdateDialogFiltersOrder({
        order: numericOrder,
      })
    );

    return { success: true, order: numericOrder };
  },

  /**
   * Get full info (about / members) for a chat
   */
  async getChatFullInfo(id: string): Promise<{ id: string; memberCount?: number; about?: string }> {
    const client = await getDirectClient();
    let entity = peerEntityCache.get(id);
    if (!entity) {
      try {
        entity = await client.getEntity(id);
        if (entity) peerEntityCache.set(id, entity);
      } catch (e) {}
    }

    let memberCount = entity?.participantsCount ?? entity?.participants_count ?? undefined;
    let about = undefined;

    try {
      if (entity?.className === 'Channel') {
        const full: any = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
        if (full?.fullChat) {
          memberCount = full.fullChat.participantsCount ?? full.fullChat.participants_count ?? memberCount;
          about = full.fullChat.about;
        }
      } else if (entity?.className === 'Chat') {
        const full: any = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
        if (full?.fullChat) {
          about = full.fullChat.about;
        }
      } else if (entity?.className === 'User') {
        const full: any = await client.invoke(new Api.users.GetFullUser({ id: entity }));
        if (full?.fullUser) {
          about = full.fullUser.about;
        }
      }
    } catch (e) {}

    return { id, memberCount, about };
  },

  /**
   * Mark peer messages as read
   */
  async markAsRead(chatId: string): Promise<void> {
    try {
      const client = await getDirectClient();
      let entity = peerEntityCache.get(chatId) || chatId;
      await client.markAsRead(entity);
    } catch (e) {}
  },

  /**
   * Search global Telegram directory
   */
  async searchGlobal(q: string, limit = 20): Promise<{ myResults: TelegramDialog[]; globalResults: TelegramDialog[] }> {
    if (!q || q.trim().length < 2) return { myResults: [], globalResults: [] };

    try {
      const client = await getDirectClient();
      const res: any = await client.invoke(
        new Api.contacts.Search({
          q: q.trim(),
          limit: Math.min(limit, 50),
        })
      );

      const mapResult = (peer: any): TelegramDialog | null => {
        if (!peer) return null;
        const id = peer.id ? peer.id.toString() : '';
        const title = peer.title || [peer.firstName, peer.lastName].filter(Boolean).join(' ') || peer.username || 'Telegram User';
        return {
          id,
          title,
          username: peer.username,
          isUser: peer.className === 'User',
          isGroup: Boolean(peer.megagroup || peer.className === 'Chat'),
          isChannel: peer.className === 'Channel' && !peer.megagroup,
          isVerified: Boolean(peer.verified),
          hasAvatar: Boolean(peer.photo),
          unreadCount: 0,
          unreadMentionsCount: 0,
          pinned: false,
          date: Date.now(),
        };
      };

      const myResults = (res.myResults || []).map(mapResult).filter(Boolean) as TelegramDialog[];
      const globalResults = (res.results || []).map(mapResult).filter(Boolean) as TelegramDialog[];
      return { myResults, globalResults };
    } catch (e) {
      return { myResults: [], globalResults: [] };
    }
  },

  /**
   * Join a public channel or group
   */
  async joinChat(chatId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await getDirectClient();
      let entity = peerEntityCache.get(chatId);
      if (!entity) {
        entity = await client.getEntity(chatId);
      }

      if (entity.className === 'Channel') {
        await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
      } else if (entity.className === 'Chat') {
        await client.invoke(new Api.messages.AddChatUser({ chatId: entity.id, userId: 'me', fwdLimit: 100 }));
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Get user profile
   */
  async getProfile(): Promise<{ success: boolean; user: TelegramUser }> {
    const client = await getDirectClient();
    const me = await client.getMe();
    let bio = '';
    try {
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      bio = full?.fullUser?.about || full?.about || '';
    } catch (e) {}

    const sUser = serializeUser(me);
    if (sUser) {
      sUser.bio = bio;
      if (hasEntityPhoto(me)) {
        try {
          const highResBuf = await withTimeout(client.downloadProfilePhoto('me', { isBig: true }), 4000);
          if (highResBuf && highResBuf.length > 0) {
            const b64 = `data:image/jpeg;base64,${Buffer.from(highResBuf).toString('base64')}`;
            avatarBlobUrlCache.set('me', b64);
            if (sUser.id) avatarBlobUrlCache.set(sUser.id, b64);
            sUser.avatar = b64;
          }
        } catch (e) {}
      }
    }
    return { success: true, user: sUser! };
  },

  /**
   * Update user profile
   */
  async updateProfile(params: {
    name?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
    username?: string;
  }): Promise<{ success: boolean; user: TelegramUser }> {
    const client = await getDirectClient();
    let fName = params.firstName;
    let lName = params.lastName;

    if (params.name !== undefined && fName === undefined) {
      const trimmed = params.name.trim();
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx > 0) {
        fName = trimmed.slice(0, spaceIdx);
        lName = trimmed.slice(spaceIdx + 1);
      } else {
        fName = trimmed;
        lName = '';
      }
    }

    const updateFields: any = {};
    if (fName !== undefined) updateFields.firstName = fName;
    if (lName !== undefined) updateFields.lastName = lName;
    if (params.bio !== undefined) updateFields.about = params.bio;

    if (Object.keys(updateFields).length > 0) {
      await client.invoke(new Api.account.UpdateProfile(updateFields));
    }

    if (params.username !== undefined) {
      const cleanUsername = params.username.replace(/^@/, '').trim();
      const currentMe: any = await client.getMe();
      if ((currentMe.username || '') !== cleanUsername) {
        await client.invoke(new Api.account.UpdateUsername({ username: cleanUsername }));
      }
    }

    return this.getProfile();
  },

  /**
   * Download profile photo and return high-resolution base64 data-URL
   */
  async downloadAvatarUrl(peerId: string, isBig = false): Promise<string> {
    if (!peerId) return '';
    const cleanId = peerId.toString().trim();
    if (avatarBlobUrlCache.has(cleanId)) {
      return avatarBlobUrlCache.get(cleanId)!;
    }

    try {
      const client = await getDirectClient();
      let targetPeer: any = cleanId === 'me' ? 'me' : peerEntityCache.get(cleanId);
      if (!targetPeer && cleanId !== 'me') {
        if (cleanId.startsWith('-100')) {
          targetPeer = peerEntityCache.get(cleanId.slice(4));
        } else if (cleanId.startsWith('-')) {
          targetPeer = peerEntityCache.get(cleanId.slice(1));
        }
      }
      if (!targetPeer && cleanId !== 'me') {
        try {
          targetPeer = await client.getInputEntity(cleanId);
        } catch (e) {
          targetPeer = cleanId;
        }
      }

      const buffer = await client.downloadProfilePhoto(targetPeer || cleanId, { isBig });
      if (buffer && buffer.length > 0) {
        const dataUrl = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
        avatarBlobUrlCache.set(cleanId, dataUrl);
        return dataUrl;
      }
    } catch (e) {}

    return '';
  },

  /**
   * Upload user profile photo directly via MTProto
   */
  async uploadProfilePhoto(params: {
    file?: File;
    fileBase64?: string;
    filename?: string;
    url?: string;
  }): Promise<{ success: boolean; user: TelegramUser; avatarUrl: string }> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      throw new Error('Not authorized with Telegram MTProto');
    }

    let buffer: Buffer;
    let name = params.filename || 'profile.jpg';

    if (params.file) {
      const arrayBuf = await params.file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      if (params.file.name) name = params.file.name;
    } else if (params.fileBase64) {
      const cleanBase64 = params.fileBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    } else if (params.url) {
      buffer = await downloadImageFromUrl(params.url);
      try {
        const urlObj = new URL(params.url);
        const base = urlObj.pathname.split('/').pop();
        if (base && /\.(jpe?g|png|webp|gif)$/i.test(base)) {
          name = base;
        }
      } catch (e) {}
    } else {
      throw new Error('Either an image file, base64 data, or a valid URL must be provided');
    }

    if (!buffer || buffer.length < 50) {
      throw new Error('Image data is empty or invalid');
    }

    // Wrap buffer in CustomFile for GramJS
    const customFile = new CustomFile(name, buffer.length, '', buffer);
    const uploadedFile = await client.uploadFile({
      file: customFile,
      workers: 1,
    });

    await client.invoke(
      new Api.photos.UploadProfilePhoto({
        file: uploadedFile,
      })
    );

    console.log('[MTProto-Direct] Successfully uploaded profile photo to Telegram cloud');

    // Refresh profile
    const me: any = await client.getMe();
    const myId = String(me.id);

    // Download the new high-res photo directly
    let newAvatarUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    try {
      const highResBuf = await withTimeout(client.downloadProfilePhoto('me', { isBig: true }), 6000);
      if (highResBuf && highResBuf.length > 0) {
        newAvatarUrl = `data:image/jpeg;base64,${Buffer.from(highResBuf).toString('base64')}`;
      }
    } catch (e) {}

    // Update avatar caches
    avatarBlobUrlCache.set('me', newAvatarUrl);
    avatarBlobUrlCache.set(myId, newAvatarUrl);

    let bio = '';
    try {
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      bio = full?.fullUser?.about || full?.about || '';
    } catch (e) {}

    const sUser = serializeUser(me);
    if (sUser) {
      sUser.bio = bio;
      sUser.avatar = newAvatarUrl;
      sUser.hasAvatar = true;
      try {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(sUser));
      } catch (e) {}
    }

    return {
      success: true,
      user: sUser!,
      avatarUrl: newAvatarUrl,
    };
  },

  /**
   * Delete user profile photo directly via MTProto
   */
  async deleteProfilePhoto(): Promise<{ success: boolean; user: TelegramUser }> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      throw new Error('Not authorized with Telegram MTProto');
    }

    const me = await client.getMe();
    const myId = String(me.id);

    try {
      const userPhotos: any = await client.invoke(
        new Api.photos.GetUserPhotos({
          userId: 'me' as any,
          offset: 0,
          maxId: bigInt(0) as any,
          limit: 1,
        })
      );

      if (userPhotos && userPhotos.photos && userPhotos.photos.length > 0) {
        const photo: any = userPhotos.photos[0];
        if (photo.id) {
          await client.invoke(
            new Api.photos.DeletePhotos({
              id: [
                new Api.InputPhoto({
                  id: photo.id,
                  accessHash: photo.accessHash,
                  fileReference: photo.fileReference,
                }),
              ],
            })
          );
          console.log('[MTProto-Direct] Successfully deleted profile photo on Telegram cloud');
        }
      }
    } catch (err: any) {
      console.warn('[MTProto-Direct] Error deleting profile photo:', err.message);
      throw new Error(err.message || 'Failed to remove profile photo from Telegram');
    }

    avatarBlobUrlCache.delete('me');
    avatarBlobUrlCache.delete(myId);

    const meAfter = await client.getMe();
    const sUser = serializeUser(meAfter);
    if (sUser) {
      sUser.avatar = '';
      sUser.hasAvatar = false;
      try {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(sUser));
      } catch (e) {}
    }

    return {
      success: true,
      user: sUser!,
    };
  },

  /**
   * Download message media (photo or video/document) directly via GramJS MTProto
   * Optimized: uses cached media object, fast responsive thumbnail for photos,
   * and thumbnail-only for videos until explicit playback is requested.
   */
  async downloadMessageMedia(
    chatId: string,
    messageId: string | number,
    options?: { fullRes?: boolean; fullVideo?: boolean }
  ): Promise<{ dataUrl: string; mimeType: string } | null> {
    if (!chatId || messageId == null) return null;
    const client = await getDirectClient();
    const idNum = typeof messageId === 'number' ? messageId : parseInt(String(messageId), 10);
    const mediaKey = `${chatId}_${idNum}`;

    try {
      let media = messageMediaMap.get(mediaKey) || messageMediaMap.get(String(idNum));
      if (!media) {
        let targetPeer = peerEntityCache.get(chatId) || chatId;
        if (!peerEntityCache.has(chatId)) {
          try {
            targetPeer = await client.getInputEntity(chatId);
          } catch (e) {
            targetPeer = chatId;
          }
        }
        const messages: any = await client.getMessages(targetPeer, { ids: [idNum] });
        if (!messages || !messages[0] || !messages[0].media) return null;
        media = messages[0].media;
        messageMediaMap.set(mediaKey, media);
      }

      let mimeType = 'application/octet-stream';
      const cls = media.className || media._ || '';
      const isPhoto = cls.includes('Photo');
      const isDocument = cls.includes('Document');

      let downloadParams: any = {};

      if (isPhoto) {
        mimeType = 'image/jpeg';
        // For inline chat view, download standard medium thumb ('x') for instant ~80KB load
        // Only fetch full multi-megabyte 4K photo if fullRes is requested (e.g. MediaModal)
        if (!options?.fullRes) {
          downloadParams.thumb = 'x';
        }
      } else if (isDocument) {
        mimeType = media.document?.mimeType || 'application/octet-stream';
        const isVideo = mimeType.startsWith('video/') || (media.document?.attributes || []).some((a: any) =>
          a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo' ||
          a._ === 'documentAttributeAnimated' || a.className === 'DocumentAttributeAnimated'
        );

        if (isVideo) {
          // If not playing full video, download the video thumbnail (fast ~25KB), NEVER the full 50MB video!
          if (!options?.fullVideo) {
            downloadParams.thumb = -1; // highest quality thumbnail
            mimeType = 'image/jpeg';
          }
        }
      }

      const buffer: any = await client.downloadMedia(media, downloadParams);
      if (!buffer || buffer.length === 0) return null;

      const dataUrl = `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
      return { dataUrl, mimeType };
    } catch (err: any) {
      console.warn('[MTProto-Direct] downloadMessageMedia error:', err?.message || err);
      return null;
    }
  },
};

/**
 * Download an image from an HTTP/HTTPS URL into a Buffer.
 * Supports Android WebView native proxy, direct fetch, and CORS fallback proxies.
 */
async function downloadImageFromUrl(url: string): Promise<Buffer> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Image URL is empty');
  }

  // 1. If running inside Android WebView, use the native proxy route (bypasses browser CORS completely)
  if (
    typeof window !== 'undefined' &&
    ((window as any).__IS_TELEFORGE_ANDROID__ ||
      window.location.origin.includes('androidplatform.net') ||
      (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('TeleForgeAndroid')))
  ) {
    try {
      const nativeProxy = `https://appassets.androidplatform.net/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
      const resp = await withTimeout(fetch(nativeProxy), 12000);
      if (resp.ok) {
        const arr = await resp.arrayBuffer();
        if (arr.byteLength > 50) {
          return Buffer.from(arr);
        }
      }
    } catch (e) {}
  }

  // 2. Direct fetch (works if remote server has CORS enabled or is same-origin)
  try {
    const resp = await withTimeout(fetch(cleanUrl), 8000);
    if (resp.ok) {
      const arr = await resp.arrayBuffer();
      if (arr.byteLength > 50) {
        return Buffer.from(arr);
      }
    }
  } catch (e) {}

  // 3. Fallback: Public CORS proxies for web/desktop browser
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const resp = await withTimeout(fetch(proxyUrl), 10000);
      if (resp.ok) {
        const arr = await resp.arrayBuffer();
        if (arr.byteLength > 50) {
          return Buffer.from(arr);
        }
      }
    } catch (e) {}
  }

  throw new Error('Could not download image from the provided URL. Please verify the URL or try uploading the photo from local storage.');
}
