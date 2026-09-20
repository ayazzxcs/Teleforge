// Direct MTProto Telegram Client for TeleForge
// Connects directly to Telegram production servers over secure WebSocket (WSS)
// Runs entirely client-side inside the Android WebView and browser without requiring an external backend server.

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { strippedPhotoToJpg, getInputPeer } from 'telegram/Utils.js';
import { CustomFile } from 'telegram/client/uploads.js';
import bigInt from 'big-integer';
import { TeleForgeDialogFilter, TelegramReplyMarkup, TelegramKeyboardButton, TelegramButtonType } from '../types';
import {
  TelegramUser,
  TelegramDialog,
  TelegramMessage,
  TelegramSessionInfo,
  AuthStatusResponse,
  SendCodeResponse,
  SignInResponse,
  OnlineGifItem,
  TelegramStickerSet,
  TelegramStickerItem,
  resolveApiUrl,
  isAndroidApp,
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
const gifThumbCache = new Map<string, string>(); // docId -> base64 data URL
const stickerThumbCache = new Map<string, string>(); // docId -> base64 data URL
const gifBlobCache = new Map<string, string>(); // docId -> blob URL
const avatarBlobUrlCache = new Map<string, string>(); // peerId -> object URL
const messageMediaMap = new Map<string, any>(); // `${chatId}_${messageId}` -> media object
const messageObjectMap = new Map<string, any>(); // `${chatId}_${messageId}` -> full Api.Message object
const pendingLogins = new Map<string, { phoneCodeHash: string; isCodeViaApp: boolean; type?: string }>();

type AvatarListener = (peerId: string, dataUrl: string, isHighRes?: boolean) => void;
let avatarListener: AvatarListener | null = null;
export function setAvatarListener(listener: AvatarListener) {
  avatarListener = listener;
}

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function bytesToBase64(buffer: Uint8Array | number[] | ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer as any).toString('base64');
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as any);
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
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

export type DirectMessageListener = (event:
  | { chatId: string; message: TelegramMessage }
  | { type: 'message_reactions'; chatId: string; messageId: string; reactions: any[] }
) => void;

const messageListeners = new Set<DirectMessageListener>();

export function onDirectNewMessage(listener: DirectMessageListener): () => void {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
}

function extractReplyMarkup(markup: any): TelegramReplyMarkup | undefined {
  if (!markup) return undefined;
  const cls = markup.className || markup._ || '';
  const isInline = cls.includes('ReplyInlineMarkup');
  const isReply = cls.includes('ReplyKeyboardMarkup');
  const isHide = cls.includes('ReplyKeyboardHide');
  const isForceReply = cls.includes('ReplyKeyboardForceReply');

  if (isHide) {
    return { type: 'hide', rows: [] };
  }
  if (isForceReply) {
    return { type: 'force_reply', rows: [], placeholder: markup.placeholder || undefined };
  }
  if (!isInline && !isReply) return undefined;

  const rawRows = markup.rows || [];
  const rows = rawRows.map((r: any) => {
    const rawButtons = r.buttons || [];
    const buttons: TelegramKeyboardButton[] = rawButtons.map((btn: any) => {
      const btnCls = btn.className || btn._ || '';
      let type: TelegramButtonType = 'unknown';
      let url: string | undefined = undefined;
      let data: string | undefined = undefined;
      let query: string | undefined = undefined;
      let samePeer: boolean | undefined = undefined;

      if (btnCls.includes('KeyboardButtonUrlAuth')) {
        type = 'auth';
        url = btn.url || undefined;
      } else if (btnCls.includes('KeyboardButtonUrl')) {
        type = 'url';
        url = btn.url || undefined;
      } else if (btnCls.includes('KeyboardButtonCallback')) {
        type = 'callback';
        if (btn.data) {
          try {
            data = Buffer.isBuffer(btn.data) || btn.data instanceof Uint8Array
              ? Buffer.from(btn.data).toString('base64')
              : String(btn.data);
          } catch (e) {}
        }
      } else if (btnCls.includes('KeyboardButtonSwitchInline')) {
        type = 'switch_inline';
        query = btn.query || '';
        samePeer = Boolean(btn.samePeer);
      } else if (btnCls.includes('KeyboardButtonWebView') || btnCls.includes('KeyboardButtonSimpleWebView')) {
        type = 'web_view';
        url = btn.url || undefined;
      } else if (btnCls.includes('KeyboardButtonBuy')) {
        type = 'buy';
      } else if (btnCls.includes('KeyboardButtonGame')) {
        type = 'game';
      } else if (btnCls.includes('KeyboardButton')) {
        type = 'text';
      }

      return {
        text: btn.text || '',
        type,
        url,
        data,
        query,
        samePeer,
        requiresPassword: Boolean(btn.requiresPassword),
      };
    });
    return { buttons };
  }).filter((row: any) => row.buttons.length > 0);

  return {
    type: isInline ? 'inline' : 'reply',
    rows,
    resize: Boolean(markup.resize),
    singleUse: Boolean(markup.singleUse),
    selective: Boolean(markup.selective),
    persistent: Boolean(markup.persistent),
    placeholder: markup.placeholder || undefined,
  };
}

function mapGramJsMessage(m: any, chatId: string, batchMessagesMap?: Map<number, any>): TelegramMessage {
  let senderIdStr = m.senderId ? m.senderId.toString() : (m.fromId ? extractPeerId(m.fromId) : null);
  const senderEntity = m.sender || m._sender || (senderIdStr ? peerEntityCache.get(senderIdStr) : null);

  if (senderEntity && senderEntity.id) {
    const sId = senderEntity.id.toString();
    if (!senderIdStr) senderIdStr = sId;
    peerEntityCache.set(sId, senderEntity);

    const stripped = senderEntity.photo?.strippedThumb || senderEntity.photo?.stripped_thumb;
    if (stripped) {
      try {
        const thumbBuf = strippedPhotoToJpg(stripped);
        if (thumbBuf && thumbBuf.length > 0) {
          const b64 = `data:image/jpeg;base64,${bytesToBase64(thumbBuf)}`;
          thumbCache.set(sId, b64);
          if (senderIdStr) thumbCache.set(senderIdStr, b64);
          if (avatarListener) {
            avatarListener(sId, b64, false);
            if (senderIdStr) avatarListener(senderIdStr, b64, false);
          }
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
  let mediaType: 'photo' | 'video' | 'voice' | 'audio' | 'document' | 'sticker' | 'gif' | 'videoNote' | null = null;
  let mediaThumb: string | undefined = undefined;
  let fileName: string | undefined = undefined;
  let fileSize: string | undefined = undefined;
  let durationStr: string | undefined = undefined;
  let stickerEmoji: string | undefined = undefined;
  let stickerSet: any = undefined;
  let documentId: string | undefined = undefined;
  let accessHash: string | undefined = undefined;
  let fileReference: string | undefined = undefined;

  if (m.media) {
    messageMediaMap.set(`${chatId}_${m.id}`, m.media);
    messageMediaMap.set(String(m.id), m.media);
    messageObjectMap.set(`${chatId}_${m.id}`, m);
    messageObjectMap.set(String(m.id), m);
    const cls = m.media.className || m.media._ || '';
    if (cls.includes('Photo')) {
      mediaType = 'photo';
      let strippedBytes = m.media.photo?.strippedThumb;
      if (!strippedBytes && Array.isArray(m.media.photo?.sizes)) {
        const strippedObj = m.media.photo.sizes.find((s: any) =>
          s._ === 'photoStrippedSize' || s.className === 'PhotoStrippedSize' || s.bytes
        );
        if (strippedObj?.bytes) strippedBytes = strippedObj.bytes;
      }
      if (strippedBytes) {
        try {
          const thumbBuf = strippedPhotoToJpg(strippedBytes);
          if (thumbBuf && thumbBuf.length > 0) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
          }
        } catch (e) {}
      }
      if (!mediaThumb && Array.isArray(m.media.photo?.sizes)) {
        const cachedObj = m.media.photo.sizes.find((s: any) =>
          s._ === 'photoCachedSize' || s.className === 'PhotoCachedSize'
        );
        if (cachedObj?.bytes) {
          mediaThumb = `data:image/jpeg;base64,${Buffer.from(cachedObj.bytes).toString('base64')}`;
        }
      }
    } else if (cls.includes('Document')) {
      const doc = m.media.document;
      if (doc) {
        documentId = doc.id ? doc.id.toString() : undefined;
        accessHash = doc.accessHash ? doc.accessHash.toString() : undefined;
        if (doc.fileReference) {
          try {
            fileReference = Buffer.from(doc.fileReference).toString('hex');
          } catch (e) {}
        }
      }

      const attrs = doc?.attributes || [];
      const stickerAttr = attrs.find((a: any) =>
        a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker'
      );
      if (stickerAttr) {
        stickerEmoji = stickerAttr.alt || undefined;
        if (stickerAttr.stickerset) {
          const ss = stickerAttr.stickerset;
          stickerSet = {
            id: ss.id ? ss.id.toString() : undefined,
            accessHash: ss.accessHash ? ss.accessHash.toString() : undefined,
            shortName: ss.shortName || undefined,
          };
        }
      }
      const isSticker = Boolean(stickerAttr);
      const isGifAttr = attrs.some((a: any) =>
        a._ === 'documentAttributeAnimated' || a.className === 'DocumentAttributeAnimated'
      );
      const videoAttr = attrs.find((a: any) =>
        a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo'
      );
      const isRound = Boolean(videoAttr?.roundMessage);
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

      const rawDuration = videoAttr?.duration ?? (isVoice || isAudio ? attrs.find((a: any) => (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio'))?.duration : undefined);
      if (rawDuration != null) {
        const totalSecs = Math.round(Number(rawDuration));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }

      const isViaGifBot = Boolean(m.viaBotId || m.viaBotName === 'gif');
      const isGifMime = mime === 'image/gif' || (mime === 'video/mp4' && isGifAttr);
      const isGifFilename = filenameAttr?.fileName?.toLowerCase()?.endsWith('.gif') || filenameAttr?.fileName?.toLowerCase()?.includes('gif');
      const isInlineGif = isGifAttr || isGifMime || isViaGifBot || (Boolean(videoAttr && !isRound) && (isGifFilename || (rawDuration != null && rawDuration <= 60 && !filenameAttr)));

      if (isSticker || mime === 'image/webp' || mime === 'application/x-tgsticker') {
        mediaType = 'sticker';
      } else if (isRound) {
        mediaType = 'videoNote';
      } else if (isInlineGif) {
        mediaType = 'gif';
      } else if (videoAttr || mime.startsWith('video/')) {
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
        if (!mediaThumb) {
          const cached = m.media.document.thumbs.find((t: any) => (t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize') && t.bytes);
          if (cached?.bytes) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(cached.bytes).toString('base64')}`;
          }
        }
      }

      if (filenameAttr) fileName = filenameAttr.fileName;
      fileSize = m.media.document?.size ? formatBytes(Number(m.media.document.size)) : undefined;
    } else if (cls.includes('Poll')) {
      const pollQuestion = m.media.poll?.question?.text || m.media.poll?.question || 'Poll';
      if (!m.message) m.message = `📊 ${pollQuestion}`;
    } else if (cls.includes('Contact')) {
      if (!m.message) {
        m.message = `👤 Contact: ${[m.media.firstName, m.media.lastName].filter(Boolean).join(' ')} (${m.media.phoneNumber || ''})`;
      }
    } else if (cls.includes('Geo')) {
      if (!m.message) {
        m.message = `📍 Location: ${m.media.geo?.lat}, ${m.media.geo?.long}`;
      }
    } else if (cls.includes('Dice')) {
      if (!m.message) {
        m.message = m.media.emoticon || '🎲';
      }
    }
  }

  let actionText: string | undefined = undefined;
  if (m.action) {
    const actCls = m.action.className || m.action._ || '';
    if (actCls.includes('ChatAddUser') || actCls.includes('ChatJoinedByLink')) {
      actionText = 'joined the group';
    } else if (actCls.includes('ChatDeleteUser')) {
      actionText = 'left the group';
    } else if (actCls.includes('PinMessage')) {
      actionText = 'pinned a message';
    } else if (actCls.includes('ChatEditPhoto')) {
      actionText = 'changed group photo';
    } else if (actCls.includes('ChatEditTitle')) {
      actionText = `changed group name to "${m.action.title || ''}"`;
    } else if (actCls.includes('ChannelCreate')) {
      actionText = 'Channel created';
    } else if (actCls.includes('ChatCreate')) {
      actionText = 'Group created';
    } else if (actCls.includes('PhoneCall')) {
      actionText = 'Phone call';
    } else {
      actionText = 'Notification update';
    }
  }

  let forwardFrom: { id?: string; name: string; avatar?: string; thumbUrl?: string; isChannel?: boolean } | undefined = undefined;
  if (m.fwdFrom) {
    const fromPeerId = m.fwdFrom.fromId ? extractPeerId(m.fwdFrom.fromId) : null;
    const fwdEntity = fromPeerId ? peerEntityCache.get(fromPeerId) : null;
    const fwdName = m.fwdFrom.fromName ||
      (fwdEntity ? (fwdEntity.title || fwdEntity.firstName) : null) ||
      'Forwarded message';
    forwardFrom = {
      id: fromPeerId || undefined,
      name: fwdName,
      avatar: fromPeerId ? `/api/telegram/avatar?id=${encodeURIComponent(fromPeerId)}` : undefined,
      isChannel: Boolean(m.fwdFrom.channelPost),
    };
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

  const isRound = mediaType === 'videoNote';
  const isSticker = mediaType === 'sticker';
  const isGif = mediaType === 'gif';

  let rawMessage = m.message || '';
  if (!rawMessage && actionText) {
    rawMessage = `${senderName ? `${senderName} ` : ''}${actionText}`;
  }

  return {
    id: m.id,
    text: rawMessage,
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
    duration: durationStr,
    replyToMsgId: m.replyTo?.replyToMsgId,
    replyToText: (() => {
      if (m.replyTo?.quoteText) return m.replyTo.quoteText;
      if (m.replyTo?.replyToMsgId && batchMessagesMap) {
        const rm = batchMessagesMap.get(m.replyTo.replyToMsgId);
        if (rm) {
          if (rm.message) return rm.message;
          if (rm.media) return 'Attachment';
        }
      }
      return undefined;
    })(),
    replyToSenderName: (() => {
      if (m.replyTo?.replyToMsgId && batchMessagesMap) {
        const rm = batchMessagesMap.get(m.replyTo.replyToMsgId);
        if (rm) {
          if (rm.out) return 'You';
          const rmSenderId = rm.senderId ? rm.senderId.toString() : (rm.fromId ? extractPeerId(rm.fromId) : null);
          if (rmSenderId) {
            const ent = rm.sender || rm._sender || peerEntityCache.get(rmSenderId.toString());
            if (ent) {
              return ent.firstName
                ? `${ent.firstName}${ent.lastName ? ` ${ent.lastName}` : ''}`
                : (ent.title || ent.username || undefined);
            }
          }
        }
      }
      return undefined;
    })(),
    reactions,
    isRound,
    isSticker,
    isGif,
    stickerEmoji,
    stickerSet,
    documentId,
    accessHash,
    fileReference,
    actionText,
    forwardFrom,
    editDate: m.editDate ? m.editDate * 1000 : undefined,
    replyMarkup: extractReplyMarkup(m.replyMarkup),
  };
}

function handleSingleUpdate(u: any) {
  if (!u) return;
  const cls = u.className || u._ || '';
  let msgObj: any = null;
  let chatId: string | null = null;

  if (u.message && (cls.includes('UpdateNewMessage') || cls.includes('UpdateNewChannelMessage') || cls.includes('UpdateEditMessage') || cls.includes('UpdateEditChannelMessage'))) {
    msgObj = u.message;
    chatId = msgObj.peerId ? extractPeerId(msgObj.peerId) : null;
  } else if (cls.includes('UpdateShortChatMessage')) {
    chatId = `-${u.chatId}`;
    msgObj = {
      id: u.id,
      message: u.message,
      date: u.date,
      out: Boolean(u.out),
      fromId: u.fromId ? { userId: u.fromId } : undefined,
    };
  } else if (cls.includes('UpdateShortMessage')) {
    chatId = u.userId ? u.userId.toString() : null;
    msgObj = {
      id: u.id,
      message: u.message,
      date: u.date,
      out: Boolean(u.out),
      fromId: u.out ? undefined : (u.userId ? { userId: u.userId } : undefined),
    };
  }

  if (msgObj && chatId) {
    const mapped = mapGramJsMessage(msgObj, chatId);
    if (mapped) {
      messageListeners.forEach((fn) => {
        try {
          fn({ chatId: chatId!, message: mapped });
        } catch (err) {}
      });
    }
  } else if (cls.includes('UpdateMessageReactions') || cls.includes('UpdateBotMessageReaction')) {
    const pId = u.peer ? extractPeerId(u.peer) : null;
    if (pId && u.msgId) {
      let mappedReactions: any[] = [];
      if (u.reactions && Array.isArray(u.reactions.results)) {
        mappedReactions = u.reactions.results.map((r: any) => {
          let emojiStr = '👍';
          if (r.reaction && r.reaction.emoticon) {
            emojiStr = r.reaction.emoticon;
          } else if (typeof r.reaction === 'string') {
            emojiStr = r.reaction;
          }
          return {
            emoji: emojiStr,
            count: r.count || 1,
            userReacted: Boolean(r.chosenOrder !== undefined && r.chosenOrder !== null),
          };
        });
      }
      messageListeners.forEach((fn) => {
        try {
          fn({
            type: 'message_reactions',
            chatId: pId.toString(),
            messageId: u.msgId.toString(),
            reactions: mappedReactions,
          });
        } catch (err) {}
      });
    }
  }
}

function processUpdateEvent(event: any) {
  if (!event) return;
  if (Array.isArray(event.users)) {
    for (const user of event.users) {
      if (user && user.id) peerEntityCache.set(user.id.toString(), user);
    }
  }
  if (Array.isArray(event.chats)) {
    for (const chat of event.chats) {
      if (chat && chat.id) {
        const idStr = chat.id.toString();
        peerEntityCache.set(idStr, chat);
        peerEntityCache.set(`-${idStr}`, chat);
        peerEntityCache.set(`-100${idStr}`, chat);
      }
    }
  }

  if (Array.isArray(event.updates)) {
    for (const sub of event.updates) {
      handleSingleUpdate(sub);
    }
  } else {
    handleSingleUpdate(event);
  }
}

function persistSession(client: TelegramClient): void {
  try {
    const s = (client.session as any)?.save?.() as string | undefined;
    if (s && typeof s === 'string' && s.length > 5) {
      saveSessionString(s);
    }
  } catch (e) {}
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
      // 1. If existing clientInstance is disconnected, attempt clean reconnect first
      if (clientInstance) {
        try {
          console.log('[MTProto-Direct] Reconnecting existing Telegram client instance...');
          await withTimeout(clientInstance.connect(), 12000, 'Reconnection timed out.');
          if (clientInstance.connected) {
            persistSession(clientInstance);
            console.log('[MTProto-Direct] Reconnected existing client successfully.');
            return clientInstance;
          }
        } catch (reconnectErr) {
          console.warn('[MTProto-Direct] Reconnection failed, destroying stale client:', reconnectErr);
          try {
            await clientInstance.disconnect();
          } catch (e) {}
          clientInstance = null;
        }
      }

      const sessionStr = getStoredSessionString();
      const session = new StringSession(sessionStr);

      const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
        connectionRetries: 5,
        useWSS: true,
        timeout: 20,
        deviceModel: 'Samsung Galaxy S24 Ultra',
        systemVersion: 'Android 14',
        appVersion: '10.8.1',
        langCode: 'en',
        systemLangCode: 'en',
      });

      console.log('[MTProto-Direct] Connecting to Telegram production servers over WSS...');
      await withTimeout(client.connect(), 15000, 'Could not connect to Telegram servers (timeout).');
      console.log('[MTProto-Direct] Connected to Telegram production servers.');

      persistSession(client);

      try {
        client.addEventHandler((event: any) => {
          try {
            processUpdateEvent(event);
          } catch (e) {
            console.warn('[MTProto-Direct] Update processing error:', e);
          }
        });
      } catch (e) {}

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
  const userStripped = u.photo?.strippedThumb || u.photo?.stripped_thumb;
  if (userStripped && idStr) {
    try {
      const thumbBuf = strippedPhotoToJpg(userStripped);
      if (thumbBuf && thumbBuf.length > 0) {
        const thumbUrl = `data:image/jpeg;base64,${bytesToBase64(thumbBuf)}`;
        thumbCache.set(idStr, thumbUrl);
        if (avatarListener) avatarListener(idStr, thumbUrl, false);
      }
    } catch (e) {}
  }

  const cachedHighRes = hasPhoto ? avatarBlobUrlCache.get(idStr) : undefined;

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
    avatar: cachedHighRes && cachedHighRes.length >= 8000 ? cachedHighRes : undefined,
  };
}

async function resolveInputPeer(client: TelegramClient, id: string): Promise<any> {
  if (!id) return null;
  const str = id.toString();
  if (peerEntityCache.has(str)) {
    try {
      const cached = peerEntityCache.get(str);
      const input = await client.getInputEntity(cached);
      if (input) return input;
    } catch (e) {}
  }
  try {
    const entity = await client.getInputEntity(str);
    if (entity) return entity;
  } catch (e) {}

  try {
    if (str.startsWith('-100')) {
      const channelId = bigInt(str.slice(4)) as any;
      return new Api.InputPeerChannel({ channelId, accessHash: bigInt(0) as any });
    } else if (str.startsWith('-')) {
      const chatId = bigInt(str.slice(1)) as any;
      return new Api.InputPeerChat({ chatId });
    } else {
      const userId = bigInt(str) as any;
      return new Api.InputPeerUser({ userId, accessHash: bigInt(0) as any });
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

      persistSession(client);

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

        const photo = entity?.photo;
        const stripped = photo?.strippedThumb || photo?.stripped_thumb;
        if (stripped) {
          try {
            const thumbBuf = strippedPhotoToJpg(stripped);
            if (thumbBuf && thumbBuf.length > 0) {
              const b64 = `data:image/jpeg;base64,${bytesToBase64(thumbBuf)}`;
              thumbCache.set(peerIdStr, b64);
              if (entity.id) thumbCache.set(entity.id.toString(), b64);
              if (avatarListener) {
                avatarListener(peerIdStr, b64, false);
                if (entity.id) avatarListener(entity.id.toString(), b64, false);
              }
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

      const cachedHighRes = hasPhoto ? avatarBlobUrlCache.get(peerIdStr) : undefined;

      const isMuted = Boolean(
        ((d as any).dialog?.notifySettings?.muteUntil && (d as any).dialog.notifySettings.muteUntil > Math.floor(Date.now() / 1000)) ||
        (d as any).dialog?.notifySettings?.silent
      );

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
        avatar: cachedHighRes && cachedHighRes.length >= 8000 ? cachedHighRes : undefined,
        thumbUrl,
        unreadCount: d.unreadCount || 0,
        unreadMentionsCount: d.unreadMentionsCount || 0,
        pinned: Boolean(d.pinned),
        isMuted,
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
  async getMessages(
    chatId: string,
    limit = 50,
    offsetId?: number,
    options: { search?: string; addOffset?: number; ids?: number[] } = {}
  ): Promise<TelegramMessage[]> {
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
    if (options.addOffset !== undefined) {
      fetchOptions.addOffset = options.addOffset;
    }
    if (options.search && typeof options.search === 'string' && options.search.trim()) {
      fetchOptions.search = options.search.trim();
    }
    if (options.ids && Array.isArray(options.ids)) {
      fetchOptions.ids = options.ids;
    }

    try {
      const messages = await client.getMessages(targetPeer, fetchOptions);
      const batchMessagesMap = new Map<number, any>();
      for (const m of messages) {
        if (m && m.id) batchMessagesMap.set(m.id, m);
      }
      const missingReplyIds: number[] = [];
      for (const m of messages) {
        const rId = m?.replyTo?.replyToMsgId;
        if (rId && !batchMessagesMap.has(rId) && !missingReplyIds.includes(rId)) {
          missingReplyIds.push(rId);
        }
      }
      if (missingReplyIds.length > 0) {
        try {
          const fetchedReplies = await client.getMessages(targetPeer, { ids: missingReplyIds.slice(0, 25) });
          if (Array.isArray(fetchedReplies)) {
            for (const rm of fetchedReplies) {
              if (rm && rm.id) batchMessagesMap.set(rm.id, rm);
            }
          }
        } catch (e) {}
      }
      return messages.map((m: any) => mapGramJsMessage(m, chatId, batchMessagesMap));
    } catch (err: any) {
      console.warn('[MTProto-Direct] getMessages fallback for peer:', chatId, err?.message || err);
      return [];
    }
  },

  /**
   * Search messages in a chat directly via Telegram MTProto
   */
  async searchMessages(chatId: string, query: string, limit = 30): Promise<TelegramMessage[]> {
    if (!query || !query.trim()) return [];
    return this.getMessages(chatId, limit, 0, { search: query.trim() });
  },

  /**
   * Get messages surrounding a target message ID for direct navigation
   */
  async getMessagesAround(chatId: string, messageId: number | string, limit = 50): Promise<TelegramMessage[]> {
    const mid = parseInt(String(messageId), 10);
    if (!mid) return [];
    const half = Math.floor(limit / 2);
    return this.getMessages(chatId, limit, mid, { addOffset: -half });
  },

  /**
   * Fetch shared media (photos, videos, files, audio) directly from Telegram cloud
   */
  async getChatSharedMedia(
    chatId: string,
    type: 'photos' | 'videos' | 'files' | 'audio',
    limit = 50
  ): Promise<TelegramMessage[]> {
    if (!chatId) return [];
    try {
      const client = await getDirectClient();
      let targetPeer: any = peerEntityCache.get(chatId) || chatId;
      if (!peerEntityCache.has(chatId)) {
        try {
          targetPeer = await client.getInputEntity(chatId);
          if (targetPeer) peerEntityCache.set(chatId, targetPeer);
        } catch (e) {
          targetPeer = chatId;
        }
      }

      let filter: any;
      if (type === 'photos') {
        filter = new Api.InputMessagesFilterPhotos();
      } else if (type === 'videos') {
        filter = new Api.InputMessagesFilterVideo();
      } else if (type === 'audio') {
        filter = new Api.InputMessagesFilterMusic();
      } else {
        filter = new Api.InputMessagesFilterDocument();
      }

      const messages: any = await client.getMessages(targetPeer, {
        filter,
        limit: Math.min(limit, 100),
      });

      return messages.map((m: any) => mapGramJsMessage(m, chatId));
    } catch (err: any) {
      console.warn('[MTProto-Direct] getChatSharedMedia failed:', err?.message || err);
      return [];
    }
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

    const reactionList = emoji
      ? [new Api.ReactionEmoji({ emoticon: emoji })]
      : [];
    await client.invoke(
      new Api.messages.SendReaction({
        peer: targetPeer,
        msgId: parseInt(messageId, 10),
        reaction: reactionList,
      })
    );

    return { success: true };
  },

  /**
   * Get detailed list of users who reacted to a message
   */
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
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId) || chatId;
    const msgIdNum = parseInt(messageId, 10);

    try {
      const res: any = await client.invoke(
        new Api.messages.GetMessageReactionsList({
          peer: targetPeer,
          id: msgIdNum,
          limit: Math.min(limit, 100),
        })
      );

      if (res.users && Array.isArray(res.users)) {
        for (const u of res.users) {
          if (u && u.id) {
            const uIdStr = u.id.toString();
            peerEntityCache.set(uIdStr, u);
          }
        }
      }

      const userMap = new Map();
      if (Array.isArray(res.users)) {
        for (const u of res.users) {
          const idStr = u.id?.toString();
          const firstName = u.firstName || '';
          const lastName = u.lastName || '';
          const name = [firstName, lastName].filter(Boolean).join(' ') || 'Telegram User';
          userMap.set(idStr, {
            id: idStr,
            name,
            username: u.username || '',
            avatar: `/api/telegram/avatar?id=${encodeURIComponent(idStr)}`,
            isSelf: Boolean(u.self),
          });
        }
      }

      const chatMap = new Map();
      if (Array.isArray(res.chats)) {
        for (const c of res.chats) {
          const idStr = c.id?.toString();
          chatMap.set(idStr, {
            id: idStr,
            name: c.title || 'Telegram Group',
            avatar: `/api/telegram/avatar?id=${encodeURIComponent(idStr)}`,
          });
        }
      }

      const reactions = (res.reactions || []).map((r: any) => {
        const pId = r.peerId ? extractPeerId(r.peerId) : null;
        let peerInfo = pId ? (userMap.get(pId) || chatMap.get(pId)) : null;
        if (!peerInfo && pId) {
          const cached = peerEntityCache.get(pId);
          if (cached) {
            peerInfo = {
              id: pId,
              name: cached.title || [cached.firstName, cached.lastName].filter(Boolean).join(' ') || 'Telegram User',
              username: cached.username || '',
              avatar: `/api/telegram/avatar?id=${encodeURIComponent(pId)}`,
            };
          }
        }

        let emoji = '👍';
        if (r.reaction && r.reaction.emoticon) {
          emoji = r.reaction.emoticon;
        } else if (typeof r.reaction === 'string') {
          emoji = r.reaction;
        }

        return {
          peerId: pId,
          user: peerInfo || {
            id: pId || '',
            name: 'Telegram User',
            avatar: pId ? `/api/telegram/avatar?id=${encodeURIComponent(pId)}` : undefined,
          },
          emoji,
          date: r.date ? r.date * 1000 : Date.now(),
          isSelf: Boolean(r.my),
        };
      });

      return {
        count: res.count || reactions.length,
        reactions,
        nextOffset: res.nextOffset || null,
      };
    } catch (err: any) {
      console.warn('[MTProto-Direct] getMessageReactionsList error:', err.message);
      return { count: 0, reactions: [], nextOffset: null };
    }
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
   * Forward messages from one chat to another
   */
  async forwardMessages(
    fromChatId: string,
    toChatId: string,
    messageIds: string[] | number[],
    options: { silent?: boolean; dropAuthor?: boolean } = {}
  ): Promise<{ success: boolean; count?: number }> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) throw new Error('Not authorized with Telegram MTProto');

    const fromPeer = peerEntityCache.get(fromChatId) || fromChatId;
    const toPeer = peerEntityCache.get(toChatId) || toChatId;

    const ids = messageIds.map((id) => (typeof id === 'string' ? parseInt(id, 10) : id)).filter((id) => !isNaN(id));
    if (ids.length === 0) throw new Error('No valid messageIds provided');

    await client.forwardMessages(toPeer, {
      messages: ids,
      fromPeer: fromPeer,
      silent: Boolean(options.silent),
      dropAuthor: Boolean(options.dropAuthor),
    });

    return { success: true, count: ids.length };
  },

  /**
   * Get user's contacts
   */
  async getContacts(): Promise<TelegramUser[]> {
    const client = await getDirectClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) return [];

    const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) as any }));
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

      const entityMap = new Map<string, any>();

      // 1. Index all chats (channels & groups)
      for (const chat of (res.chats || [])) {
        if (!chat) continue;
        const idStr = chat.id ? chat.id.toString() : '';
        if (idStr) {
          entityMap.set(idStr, chat);
          entityMap.set(`-${idStr}`, chat);
          entityMap.set(`-100${idStr}`, chat);
          peerEntityCache.set(idStr, chat);
          peerEntityCache.set(`-100${idStr}`, chat);
        }
      }

      // 2. Index all users
      for (const user of (res.users || [])) {
        if (!user) continue;
        const idStr = user.id ? user.id.toString() : '';
        if (idStr) {
          entityMap.set(idStr, user);
          peerEntityCache.set(idStr, user);
        }
      }

      // 3. Helper to map any entity (Chat, Channel, or User) to TelegramDialog
      const mapEntity = (entity: any): TelegramDialog | null => {
        if (!entity) return null;
        const rawId = entity.id ? entity.id.toString() : '';
        if (!rawId) return null;

        const isUser = entity.className === 'User' || entity._ === 'user';
        const isChannel = (entity.className === 'Channel' || entity._ === 'channel') && !entity.megagroup;
        const isGroup = Boolean(entity.megagroup || entity.className === 'Chat' || entity._ === 'chat');

        let title = entity.title;
        if (!title && isUser) {
          title = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || 'User';
        }
        if (!title) {
          title = entity.username || (isChannel ? 'Telegram Channel' : isGroup ? 'Telegram Group' : 'Telegram User');
        }

        const memberCount = typeof entity.participantsCount === 'number' ? entity.participantsCount : undefined;
        const normalizedId = isChannel || isGroup ? (rawId.startsWith('-') ? rawId : `-100${rawId}`) : rawId;

        return {
          id: normalizedId,
          title,
          username: entity.username,
          isUser,
          isGroup,
          isChannel,
          isVerified: Boolean(entity.verified),
          hasAvatar: Boolean(entity.photo),
          unreadCount: 0,
          unreadMentionsCount: 0,
          pinned: false,
          date: Date.now(),
          memberCount,
        };
      };

      // Helper to resolve a Peer pointer to its real entity
      const resolvePeer = (peer: any): any => {
        if (!peer) return null;
        if (peer.className === 'User' || peer.className === 'Channel' || peer.className === 'Chat') {
          return peer;
        }
        const peerId = (peer.userId || peer.channelId || peer.chatId || peer.id)?.toString();
        if (peerId && entityMap.has(peerId)) {
          return entityMap.get(peerId);
        }
        return null;
      };

      // Map myResults and results
      const myResults = (res.myResults || []).map((p: any) => mapEntity(resolvePeer(p))).filter(Boolean) as TelegramDialog[];
      const globalFromResults = (res.results || []).map((p: any) => mapEntity(resolvePeer(p))).filter(Boolean) as TelegramDialog[];

      // In addition, include all real public channels, groups, and users returned by Telegram
      const allChatsMapped = (res.chats || []).map(mapEntity).filter(Boolean) as TelegramDialog[];
      const allUsersMapped = (res.users || []).map(mapEntity).filter(Boolean) as TelegramDialog[];

      // Combine and deduplicate by id
      const seenIds = new Set<string>();
      const globalResults: TelegramDialog[] = [];

      for (const item of [...globalFromResults, ...allChatsMapped, ...allUsersMapped]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          globalResults.push(item);
        }
      }

      return { myResults, globalResults };
    } catch (e) {
      console.warn('[MTProto-Direct] searchGlobal error:', e);
      return { myResults: [], globalResults: [] };
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
   * Get full user details for any user
   */
  async getUserFull(userId: string): Promise<{ bio?: string; phone?: string; username?: string; name?: string }> {
    try {
      const client = await getDirectClient();
      let target: any = peerEntityCache.get(userId);
      if (!target) {
        try {
          target = await client.getInputEntity(userId);
        } catch (e) {
          try {
            target = await client.getEntity(userId);
          } catch (e2) {
            target = null;
          }
        }
      }
      if (!target) {
        return {};
      }
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: target }));
      const bio = full?.fullUser?.about || full?.about || '';
      const user = full?.users?.[0] || full?.user || target;
      const phone = user?.phone || '';
      const username = user?.username || '';
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '';
      return { bio, phone, username, name };
    } catch (err) {
      console.warn('[MTProto-Direct] getUserFull error:', err);
      return {};
    }
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
      const cached = avatarBlobUrlCache.get(cleanId)!;
      if (cached && cached.length >= 8000) return cached;
    }

    try {
      const client = await getDirectClient();
      let targetPeer: any = cleanId === 'me' ? 'me' : null;
      if (!targetPeer) {
        const variations = [cleanId];
        if (cleanId.startsWith('-100')) {
          variations.push(cleanId.slice(4));
          variations.push(`-${cleanId.slice(4)}`);
        } else if (cleanId.startsWith('-')) {
          variations.push(cleanId.slice(1));
          variations.push(`-100${cleanId.slice(1)}`);
        } else {
          variations.push(`-100${cleanId}`);
          variations.push(`-${cleanId}`);
        }
        for (const v of variations) {
          if (peerEntityCache.has(v)) {
            targetPeer = peerEntityCache.get(v);
            break;
          }
        }
      }
      if (!targetPeer && cleanId !== 'me') {
        try {
          targetPeer = await client.getInputEntity(cleanId);
        } catch (e) {
          try {
            targetPeer = await resolveInputPeer(client, cleanId);
          } catch (rErr) {
            targetPeer = cleanId;
          }
        }
      }

      let buffer: any = null;
      try {
        buffer = await client.downloadProfilePhoto(targetPeer || cleanId, { isBig });
      } catch (e) {}

      if (!buffer || buffer.length < 500) {
        try {
          // If first attempt failed (often because targetPeer is a plain JSON object and GramJS's `instanceof` check fails),
          // fetch the real entity instance directly.
          let realEntity: any = targetPeer;
          try {
            realEntity = await client.getEntity(targetPeer || cleanId);
          } catch (e) {
            const inputPeer = await resolveInputPeer(client, cleanId);
            if (inputPeer) realEntity = await client.getEntity(inputPeer);
          }
          if (realEntity) {
            buffer = await client.downloadProfilePhoto(realEntity, { isBig });
            if ((!buffer || buffer.length < 500) && !isBig) {
              buffer = await client.downloadProfilePhoto(realEntity, { isBig: true });
            } else if ((!buffer || buffer.length < 500) && isBig) {
              buffer = await client.downloadProfilePhoto(realEntity, { isBig: false });
            }
          }
        } catch (fullErr) {}
      }

      // Robust fallback: direct InputPeerPhotoFileLocation download via client.downloadFile
      if (!buffer || buffer.length < 500) {
        try {
          let photo = targetPeer?.photo;
          if (!photo) {
            try {
              let realEntity: any = await client.getEntity(targetPeer || cleanId);
              photo = realEntity?.photo;
            } catch (e) {
              const inputPeer = await resolveInputPeer(client, cleanId);
              if (inputPeer) {
                let realEntity: any = await client.getEntity(inputPeer);
                photo = realEntity?.photo;
              }
            }
          }
          if (photo && (photo.photoId || photo.id)) {
            const photoIdStr = (photo.photoId || photo.id).toString();
            const photoId = bigInt(photoIdStr);
            const dcId = photo.dcId;
            let inputPeer: any = null;
            try {
              inputPeer = await client.getInputEntity(targetPeer || cleanId);
            } catch (pErr) {
              inputPeer = await resolveInputPeer(client, cleanId);
            }
            if (inputPeer) {
              const loc = new Api.InputPeerPhotoFileLocation({
                peer: inputPeer,
                photoId: photoId as any,
                big: isBig,
              });
              buffer = await client.downloadFile(loc, { dcId });
            }
          }
        } catch (fErr) {}
      }

      if (buffer && buffer.length > 500) {
        const dataUrl = `data:image/jpeg;base64,${bytesToBase64(buffer)}`;
        avatarBlobUrlCache.set(cleanId, dataUrl);
        if (avatarListener) avatarListener(cleanId, dataUrl, true);
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
  }): Promise<{ success: boolean; user: TelegramUser; avatarUrl: string; dataUrl?: string; photoId?: string }> {
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
  /**
   * Download message media (photo or video/document) directly via GramJS MTProto
   * Optimized: uses cached media/message object, fast responsive thumbnail for photos,
   * and chunked streaming with custom chunk writer for videos/documents to prevent
   * out-of-memory heap allocation failures on long videos.
   */
  async downloadMessageMedia(
    chatId: string,
    messageId: string | number,
    options?: {
      fullRes?: boolean;
      fullVideo?: boolean;
      onProgress?: (progress: number, downloaded: number, total: number) => void;
      onStreamReady?: (streamUrl: string) => void;
    }
  ): Promise<{ dataUrl: string; mimeType: string; blob?: Blob; size?: number } | null> {
    if (!chatId || messageId == null) return null;
    const client = await getDirectClient();
    const idNum = typeof messageId === 'number' ? messageId : parseInt(String(messageId), 10);
    const mediaKey = `${chatId}_${idNum}`;

    try {
      let targetMsg = messageObjectMap.get(mediaKey) || messageObjectMap.get(String(idNum));
      let media = messageMediaMap.get(mediaKey) || messageMediaMap.get(String(idNum));

      if (!targetMsg && !media) {
        let targetPeer = peerEntityCache.get(chatId) || chatId;
        if (!peerEntityCache.has(chatId)) {
          try {
            targetPeer = await client.getInputEntity(chatId);
          } catch (e) {
            targetPeer = chatId;
          }
        }
        const messages: any = await client.getMessages(targetPeer, { ids: [idNum] });
        if (messages && messages[0]) {
          targetMsg = messages[0];
          messageObjectMap.set(mediaKey, targetMsg);
          if (targetMsg.media) {
            media = targetMsg.media;
            messageMediaMap.set(mediaKey, media);
          }
        }
      }

      const mediaObj = targetMsg?.media || media;
      if (!mediaObj) return null;

      let mimeType = 'application/octet-stream';
      const cls = mediaObj.className || mediaObj._ || '';
      const isPhoto = cls.includes('Photo');
      const isDocument = cls.includes('Document');

      let downloadParams: any = {};

      if (isPhoto) {
        mimeType = 'image/jpeg';
        const photoObj = mediaObj.photo || (cls.includes('Photo') ? mediaObj : null);
        if (photoObj && Array.isArray(photoObj.sizes) && !options?.fullRes) {
          const availableTypes = photoObj.sizes
            .map((s: any) => s.type)
            .filter((t: any) => typeof t === 'string');
          if (availableTypes.includes('x')) {
            downloadParams.thumb = 'x';
          } else if (availableTypes.includes('m')) {
            downloadParams.thumb = 'm';
          } else if (availableTypes.includes('s')) {
            downloadParams.thumb = 's';
          }
        }
      } else if (isDocument) {
        mimeType = mediaObj.document?.mimeType || 'application/octet-stream';
        const isVideo = mimeType.startsWith('video/') || (mediaObj.document?.attributes || []).some((a: any) =>
          a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo' ||
          a._ === 'documentAttributeAnimated' || a.className === 'DocumentAttributeAnimated'
        );

        const isStickerDoc = (mediaObj.document?.attributes || []).some((a: any) =>
          a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker'
        ) || mimeType === 'image/webp' || mimeType === 'application/x-tgsticker';

        if (isVideo) {
          mimeType = mimeType.startsWith('video/') ? mimeType : 'video/mp4';
          // If downloading thumbnail for video, use a valid thumbnail type - NEVER thumb = -1!
          if (!options?.fullVideo) {
            const normalThumbs = (mediaObj.document?.thumbs || []).filter((t: any) =>
              t._ === 'photoSize' || t.className === 'PhotoSize' ||
              t._ === 'photoSizeProgressive' || t.className === 'PhotoSizeProgressive'
            );
            if (normalThumbs.length > 0) {
              const best = normalThumbs[normalThumbs.length - 1];
              downloadParams.thumb = best.type || (normalThumbs.length - 1);
              mimeType = 'image/jpeg';
            } else if (mediaObj.document?.videoThumbs && mediaObj.document.videoThumbs.length > 0) {
              downloadParams.thumb = mediaObj.document.videoThumbs[0].type;
              mimeType = 'image/jpeg';
            } else {
              return null; // Don't download full video when thumbnail requested
            }
          }
        } else if (isStickerDoc) {
          if (mimeType === 'application/x-tgsticker' || !options?.fullRes) {
            const normalThumbs = (mediaObj.document?.thumbs || []).filter((t: any) =>
              t._ === 'photoSize' || t.className === 'PhotoSize'
            );
            if (normalThumbs.length > 0) {
              const best = normalThumbs[normalThumbs.length - 1];
              downloadParams.thumb = best.type || (normalThumbs.length - 1);
              mimeType = 'image/jpeg';
            }
          }
        }
      }

      // If downloading full video/large file, stream chunks into in-memory Blob URL or native Android cache
      if (options?.fullVideo) {
        const chunks: Uint8Array[] = [];
        let totalDownloaded = 0;
        let isFirstChunk = true;
        const bridge = typeof window !== 'undefined' ? (window as any).TeleForgeBridge : null;

        // 1. Check if Android bridge already has this media completely downloaded on local disk (0ms instant playback)
        if (bridge?.hasLocalMedia?.(mediaKey)) {
          const localUrl = bridge.getLocalMediaUrl(mediaKey);
          if (localUrl) {
            options?.onStreamReady?.(localUrl);
            return { dataUrl: localUrl, mimeType: 'video/mp4', size: 1000000 };
          }
        }

        const totalDocSize = mediaObj.document?.size
          ? (typeof mediaObj.document.size.toJSNumber === 'function' ? mediaObj.document.size.toJSNumber() : Number(mediaObj.document.size))
          : 0;

        const customWriter = {
          write: (chunk: any) => {
            if (chunk && chunk.length > 0) {
              const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
              totalDownloaded += u8.length;
              chunks.push(u8);

              if (bridge?.writeMediaChunk) {
                try {
                  const b64 = bytesToBase64(u8);
                  bridge.writeMediaChunk(mediaKey, b64, !isFirstChunk);
                  if (isFirstChunk) {
                    isFirstChunk = false;
                    const streamUrl = totalDocSize > 0
                      ? `${bridge.getLocalMediaUrl(mediaKey)}&size=${totalDocSize}`
                      : bridge.getLocalMediaUrl(mediaKey);
                    options?.onStreamReady?.(streamUrl);
                  }
                } catch (bErr) {}
              }
            }
          },
          close: () => {},
        };

        downloadParams.outputFile = customWriter;
        if (options?.onProgress) {
          downloadParams.progressCallback = (downloaded: any, total: any) => {
            try {
              const dl = typeof downloaded?.toJSNumber === 'function' ? downloaded.toJSNumber() : Number(downloaded);
              const tot = typeof total?.toJSNumber === 'function' ? total.toJSNumber() : Number(total);
              const pct = tot > 0 ? Math.min(100, Math.round((dl / tot) * 100)) : 0;
              options.onProgress?.(pct, dl, tot);
            } catch (pErr) {}
          };
        }

        try {
          if (targetMsg && !targetMsg.inputChat) {
            targetMsg.inputChat = await resolveInputPeer(client, chatId);
          }
          await client.downloadMedia(targetMsg || mediaObj, downloadParams);
        } catch (dlErr: any) {
          console.warn('[MTProto-Direct] fullVideo download error:', dlErr?.message || dlErr);
        }

        if (bridge?.hasLocalMedia?.(mediaKey)) {
          const finalLocalUrl = bridge.getLocalMediaUrl(mediaKey);
          return { dataUrl: finalLocalUrl, mimeType: 'video/mp4', size: totalDownloaded };
        }

        if (totalDownloaded === 0 || chunks.length === 0) {
          return null;
        }

        const actualMime = mimeType && mimeType.startsWith('video/') ? mimeType : 'video/mp4';
        const blob = new Blob(chunks as any[], { type: actualMime });
        const blobUrl = URL.createObjectURL(blob);
        options?.onProgress?.(100, totalDownloaded, totalDownloaded);
        return { dataUrl: blobUrl, mimeType: actualMime, blob, size: totalDownloaded };
      }

      // Normal thumbnail / image download with fallback retry if thumb returns empty
      let buffer: any = null;
      try {
        buffer = await client.downloadMedia(targetMsg || mediaObj, downloadParams);
      } catch (e: any) {
        console.warn('[MTProto-Direct] initial downloadMedia failed:', e?.message || e);
      }

      if ((!buffer || buffer.length === 0) && downloadParams.thumb !== undefined && !isDocument) {
        try {
          const fallbackParams = { ...downloadParams };
          delete fallbackParams.thumb;
          buffer = await client.downloadMedia(targetMsg || mediaObj, fallbackParams);
        } catch (e: any) {
          console.warn('[MTProto-Direct] fallback downloadMedia failed:', e?.message || e);
        }
      }

      // If network download returned empty or threw, fallback to embedded thumbnail
      if (!buffer || buffer.length === 0) {
        const photo = mediaObj.photo || (cls.includes('Photo') ? mediaObj : null);
        if (photo) {
          let strippedBytes = photo.strippedThumb;
          if (!strippedBytes && Array.isArray(photo.sizes)) {
            const strippedObj = photo.sizes.find((s: any) =>
              s._ === 'photoStrippedSize' || s.className === 'PhotoStrippedSize' || s.bytes
            );
            if (strippedObj?.bytes) strippedBytes = strippedObj.bytes;
          }
          if (strippedBytes) {
            try {
              const thumbBuf = strippedPhotoToJpg(strippedBytes);
              if (thumbBuf && thumbBuf.length > 0) {
                buffer = thumbBuf;
              }
            } catch (e) {}
          }
          if ((!buffer || buffer.length === 0) && Array.isArray(photo.sizes)) {
            const cachedObj = photo.sizes.find((s: any) =>
              s._ === 'photoCachedSize' || s.className === 'PhotoCachedSize'
            );
            if (cachedObj?.bytes) {
              buffer = cachedObj.bytes;
            }
          }
        } else if (mediaObj.document?.thumbs) {
          const stripped = mediaObj.document.thumbs.find((t: any) =>
            t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
          );
          if (stripped?.bytes) {
            try {
              const thumbBuf = strippedPhotoToJpg(stripped.bytes);
              if (thumbBuf && thumbBuf.length > 0) {
                buffer = thumbBuf;
              }
            } catch (e) {}
          }
        }
      }

      if (!buffer || buffer.length === 0) return null;

      let dataUrl: string;
      if (typeof Buffer !== 'undefined') {
        dataUrl = `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
      } else {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
      }

      return { dataUrl, mimeType, size: buffer.length };
    } catch (err: any) {
      console.warn('[MTProto-Direct] downloadMessageMedia error:', err?.message || err);
      return null;
    }
  },

  async getPrivacy(keyType: 'lastSeen' | 'phoneNumber'): Promise<'everybody' | 'contacts' | 'nobody'> {
    try {
      const client = await getDirectClient();
      const key = keyType === 'lastSeen'
        ? new Api.InputPrivacyKeyStatusTimestamp()
        : new Api.InputPrivacyKeyPhoneNumber();

      const res: any = await client.invoke(new Api.account.GetPrivacy({ key }));
      const rules = res?.rules || [];
      for (const rule of rules) {
        const name = rule?.className || rule?._ || '';
        if (name.includes('AllowAll')) return 'everybody';
        if (name.includes('AllowContacts')) return 'contacts';
        if (name.includes('DisallowAll')) return 'nobody';
      }
      return keyType === 'lastSeen' ? 'everybody' : 'contacts';
    } catch (err: any) {
      console.warn('[MTProto-Direct] getPrivacy error:', err?.message || err);
      return keyType === 'lastSeen' ? 'everybody' : 'contacts';
    }
  },

  async setPrivacy(keyType: 'lastSeen' | 'phoneNumber', rule: 'everybody' | 'contacts' | 'nobody'): Promise<{ success: boolean }> {
    try {
      const client = await getDirectClient();
      const key = keyType === 'lastSeen'
        ? new Api.InputPrivacyKeyStatusTimestamp()
        : new Api.InputPrivacyKeyPhoneNumber();

      let inputRule: any;
      if (rule === 'everybody') {
        inputRule = new Api.InputPrivacyValueAllowAll();
      } else if (rule === 'contacts') {
        inputRule = new Api.InputPrivacyValueAllowContacts();
      } else {
        inputRule = new Api.InputPrivacyValueDisallowAll();
      }

      await client.invoke(new Api.account.SetPrivacy({ key, rules: [inputRule] }));
      return { success: true };
    } catch (err: any) {
      console.error('[MTProto-Direct] setPrivacy error:', err?.message || err);
      throw new Error(err?.message || 'Failed to update privacy settings');
    }
  },

  async getAuthorizations(): Promise<TelegramSessionInfo[]> {
    try {
      const client = await getDirectClient();
      const res: any = await client.invoke(new Api.account.GetAuthorizations());
      const rawList = res?.authorizations || [];
      const mapped: TelegramSessionInfo[] = rawList.map((auth: any) => ({
        hash: auth.hash ? auth.hash.toString() : '',
        deviceModel: auth.deviceModel || 'Unknown Device',
        platform: auth.platform || '',
        systemVersion: auth.systemVersion || '',
        appName: auth.appName || 'TeleForge Client',
        appVersion: auth.appVersion || '1.0.0',
        dateActive: Number(auth.dateActive || 0),
        dateCreated: Number(auth.dateCreated || 0),
        ip: auth.ip || '',
        country: auth.country || '',
        region: auth.region || '',
        current: Boolean(auth.current),
        officialApp: Boolean(auth.officialApp),
      }));
      return mapped;
    } catch (err: any) {
      console.error('[MTProto-Direct] getAuthorizations error:', err?.message || err);
      return [];
    }
  },

  async terminateSession(hash: string): Promise<{ success: boolean }> {
    try {
      const client = await getDirectClient();
      await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) as any }));
      return { success: true };
    } catch (err: any) {
      console.error('[MTProto-Direct] terminateSession error:', err?.message || err);
      throw new Error(err?.message || 'Failed to terminate session');
    }
  },

  async terminateAllOtherSessions(): Promise<{ success: boolean }> {
    try {
      const client = await getDirectClient();
      await client.invoke(new Api.auth.ResetAuthorizations());
      return { success: true };
    } catch (err: any) {
      console.error('[MTProto-Direct] terminateAllOtherSessions error:', err?.message || err);
      throw new Error(err?.message || 'Failed to terminate other sessions');
    }
  },

  /**
   * Check if a Telegram public username is available
   */
  async checkUsername(rawUsername: string): Promise<{ available: boolean; error?: string }> {
    const username = rawUsername.replace(/^@+/, '').trim();
    if (!username) {
      return { available: false, error: 'Username cannot be empty' };
    }
    if (username.length < 5) {
      return { available: false, error: 'Username must have at least 5 characters' };
    }
    if (username.length > 32) {
      return { available: false, error: 'Username cannot exceed 32 characters' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { available: false, error: 'Username can only contain a-z, 0-9, and underscores' };
    }
    if (/^[0-9]/.test(username)) {
      return { available: false, error: 'Username cannot start with a number' };
    }

    try {
      const client = await getDirectClient();
      try {
        const res = await client.invoke(
          new Api.channels.CheckUsername({
            channel: new Api.InputChannelEmpty(),
            username,
          })
        );
        return { available: Boolean(res) };
      } catch (channelErr: any) {
        const msg = channelErr?.errorMessage || channelErr?.message || '';
        if (msg.includes('USERNAME_OCCUPIED')) {
          return { available: false, error: 'Username is already taken' };
        }
        if (msg.includes('USERNAME_INVALID')) {
          return { available: false, error: 'Username is invalid' };
        }
        if (msg.includes('USERNAME_PURCHASE_AVAILABLE')) {
          return { available: false, error: 'Username is a Fragment collectible' };
        }
        // Fallback to account.CheckUsername
        const accRes = await client.invoke(
          new Api.account.CheckUsername({
            username,
          })
        );
        return { available: Boolean(accRes) };
      }
    } catch (err: any) {
      const msg = err?.errorMessage || err?.message || '';
      if (msg.includes('USERNAME_OCCUPIED')) {
        return { available: false, error: 'Username is already taken' };
      }
      if (msg.includes('USERNAME_INVALID')) {
        return { available: false, error: 'Username is invalid' };
      }
      if (msg.includes('FLOOD_WAIT')) {
        return { available: false, error: 'Too many requests, please wait a moment' };
      }
      return { available: false, error: msg || 'Could not verify username' };
    }
  },

  /**
   * Create a new Telegram Channel or Supergroup on Telegram Cloud
   */
  async createChannelOrGroup(params: {
    type: 'channel' | 'group';
    title: string;
    about?: string;
    isPublic: boolean;
    username?: string;
  }): Promise<TelegramDialog> {
    const client = await getDirectClient();
    const isChannel = params.type === 'channel';
    const title = params.title.trim();
    const about = (params.about || '').trim();

    if (!title) {
      throw new Error('Title is required');
    }

    // 1. Invoke channels.CreateChannel
    const updates: any = await client.invoke(
      new Api.channels.CreateChannel({
        broadcast: isChannel,
        megagroup: !isChannel,
        title,
        about,
      })
    );

    const createdChat = updates?.chats?.[0];
    if (!createdChat) {
      throw new Error('Failed to create conversation on Telegram servers');
    }

    const channelId = createdChat.id.toString();
    const accessHash = createdChat.accessHash;
    peerEntityCache.set(channelId, createdChat);
    peerEntityCache.set(`-100${channelId}`, createdChat);

    let cleanUsername = '';
    // 2. If public and username provided, assign the public username
    if (params.isPublic && params.username) {
      cleanUsername = params.username.replace(/^@+/, '').trim();
      if (cleanUsername) {
        try {
          await client.invoke(
            new Api.channels.UpdateUsername({
              channel: new Api.InputChannel({
                channelId: createdChat.id,
                accessHash: accessHash,
              }),
              username: cleanUsername,
            })
          );
        } catch (uErr: any) {
          console.warn('[MTProto-Direct] UpdateUsername error:', uErr?.message || uErr);
          const uMsg = uErr?.errorMessage || uErr?.message || '';
          if (uMsg.includes('USERNAME_OCCUPIED')) {
            throw new Error(`Username @${cleanUsername} is already taken.`);
          }
          if (uMsg.includes('CHANNELS_ADMIN_PUBLIC_TOO_MUCH')) {
            throw new Error('You have reached the maximum number of public channels or groups. Revoke an existing public link first.');
          }
          if (uMsg.includes('USERNAME_INVALID')) {
            throw new Error(`Username @${cleanUsername} is invalid.`);
          }
          throw new Error(uErr?.errorMessage || uErr?.message || 'Failed to assign public username.');
        }
      }
    }

    const fullPeerId = `-100${channelId}`;
    const dialog: TelegramDialog = {
      id: fullPeerId,
      title,
      isUser: false,
      isGroup: !isChannel,
      isChannel,
      isVerified: false,
      unreadCount: 0,
      unreadMentionsCount: 0,
      pinned: false,
      isJoined: true,
      memberCount: 1,
      date: Date.now(),
      username: cleanUsername || undefined,
      lastMessage: {
        text: isChannel ? `Channel "${title}" created.` : `Group "${title}" created.`,
        date: Date.now(),
        out: true,
      },
    };

    return dialog;
  },

  /**
   * Fetch online GIFs from Telegram's native MTProto @gif bot with infinite scroll
   */
  async getOnlineGifs(query = '', offset = ''): Promise<{ results: OnlineGifItem[]; nextOffset: string }> {
    const client = await getDirectClient();
    try {
      let bot: any = peerEntityCache.get('gif_bot');
      if (!bot) {
        bot = await client.getInputEntity('gif');
        peerEntityCache.set('gif_bot', bot);
      }
      // Use InputPeerSelf directly (never fails or delays)
      const peer = new Api.InputPeerSelf();

      // Ensure query is never empty for @gif, since @gif requires a query keyword (e.g. 'trending') to paginate properly
      const q = query.trim() || 'trending';

      const res: any = await withTimeout(
        client.invoke(
          new Api.messages.GetInlineBotResults({
            bot,
            peer,
            query: q,
            offset: offset || '',
          })
        ),
        10000,
        'Inline bot results timeout'
      );

      const queryIdStr = res?.queryId ? res.queryId.toString() : '';
      const nextOffsetStr = res?.nextOffset || '';
      const results: OnlineGifItem[] = [];

      for (const item of (res?.results || [])) {
        if (!item) continue;
        let thumbUrl = '';
        let gifUrl = '';
        let width: number | undefined;
        let height: number | undefined;

        // 1. Prioritize direct high-resolution web URLs (Tenor / Giphy via BotInlineResult)
        if (item.content?.url && typeof item.content.url === 'string') {
          gifUrl = item.content.url;
        }
        if (item.thumb?.url && typeof item.thumb.url === 'string') {
          thumbUrl = item.thumb.url;
        }

        // Direct media URL fallback
        if (item.url && typeof item.url === 'string' && item.url.startsWith('http')) {
          const isDirectMedia = /\.(gif|mp4|webm|webp|png|jpg|jpeg)($|\?)/i.test(item.url) ||
            item.url.includes('/media.') || item.url.includes('/c.tenor.com');
          if (isDirectMedia) {
            if (!gifUrl) gifUrl = item.url;
            if (!thumbUrl) thumbUrl = item.url;
          }
        }

        // Upgrade Tenor nanogif/tinymp4 to crisp high-res versions
        if (thumbUrl && thumbUrl.includes('tenor.com')) {
          if (thumbUrl.includes('/nanogif.gif')) {
            thumbUrl = thumbUrl.replace('/nanogif.gif', '/tinygif.gif');
          } else if (thumbUrl.includes('/nanomp4.mp4')) {
            thumbUrl = thumbUrl.replace('/nanomp4.mp4', '/tinymp4.mp4');
          }
        }
        if (gifUrl && gifUrl.includes('tenor.com')) {
          if (gifUrl.includes('/nanogif.gif')) {
            gifUrl = gifUrl.replace('/nanogif.gif', '/mediumgif.gif');
          } else if (gifUrl.includes('/nanomp4.mp4')) {
            gifUrl = gifUrl.replace('/nanomp4.mp4', '/mediummp4.mp4');
          }
        }

        // 2. Telegram MTProto Document / Photo (BotInlineMediaResult)
        const doc = item.document;
        if (doc) {
          const videoAttr = (doc.attributes || []).find(
            (a: any) => a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo'
          );
          if (videoAttr) {
            width = videoAttr.w;
            height = videoAttr.h;
          }

          // Stripped photo used as immediate smooth placeholder if no web URL
          const stripped = (doc.thumbs || []).find(
            (t: any) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
          );
          if (stripped?.bytes && !thumbUrl) {
            try {
              const jpgBuf = strippedPhotoToJpg(stripped.bytes);
              if (jpgBuf && jpgBuf.length > 0) {
                thumbUrl = `data:image/jpeg;base64,${Buffer.from(jpgBuf).toString('base64')}`;
              }
            } catch (e) {}
          }
        }

        const photo = item.photo;
        if (!thumbUrl && photo) {
          const stripped = (photo.sizes || []).find(
            (s: any) => s._ === 'photoStrippedSize' || s.className === 'PhotoStrippedSize'
          );
          if (stripped?.bytes) {
            try {
              const jpgBuf = strippedPhotoToJpg(stripped.bytes);
              if (jpgBuf && jpgBuf.length > 0) {
                thumbUrl = `data:image/jpeg;base64,${Buffer.from(jpgBuf).toString('base64')}`;
              }
            } catch (e) {}
          }
        }

        // Final fallback
        if (!thumbUrl) {
          if (item.thumb?.url) {
            thumbUrl = item.thumb.url;
          } else if (item.url && item.url.startsWith('http')) {
            thumbUrl = item.url;
          }
        }

        results.push({
          id: item.id || `gif-${Date.now()}-${Math.random()}`,
          url: gifUrl || thumbUrl,
          thumbUrl: thumbUrl || gifUrl || '',
          title: item.title || item.description || q || 'GIF',
          width,
          height,
          queryId: queryIdStr,
          rawItem: item,
        });
      }

      return { results, nextOffset: nextOffsetStr };
    } catch (e: any) {
      console.warn('[MTProto] getOnlineGifs error:', e?.message || e);
      return { results: [], nextOffset: '' };
    }
  },

  /**
   * Download a high-res thumbnail for a document (GIF) via MTProto
   */
  async downloadDocumentThumb(doc: any): Promise<string | null> {
    if (!doc) return null;
    const docId = doc.id ? doc.id.toString() : '';
    if (docId && gifThumbCache.has(docId)) {
      return gifThumbCache.get(docId)!;
    }
    const client = await getDirectClient();
    try {
      const normalThumbs = (doc.thumbs || []).filter((t: any) =>
        t._ === 'photoSize' || t.className === 'PhotoSize' ||
        t._ === 'photoSizeProgressive' || t.className === 'PhotoSizeProgressive'
      );
      if (normalThumbs.length === 0) {
        const cached = (doc.thumbs || []).find((t: any) => t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize');
        if (cached?.bytes) {
          const dataUrl = `data:image/jpeg;base64,${bytesToBase64(cached.bytes)}`;
          if (docId) gifThumbCache.set(docId, dataUrl);
          return dataUrl;
        }
        return null;
      }
      const best = normalThumbs[normalThumbs.length - 1];
      const fileRefBuf = Buffer.isBuffer(doc.fileReference)
        ? doc.fileReference
        : (typeof doc.fileReference === 'string' ? Buffer.from(doc.fileReference, 'hex') : Buffer.alloc(0));

      const inputLoc = new Api.InputDocumentFileLocation({
        id: bigInt(doc.id.toString()) as any,
        accessHash: bigInt(doc.accessHash.toString()) as any,
        fileReference: fileRefBuf,
        thumbSize: best.type || 'm',
      });

      const buffer: any = await withTimeout(
        client.downloadFile(inputLoc, {
          dcId: doc.dcId,
          partSizeKb: 64,
          fileSize: best.size ? bigInt(best.size) as any : undefined,
        }),
        8000,
        'Thumb download timeout'
      );
      if (buffer && buffer.length > 0) {
        const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const mime = isWebp ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${bytesToBase64(buffer)}`;
        if (docId) gifThumbCache.set(docId, dataUrl);
        return dataUrl;
      }
      return null;
    } catch (e: any) {
      console.warn('[MTProto] downloadMediaThumb error:', e?.message || e);
      return null;
    }
  },

  /**
   * Download a thumbnail for a sticker via MTProto InputDocumentFileLocation
   */
  async downloadStickerThumb(docOrSticker: any): Promise<string | null> {
    if (!docOrSticker) return null;
    const doc = docOrSticker.rawDoc || docOrSticker;
    const docId = doc.id ? doc.id.toString() : (docOrSticker.documentId ? docOrSticker.documentId.toString() : '');
    if (docId && stickerThumbCache.has(docId)) {
      return stickerThumbCache.get(docId)!;
    }

    // 1. Check embedded PhotoCachedSize
    if (doc.thumbs) {
      const cached = (doc.thumbs || []).find(
        (t: any) => t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize'
      );
      if (cached?.bytes && cached.bytes.length > 0) {
        const isWebp = cached.bytes[0] === 0x52 && cached.bytes[1] === 0x49 && cached.bytes[2] === 0x46 && cached.bytes[3] === 0x46;
        const mime = isWebp ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${bytesToBase64(cached.bytes)}`;
        if (docId) stickerThumbCache.set(docId, dataUrl);
        return dataUrl;
      }

      // Check PhotoStrippedSize
      const stripped = (doc.thumbs || []).find(
        (t: any) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
      );
      if (stripped?.bytes) {
        try {
          const jpgBuf = strippedPhotoToJpg(stripped.bytes);
          if (jpgBuf && jpgBuf.length > 0) {
            const dataUrl = `data:image/jpeg;base64,${bytesToBase64(jpgBuf)}`;
            if (docId) stickerThumbCache.set(docId, dataUrl);
            return dataUrl;
          }
        } catch (e) {}
      }
    }

    const id = doc.id || docOrSticker.documentId;
    const accessHash = doc.accessHash || docOrSticker.accessHash;
    const fileReference = doc.fileReference || docOrSticker.fileReference;
    if (!id || !accessHash) return null;

    try {
      const client = await getDirectClient();
      const normalThumbs = (doc.thumbs || []).filter((t: any) =>
        t._ === 'photoSize' || t.className === 'PhotoSize' ||
        t._ === 'photoSizeProgressive' || t.className === 'PhotoSizeProgressive'
      );
      const thumbType = normalThumbs.length > 0 ? (normalThumbs[0].type || 'm') : (doc.mimeType === 'image/webp' ? '' : 'm');

      const fileRefBuf = Buffer.isBuffer(fileReference)
        ? fileReference
        : (typeof fileReference === 'string' ? Buffer.from(fileReference, 'hex') : Buffer.alloc(0));

      const inputLoc = new Api.InputDocumentFileLocation({
        id: bigInt(id.toString()) as any,
        accessHash: bigInt(accessHash.toString()) as any,
        fileReference: fileRefBuf,
        thumbSize: thumbType,
      });

      const buffer: any = await withTimeout(
        client.downloadFile(inputLoc, {
          dcId: doc.dcId,
          partSizeKb: 64,
          fileSize: normalThumbs[0]?.size ? bigInt(normalThumbs[0].size) as any : undefined,
        }),
        8000,
        'Sticker thumb download timeout'
      );

      if (buffer && buffer.length > 0) {
        const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
        const mime = isWebp ? 'image/webp' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${bytesToBase64(buffer)}`;
        if (docId) stickerThumbCache.set(docId, dataUrl);
        return dataUrl;
      }
      return null;
    } catch (e: any) {
      console.warn('[MTProto] downloadStickerThumb error:', e?.message || e);
      return null;
    }
  },

  /**
   * Download a full document (e.g. GIF MP4) into an in-memory blob URL for instant video playback
   */
  async downloadDocumentBlob(doc: any): Promise<string | null> {
    if (!doc) return null;
    const docId = doc.id ? doc.id.toString() : '';
    if (docId && gifBlobCache.has(docId)) {
      return gifBlobCache.get(docId)!;
    }
    const client = await getDirectClient();
    try {
      const fileRefBuf = Buffer.isBuffer(doc.fileReference)
        ? doc.fileReference
        : (typeof doc.fileReference === 'string' ? Buffer.from(doc.fileReference, 'hex') : Buffer.alloc(0));

      const inputLoc = new Api.InputDocumentFileLocation({
        id: bigInt(doc.id.toString()) as any,
        accessHash: bigInt(doc.accessHash.toString()) as any,
        fileReference: fileRefBuf,
        thumbSize: '',
      });

      const buffer: any = await withTimeout(
        client.downloadFile(inputLoc, {
          dcId: doc.dcId,
          partSizeKb: 128,
          fileSize: doc.size ? bigInt(doc.size) as any : undefined,
        }),
        15000,
        'GIF video download timeout'
      );

      if (buffer && buffer.length > 0) {
        const mime = doc.mimeType || 'video/mp4';
        const blob = new Blob([buffer], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        if (docId) gifBlobCache.set(docId, blobUrl);
        return blobUrl;
      }
      return null;
    } catch (e: any) {
      console.warn('[MTProto] downloadDocumentBlob error:', e?.message || e);
      return null;
    }
  },

  /**
   * Send an inline bot result (such as a GIF from @gif) directly into a chat
   */
  async sendInlineBotResult(
    chatId: string,
    queryId: string,
    resultId: string,
    replyToMsgId?: number
  ): Promise<{ success: boolean; messageId?: number }> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId);
    if (!targetPeer) {
      targetPeer = await client.getInputEntity(chatId);
    }

    const qId = bigInt(queryId);
    const randId = bigInt.randBetween(bigInt(1), bigInt(9223372036854775807));

    const res: any = await client.invoke(
      new Api.messages.SendInlineBotResult({
        peer: targetPeer,
        queryId: qId,
        id: resultId,
        randomId: randId,
        replyTo: replyToMsgId ? new Api.InputReplyToMessage({ replyToMsgId }) : undefined,
      })
    );

    let sentId: number | undefined;
    if (res?.updates) {
      const msgUpdate = res.updates.find((u: any) => u.message?.id);
      if (msgUpdate?.message?.id) sentId = msgUpdate.message.id;
    }

    return { success: true, messageId: sentId };
  },

  /**
   * Get all installed Telegram sticker sets for the current user
   */
  async getInstalledStickerSets(): Promise<TelegramStickerSet[]> {
    const client = await getDirectClient();
    try {
      const isAuth = await client.isUserAuthorized();
      if (!isAuth) return [];

      const res: any = await client.invoke(new Api.messages.GetAllStickers({ hash: bigInt(0) as any }));
      const sets = res?.sets || [];
      const result: TelegramStickerSet[] = [];

      for (const s of sets) {
        if (!s || s.archived) continue;
        let thumbUrl = '';
        if (s.thumbs) {
          const stripped = (s.thumbs || []).find(
            (t: any) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
          );
          if (stripped?.bytes) {
            try {
              const jpgBuf = strippedPhotoToJpg(stripped.bytes);
              if (jpgBuf) {
                thumbUrl = `data:image/jpeg;base64,${bytesToBase64(jpgBuf)}`;
              }
            } catch (e) {}
          }
        }

        result.push({
          id: s.id ? s.id.toString() : '',
          accessHash: s.accessHash ? s.accessHash.toString() : '',
          title: s.title || 'Sticker Set',
          shortName: s.shortName || '',
          count: s.count || 0,
          thumbUrl,
        });
      }

      return result;
    } catch (e: any) {
      console.warn('[MTProto] getInstalledStickerSets error:', e?.message || e);
      return [];
    }
  },

  /**
   * Fetch full stickers list for a sticker set
   */
  async getStickerSet(stickerset: {
    id?: string;
    accessHash?: string;
    shortName?: string;
  }): Promise<TelegramStickerSet | null> {
    const client = await getDirectClient();
    try {
      let inputSet: any;
      if (stickerset.id && stickerset.accessHash) {
        inputSet = new Api.InputStickerSetID({
          id: bigInt(stickerset.id) as any,
          accessHash: bigInt(stickerset.accessHash) as any,
        });
      } else if (stickerset.shortName) {
        inputSet = new Api.InputStickerSetShortName({
          shortName: stickerset.shortName,
        });
      } else {
        return null;
      }

      const res: any = await client.invoke(
        new Api.messages.GetStickerSet({
          stickerset: inputSet,
          hash: 0,
        })
      );

      const s = res?.set;
      if (!s) return null;

      const stickers: TelegramStickerItem[] = [];
      const docs = res.documents || [];
      const packs = res.packs || [];

      // Build emoji lookup map
      const emojiMap = new Map<string, string>();
      for (const pack of packs) {
        const emoji = pack.emoticon;
        for (const docId of pack.documents || []) {
          emojiMap.set(docId.toString(), emoji);
        }
      }

      for (const doc of docs) {
        if (!doc) continue;
        const dId = doc.id ? doc.id.toString() : '';
        const aHash = doc.accessHash ? doc.accessHash.toString() : '';
        const fileRef = doc.fileReference ? Buffer.from(doc.fileReference).toString('hex') : undefined;
        let thumbUrl = '';

        if (dId && stickerThumbCache.has(dId)) {
          thumbUrl = stickerThumbCache.get(dId)!;
        }

        if (!thumbUrl && doc.thumbs) {
          const cached = (doc.thumbs || []).find(
            (t: any) => t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize'
          );
          if (cached?.bytes && cached.bytes.length > 0) {
            const isWebp = cached.bytes[0] === 0x52 && cached.bytes[1] === 0x49 && cached.bytes[2] === 0x46 && cached.bytes[3] === 0x46;
            const mime = isWebp ? 'image/webp' : 'image/jpeg';
            thumbUrl = `data:${mime};base64,${bytesToBase64(cached.bytes)}`;
            if (dId) stickerThumbCache.set(dId, thumbUrl);
          }
        }

        if (!thumbUrl && doc.thumbs) {
          const stripped = (doc.thumbs || []).find(
            (t: any) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
          );
          if (stripped?.bytes) {
            try {
              const jpgBuf = strippedPhotoToJpg(stripped.bytes);
              if (jpgBuf && jpgBuf.length > 0) {
                thumbUrl = `data:image/jpeg;base64,${bytesToBase64(jpgBuf)}`;
                if (dId) stickerThumbCache.set(dId, thumbUrl);
              }
            } catch (e) {}
          }
        }

        if (!thumbUrl && dId && !isAndroidApp()) {
          thumbUrl = resolveApiUrl(`/api/telegram/document?id=${dId}&thumb=m`);
        }

        stickers.push({
          id: dId,
          documentId: dId,
          accessHash: aHash,
          fileReference: fileRef,
          emoji: emojiMap.get(dId),
          thumbUrl,
          url: thumbUrl || (!isAndroidApp() ? resolveApiUrl(`/api/telegram/document?id=${dId}&thumb=m`) : ''),
          rawDoc: doc,
        });
      }

      return {
        id: s.id ? s.id.toString() : '',
        accessHash: s.accessHash ? s.accessHash.toString() : '',
        title: s.title || 'Sticker Set',
        shortName: s.shortName || '',
        count: stickers.length,
        stickers,
      };
    } catch (e: any) {
      console.warn('[MTProto] getStickerSet error:', e?.message || e);
      return null;
    }
  },

  /**
   * Install a sticker set to the user's Telegram cloud
   */
  async installStickerSet(stickerset: {
    id?: string;
    accessHash?: string;
    shortName?: string;
  }): Promise<boolean> {
    const client = await getDirectClient();
    try {
      let inputSet: any;
      if (stickerset.id && stickerset.accessHash) {
        inputSet = new Api.InputStickerSetID({
          id: bigInt(stickerset.id) as any,
          accessHash: bigInt(stickerset.accessHash) as any,
        });
      } else if (stickerset.shortName) {
        inputSet = new Api.InputStickerSetShortName({
          shortName: stickerset.shortName,
        });
      } else {
        return false;
      }

      await client.invoke(
        new Api.messages.InstallStickerSet({
          stickerset: inputSet,
          archived: false,
        })
      );
      return true;
    } catch (e: any) {
      console.warn('[MTProto] installStickerSet error:', e?.message || e);
      return false;
    }
  },

  /**
   * Save a sticker to user's Telegram favorite stickers
   */
  async faveSticker(documentId: string, accessHash: string, fileReference?: string): Promise<boolean> {
    const client = await getDirectClient();
    try {
      const inputDoc = new Api.InputDocument({
        id: bigInt(documentId) as any,
        accessHash: bigInt(accessHash) as any,
        fileReference: fileReference ? Buffer.from(fileReference, 'hex') : Buffer.alloc(0),
      });

      await client.invoke(
        new Api.messages.FaveSticker({
          id: inputDoc,
          unfave: false,
        })
      );
      return true;
    } catch (e: any) {
      console.warn('[MTProto] faveSticker error:', e?.message || e);
      return false;
    }
  },

  /**
   * Send a sticker document natively to a chat
   */
  async sendStickerDocument(chatId: string, docOrInput: any, replyToMsgId?: number): Promise<TelegramMessage> {
    const client = await getDirectClient();
    let targetPeer = peerEntityCache.get(chatId);
    if (!targetPeer) {
      targetPeer = await client.getInputEntity(chatId);
    }

    let fileToSend = docOrInput;
    if (docOrInput && typeof docOrInput === 'object' && docOrInput.documentId && docOrInput.accessHash) {
      fileToSend = new Api.InputDocument({
        id: bigInt(docOrInput.documentId) as any,
        accessHash: bigInt(docOrInput.accessHash) as any,
        fileReference: docOrInput.fileReference ? Buffer.from(docOrInput.fileReference, 'hex') : Buffer.alloc(0),
      });
    }

    const sendParams: any = { file: fileToSend };
    if (replyToMsgId) {
      sendParams.replyTo = parseInt(String(replyToMsgId), 10);
    }

    const result: any = await client.sendMessage(targetPeer, sendParams);
    return {
      id: result.id,
      text: '',
      date: result.date ? result.date * 1000 : Date.now(),
      out: true,
      mediaType: 'sticker',
      isSticker: true,
    };
  },

  /**
   * Send callback query to Telegram bot when an inline button is clicked
   */
  async sendBotCallbackAnswer(
    chatId: string,
    messageId: number,
    data?: string,
    game = false
  ): Promise<{ message?: string; alert?: boolean; url?: string }> {
    const client = await getDirectClient();

    const numMsgId = typeof messageId === 'number' ? messageId : parseInt(String(messageId), 10);
    if (!numMsgId || isNaN(numMsgId) || numMsgId <= 0) {
      return { message: 'Invalid message ID' };
    }

    let targetPeer: any = null;
    const idStr = String(chatId).trim();
    const variations = [idStr];
    if (idStr.startsWith('-100')) {
      variations.push(idStr.slice(4));
      variations.push(`-${idStr.slice(4)}`);
    } else if (idStr.startsWith('-')) {
      variations.push(idStr.slice(1));
      variations.push(`-100${idStr.slice(1)}`);
    } else {
      variations.push(`-100${idStr}`);
      variations.push(`-${idStr}`);
    }

    const isValidInputPeer = (p: any): boolean =>
      Boolean(p && (p._?.startsWith('input') || p.className?.startsWith('Input')) && !p.className?.includes('Empty'));

    for (const v of variations) {
      if (peerEntityCache.has(v)) {
        const ent = peerEntityCache.get(v);
        try {
          const ip = getInputPeer(ent);
          if (isValidInputPeer(ip)) {
            targetPeer = ip;
            break;
          }
        } catch (e) {}
      }
    }

    if (!targetPeer || typeof targetPeer === 'string' || !isValidInputPeer(targetPeer)) {
      for (const v of variations) {
        try {
          const ent = await client.getInputEntity(v);
          if (ent) {
            const ip = getInputPeer(ent);
            if (isValidInputPeer(ip)) {
              targetPeer = ip;
              break;
            }
          }
        } catch (e) {}
        try {
          const ent = await client.getInputEntity(bigInt(v) as any);
          if (ent) {
            const ip = getInputPeer(ent);
            if (isValidInputPeer(ip)) {
              targetPeer = ip;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!targetPeer || typeof targetPeer === 'string' || !isValidInputPeer(targetPeer)) {
      try {
        const ent = await (client as any).getEntity(chatId).catch(async () => await (client as any).getEntity(bigInt(chatId) as any)).catch(() => null);
        if (ent) {
          const ip = getInputPeer(ent);
          if (isValidInputPeer(ip)) {
            targetPeer = ip;
          }
        }
      } catch (e) {}
    }

    if (!targetPeer || typeof targetPeer === 'string' || !targetPeer.className?.startsWith('Input')) {
      try {
        if (idStr.startsWith('-100')) {
          targetPeer = new Api.InputPeerChannel({ channelId: bigInt(idStr.slice(4)) as any, accessHash: bigInt.zero as any });
        } else if (idStr.startsWith('-')) {
          targetPeer = new Api.InputPeerChat({ chatId: bigInt(idStr.slice(1)) as any });
        } else {
          targetPeer = new Api.InputPeerUser({ userId: bigInt(idStr) as any, accessHash: bigInt.zero as any });
        }
      } catch (e) {}
    }

    let rawData: Buffer | undefined = undefined;
    if (data !== undefined && data !== null && data !== '') {
      if (Buffer.isBuffer(data)) {
        rawData = data;
      } else if (typeof data === 'string') {
        try {
          const buf = Buffer.from(data, 'base64');
          if (buf.length > 0 && buf.toString('base64') === data) {
            rawData = buf;
          } else {
            rawData = Buffer.from(data, 'utf8');
          }
        } catch (e) {
          rawData = Buffer.from(data, 'utf8');
        }
      }
    } else {
      rawData = Buffer.alloc(0);
    }

    const req = new Api.messages.GetBotCallbackAnswer({
      peer: targetPeer,
      msgId: numMsgId,
      data: rawData,
      game,
    });

    try {
      const res: any = await client.invoke(req);
      return {
        message: res?.message || undefined,
        alert: Boolean(res?.alert),
        url: res?.url || undefined,
      };
    } catch (err: any) {
      if (err?.errorMessage === 'BOT_RESPONSE_TIMEOUT') {
        return { message: 'Bot did not respond in time.' };
      }
      if (err?.errorMessage === 'MESSAGE_ID_INVALID') {
        console.warn('[MTProto-Direct] Message ID is no longer valid or expired:', messageId);
        return { message: 'This button is no longer active or has expired.' };
      }
      console.warn('[MTProto-Direct] sendBotCallbackAnswer error:', err?.message || err);
      return { message: err?.message || 'Action failed' };
    }
  },

  /**
   * Add a bot to a group or channel, and optionally send a start parameter command
   */
  async addBotToChat(chatId: string, botUsernameOrId: string, startParam?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await getDirectClient();
      const cleanBot = botUsernameOrId.replace(/^@+/, '').trim();
      let botEntity = peerEntityCache.get(cleanBot) || peerEntityCache.get(botUsernameOrId);
      if (!botEntity) {
        try {
          botEntity = await client.getEntity(cleanBot);
        } catch {
          botEntity = await client.getEntity(botUsernameOrId);
        }
      }

      let chatEntity = peerEntityCache.get(chatId) || peerEntityCache.get(`-100${chatId}`) || peerEntityCache.get(`-${chatId}`);
      if (!chatEntity) {
        try {
          chatEntity = await client.getEntity(chatId);
        } catch {
          chatEntity = await client.getEntity(bigInt(chatId));
        }
      }

      if (chatEntity.className === 'Channel') {
        try {
          await client.invoke(
            new Api.channels.InviteToChannel({
              channel: chatEntity,
              users: [botEntity],
            })
          );
        } catch (inviteErr: any) {
          const errMsg = String(inviteErr?.message || '');
          if (
            errMsg.includes('USER_BOT_REQUIRED') ||
            errMsg.includes('CHAT_ADMIN_REQUIRED') ||
            errMsg.includes('BOT_METHOD_INVALID') ||
            (chatEntity as any).broadcast
          ) {
            const adminRights = new Api.ChatAdminRights({
              changeInfo: true,
              postMessages: true,
              editMessages: true,
              deleteMessages: true,
              banUsers: true,
              inviteUsers: true,
              pinMessages: true,
              addAdmins: false,
              anonymous: false,
              manageCall: true,
              other: true,
            });
            await client.invoke(
              new Api.channels.EditAdmin({
                channel: chatEntity,
                userId: botEntity,
                adminRights,
                rank: 'bot',
              })
            );
          } else {
            throw inviteErr;
          }
        }
      } else if (chatEntity.className === 'Chat') {
        await client.invoke(
          new Api.messages.AddChatUser({
            chatId: (chatEntity as any).id,
            userId: botEntity,
            fwdLimit: 100,
          })
        );
      } else {
        throw new Error('Target is not a group or channel');
      }

      if (startParam) {
        try {
          const botUname = (botEntity as any).username ? `@${(botEntity as any).username}` : '';
          const startCmd = `/start${botUname ? `${botUname} ` : ' '}${startParam}`.trim();
          await this.sendMessage(chatId, startCmd);
        } catch (msgErr: any) {
          console.warn('[addBotToChat] Failed to send /start msg:', msgErr.message);
        }
      }

      return { success: true };
    } catch (e: any) {
      console.error('[DirectClient] addBotToChat error:', e);
      return { success: false, error: e.message || 'Failed to add bot to chat' };
    }
  },

  /**
   * Mute or unmute notifications for a given chat or channel
   */
  async toggleChatMute(chatId: string, mute = true): Promise<{ success: boolean; isMuted: boolean }> {
    try {
      const client = await getDirectClient();
      let targetPeer: any = null;
      const idStr = String(chatId).trim();
      const variations = [idStr];
      if (idStr.startsWith('-100')) {
        variations.push(idStr.slice(4));
        variations.push(`-${idStr.slice(4)}`);
      } else if (idStr.startsWith('-')) {
        variations.push(idStr.slice(1));
        variations.push(`-100${idStr.slice(1)}`);
      } else {
        variations.push(`-100${idStr}`);
        variations.push(`-${idStr}`);
      }

      for (const v of variations) {
        if (peerEntityCache.has(v)) {
          const ent = peerEntityCache.get(v);
          try {
            const ip = getInputPeer(ent);
            if (ip && (ip as any).className?.startsWith('Input')) {
              targetPeer = ip;
              break;
            }
          } catch (e) {}
        }
      }

      if (!targetPeer || typeof targetPeer === 'string') {
        try {
          const ent = await client.getInputEntity(chatId);
          targetPeer = getInputPeer(ent);
        } catch (e) {
          try {
            const ent = await client.getInputEntity(bigInt(chatId) as any);
            targetPeer = getInputPeer(ent);
          } catch (e2) {}
        }
      }

      if (!targetPeer || typeof targetPeer === 'string') {
        if (idStr.startsWith('-100')) {
          targetPeer = new Api.InputPeerChannel({ channelId: bigInt(idStr.slice(4)) as any, accessHash: bigInt.zero as any });
        } else if (idStr.startsWith('-')) {
          targetPeer = new Api.InputPeerChat({ chatId: bigInt(idStr.slice(1)) as any });
        } else {
          targetPeer = new Api.InputPeerUser({ userId: bigInt(idStr) as any, accessHash: bigInt.zero as any });
        }
      }

      const req = new Api.account.UpdateNotifySettings({
        peer: new Api.InputNotifyPeer({ peer: targetPeer }),
        settings: new Api.InputPeerNotifySettings({
          muteUntil: mute ? 2147483647 : 0,
          silent: Boolean(mute),
        }),
      });

      await client.invoke(req);
      return { success: true, isMuted: Boolean(mute) };
    } catch (err: any) {
      console.warn('[DirectClient] toggleChatMute error:', err?.message || err);
      return { success: false, isMuted: Boolean(mute) };
    }
  },

  /**
   * Preview/check a chat invite link without joining.
   * Returns info about the chat so the user can decide whether to join.
   */
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
    try {
      const client = await getDirectClient();
      const raw = String(hashOrUsername || '').trim();
      if (!raw) return { success: false, error: 'Empty hash or username' };

      // Determine if it's an invite hash or a public username
      let inviteHash = '';
      if (raw.startsWith('+')) {
        inviteHash = raw.slice(1);
      } else if (raw.startsWith('joinchat/')) {
        inviteHash = raw.slice(9);
      } else if (raw.includes('t.me/+')) {
        inviteHash = raw.split('t.me/+')[1]?.split(/[?#/]/)[0] || '';
      } else if (raw.includes('t.me/joinchat/')) {
        inviteHash = raw.split('t.me/joinchat/')[1]?.split(/[?#/]/)[0] || '';
      } else if (!/^-?\d+$/.test(raw) && !raw.startsWith('@') && (raw.includes('-') || raw.includes('_') || raw.length >= 16)) {
        inviteHash = raw;
      }

      if (inviteHash) {
        const cleanHash = inviteHash.replace(/^(\+|joinchat\/)/, '').trim();
        try {
          const checkRes: any = await client.invoke(new Api.messages.CheckChatInvite({ hash: cleanHash }));
          // ChatInviteAlready — user already joined
          if (checkRes?.chat) {
            const ch = checkRes.chat;
            const idStr = ch.id?.toString();
            let photo = '';
            if (hasEntityPhoto(ch)) {
              try {
                const buf = await withTimeout(client.downloadProfilePhoto(ch, { isBig: false }), 4000);
                if (buf && buf.length > 0) {
                  photo = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
                }
              } catch {}
            }
            return {
              success: true,
              alreadyJoined: true,
              chatId: idStr,
              title: ch.title || '',
              about: '',
              participantsCount: ch.participantsCount || 0,
              photo,
              isChannel: ch.broadcast === true,
              isGroup: !ch.broadcast,
            };
          }
          // ChatInvite — user has NOT joined yet
          if (checkRes?.title) {
            let photo = '';
            if (checkRes.photo && checkRes.photo.className !== 'ChatPhotoEmpty') {
              // The CheckChatInvite result has a .photo but it's a Photo object, not entity photo
              // We can try to use it directly
              try {
                const buf = await withTimeout(client.downloadMedia(checkRes.photo, { }), 4000);
                if (buf && buf.length > 0) {
                  photo = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
                }
              } catch {}
            }
            return {
              success: true,
              alreadyJoined: false,
              title: checkRes.title || '',
              about: checkRes.about || '',
              participantsCount: checkRes.participantsCount || 0,
              photo,
              isChannel: checkRes.broadcast === true || checkRes.channel === true,
              isGroup: !checkRes.broadcast && !checkRes.channel,
            };
          }
          return { success: false, error: 'Could not parse invite info' };
        } catch (err: any) {
          const errMsg = err?.errorMessage || err?.message || '';
          if (errMsg.includes('INVITE_HASH_EXPIRED')) return { success: false, error: 'This invite link has expired.' };
          if (errMsg.includes('INVITE_HASH_INVALID')) return { success: false, error: 'This invite link is invalid.' };
          return { success: false, error: errMsg };
        }
      }

      // Public username — resolve entity
      const clean = raw.replace(/^@+/, '').trim();
      try {
        const entity: any = await client.getEntity(clean);
        if (entity) {
          const idStr = entity.id?.toString();
          let photo = '';
          if (hasEntityPhoto(entity)) {
            try {
              const buf = await withTimeout(client.downloadProfilePhoto(entity, { isBig: false }), 4000);
              if (buf && buf.length > 0) {
                photo = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
              }
            } catch {}
          }
          // Check if already a participant
          let alreadyJoined = false;
          if (entity.className === 'Channel' || entity.className === 'Chat') {
            // If 'left' is false or if participantsSelf exists, user is joined
            alreadyJoined = entity.left === false || entity.left === undefined;
          }
          // For channels, get full info for about/description
          let about = '';
          try {
            if (entity.className === 'Channel') {
              const full: any = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
              about = full?.fullChat?.about || '';
            }
          } catch {}
          return {
            success: true,
            alreadyJoined,
            chatId: idStr,
            title: entity.title || entity.firstName || '',
            about,
            participantsCount: entity.participantsCount || 0,
            photo,
            isChannel: entity.broadcast === true,
            isGroup: entity.className === 'Chat' || (entity.className === 'Channel' && !entity.broadcast),
          };
        }
      } catch {}

      return { success: false, error: 'Could not find chat' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to check invite' };
    }
  },

  /**
   * Join a public channel/group or private invite link
   */
  async joinChat(peerIdOrHash: string): Promise<{ success: boolean; chat?: any; alreadyJoined?: boolean; requestSent?: boolean; message?: string; error?: string }> {
    try {
      const client = await getDirectClient();
      const rawStr = String(peerIdOrHash || '').trim();
      if (!rawStr) {
        return { success: false, error: 'Chat ID or invite link is required' };
      }

      let inviteHash = '';
      if (rawStr.startsWith('+')) {
        inviteHash = rawStr.slice(1);
      } else if (rawStr.startsWith('joinchat/')) {
        inviteHash = rawStr.slice(9);
      } else if (rawStr.includes('t.me/+')) {
        inviteHash = rawStr.split('t.me/+')[1]?.split(/[?#/]/)[0] || '';
      } else if (rawStr.includes('t.me/joinchat/')) {
        inviteHash = rawStr.split('t.me/joinchat/')[1]?.split(/[?#/]/)[0] || '';
      } else if (!/^-?\d+$/.test(rawStr) && !peerEntityCache.has(rawStr) && (rawStr.includes('-') || rawStr.includes('_') || rawStr.length >= 16)) {
        inviteHash = rawStr;
      }

      if (inviteHash) {
        const cleanHash = inviteHash.replace(/^(\+|joinchat\/)/, '').trim();
        try {
          const updates: any = await client.invoke(new Api.messages.ImportChatInvite({ hash: cleanHash }));
          let joinedChat: any = null;
          if (updates?.chats && Array.isArray(updates.chats) && updates.chats.length > 0) {
            joinedChat = updates.chats[0];
            const idStr = joinedChat.id.toString();
            peerEntityCache.set(idStr, joinedChat);
            peerEntityCache.set(`-100${idStr}`, joinedChat);
            peerEntityCache.set(`-${idStr}`, joinedChat);
          }
          return { success: true, chat: joinedChat ? { id: joinedChat.id.toString(), title: joinedChat.title } : undefined };
        } catch (invErr: any) {
          const errMsg = invErr?.errorMessage || invErr?.message || '';
          if (errMsg.includes('USER_ALREADY_PARTICIPANT')) {
            try {
              const checkRes: any = await client.invoke(new Api.messages.CheckChatInvite({ hash: cleanHash }));
              if (checkRes?.chat) {
                const ch = checkRes.chat;
                const idStr = ch.id.toString();
                peerEntityCache.set(idStr, ch);
                peerEntityCache.set(`-100${idStr}`, ch);
                return { success: true, alreadyJoined: true, chat: { id: idStr, title: ch.title } };
              }
            } catch (cErr) {}
            return { success: true, alreadyJoined: true };
          }
          if (errMsg.includes('INVITE_REQUEST_SENT')) {
            return { success: true, requestSent: true, message: 'Join request sent to group admins.' };
          }
          if (errMsg.includes('INVITE_HASH_EXPIRED')) {
            return { success: false, error: 'This invite link has expired.' };
          }
          if (!errMsg.includes('INVITE_HASH_INVALID')) {
            return { success: false, error: errMsg };
          }
        }
      }

      let entity = peerEntityCache.get(rawStr) || peerEntityCache.get(`-100${rawStr}`) || peerEntityCache.get(`-${rawStr}`);
      if (!entity) {
        const clean = rawStr.replace(/^@+/, '').trim();
        try {
          entity = await client.getEntity(clean);
        } catch {
          try {
            entity = await client.getEntity(bigInt(clean) as any);
          } catch {
            try {
              const updates: any = await client.invoke(new Api.messages.ImportChatInvite({ hash: clean }));
              if (updates?.chats?.length > 0) {
                const ch = updates.chats[0];
                peerEntityCache.set(ch.id.toString(), ch);
                return { success: true, chat: { id: ch.id.toString(), title: ch.title } };
              }
            } catch (invFinalErr: any) {
              const m = invFinalErr?.errorMessage || invFinalErr?.message || '';
              if (m.includes('USER_ALREADY_PARTICIPANT')) return { success: true, alreadyJoined: true };
              if (m.includes('INVITE_REQUEST_SENT')) return { success: true, requestSent: true, message: 'Join request sent to group admins.' };
            }
            return { success: false, error: `Could not resolve chat for "${peerIdOrHash}"` };
          }
        }
      }

      if (entity) {
        const idStr = entity.id?.toString();
        if (idStr) {
          peerEntityCache.set(idStr, entity);
          peerEntityCache.set(`-100${idStr}`, entity);
        }
        if (entity.className === 'Channel') {
          await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
          return { success: true, chat: { id: idStr, title: entity.title } };
        } else if (entity.className === 'Chat') {
          await client.invoke(new Api.messages.AddChatUser({ chatId: entity.id, userId: 'me' as any, fwdLimit: 100 }));
          return { success: true, chat: { id: idStr, title: entity.title } };
        } else {
          return { success: true };
        }
      }

      return { success: false, error: 'Could not find chat' };
    } catch (err: any) {
      const errMsg = err?.errorMessage || err?.message || 'Failed to join chat';
      if (errMsg.includes('USER_ALREADY_PARTICIPANT')) {
        return { success: true, alreadyJoined: true };
      }
      return { success: false, error: errMsg };
    }
  },

  onNewMessage: onDirectNewMessage,
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
