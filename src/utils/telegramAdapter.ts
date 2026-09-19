import { TelegramDialog, TelegramMessage, TelegramUser, resolveApiUrl, isAndroidApp } from '../services/telegramApi';
import { avatarService } from '../services/avatarService';
import { mediaService } from '../services/mediaService';
import { Chat, Message, UserProfile } from '../types';

const AVATAR_COLORS = [
  '#2AABEE', '#FF595A', '#FF9A3C', '#28C76F', '#8A68D6',
  '#00B894', '#E17055', '#6C5CE7', '#0984E3', '#D63031'
];

export function getAvatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatMessageTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { year: '2-digit', month: '2-digit', day: '2-digit' });
}

export function mapDialogToChat(dialog: TelegramDialog): Chat {
  let chatType: 'direct' | 'group' | 'channel' | 'bot' = 'direct';
  if (dialog.isGroup) {
    chatType = 'group';
  } else if (dialog.isChannel) {
    chatType = 'channel';
  } else if (dialog.username && dialog.username.toLowerCase().endsWith('bot')) {
    chatType = 'bot';
  }

  const formattedTime = dialog.lastMessage?.date
    ? formatMessageTime(dialog.lastMessage.date)
    : '';

  const rawTitle = dialog.title as any;
  const chatName = typeof rawTitle === 'string'
    ? rawTitle
    : (rawTitle?.text ? String(rawTitle.text) : String(rawTitle || 'Telegram User'));

  const rawMsgText = dialog.lastMessage?.text as any;
  const msgText = typeof rawMsgText === 'string'
    ? rawMsgText
    : (rawMsgText?.text ? String(rawMsgText.text) : (rawMsgText ? String(rawMsgText) : ''));

  const memberCount = typeof dialog.memberCount === 'number'
    ? dialog.memberCount
    : (typeof dialog.participantsCount === 'number' ? dialog.participantsCount : undefined);

  const effectiveAvatar = (dialog.avatar && dialog.avatar.length > 0)
    ? dialog.avatar
    : (dialog.thumbUrl || avatarService.get(dialog.id) || (!isAndroidApp() ? resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(dialog.id)}`) : ''));

  return {
    id: dialog.id,
    name: chatName || 'Telegram User',
    avatar: effectiveAvatar,
    thumbUrl: dialog.thumbUrl || effectiveAvatar,
    avatarColor: getAvatarColor(chatName || dialog.id),
    type: chatType,
    verified: dialog.isVerified,
    username: dialog.username ? `@${dialog.username}` : undefined,
    phone: dialog.phone,
    isPinned: dialog.pinned,
    isJoined: dialog.isJoined !== undefined ? dialog.isJoined : true,
    unreadCount: dialog.unreadCount,
    memberCount,
    lastMessage: dialog.lastMessage
      ? {
          text: msgText,
          timestamp: formattedTime,
          rawDate: dialog.lastMessage.date,
          isOutgoing: dialog.lastMessage.out,
        }
      : undefined,
    messages: [],
  };
}

export function mapTelegramMessage(
  m: TelegramMessage,
  chatId: string,
  chatName: string
): Message {
  let attachment = undefined;
  if (m.hasMedia && m.mediaType) {
    let attType: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'gif' | 'videoNote' = 'file';
    const isVideoExt = Boolean(m.fileName && /\.(mp4|mkv|mov|webm|avi|flv|m4v|3gp|ts)$/i.test(m.fileName));
    if (m.mediaType === 'photo') {
      attType = 'image';
    } else if (m.mediaType === 'videoNote' || m.isRound) {
      attType = 'videoNote';
    } else if (m.mediaType === 'gif' || m.isGif) {
      attType = 'gif';
    } else if (m.mediaType === 'sticker' || m.isSticker) {
      attType = 'sticker';
    } else if (m.mediaType === 'video' || isVideoExt) {
      attType = 'video';
    } else if (m.mediaType === 'voice' || m.mediaType === 'audio') {
      attType = 'audio';
    }

    const cachedUrl = mediaService.get(chatId, m.id);
    const mediaUrl = cachedUrl || (isAndroidApp() ? '' : resolveApiUrl(`/api/telegram/media?chatId=${encodeURIComponent(chatId)}&messageId=${m.id}`));

    let defaultName = 'File';
    if (m.mediaType === 'photo') defaultName = 'Photo';
    else if (m.mediaType === 'videoNote' || m.isRound) defaultName = 'Video Message';
    else if (m.mediaType === 'gif' || m.isGif) defaultName = 'GIF';
    else if (m.mediaType === 'sticker' || m.isSticker) defaultName = m.stickerEmoji ? `Sticker ${m.stickerEmoji}` : 'Sticker';
    else if (m.mediaType === 'video' || isVideoExt) defaultName = 'Video';
    else if (m.mediaType === 'voice') defaultName = 'Voice Message';
    else if (m.mediaType === 'audio') defaultName = 'Audio Message';
    // Note: m.mediaThumb is preserved as attachment.thumbUrl for instant 0ms blur placeholder,
    // while attachment.url loads the full-resolution image from /api/telegram/media.

    attachment = {
      type: attType,
      url: mediaUrl,
      thumbUrl: m.mediaThumb,
      name: m.fileName || defaultName,
      size: m.fileSize || undefined,
      duration: m.duration || (m.mediaType === 'voice' ? '0:18' : undefined),
      isRound: Boolean(m.isRound || m.mediaType === 'videoNote'),
      isSticker: Boolean(m.isSticker || m.mediaType === 'sticker'),
      isGif: Boolean(m.isGif || m.mediaType === 'gif'),
      stickerEmoji: m.stickerEmoji,
      stickerSet: m.stickerSet,
      documentId: m.documentId,
      accessHash: m.accessHash,
      fileReference: m.fileReference,
    };
  }

  const dateObj = new Date(m.date);
  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const msgDate = dateObj.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const rawText = m.text as any;
  const textStr = typeof rawText === 'string'
    ? rawText
    : (rawText?.text ? String(rawText.text) : (rawText ? String(rawText) : ''));

  const isOut = Boolean(m.out);
  const senderId = isOut ? 'user-me' : (m.senderId || 'peer');
  const senderName = isOut ? 'You' : (m.senderName || chatName);
  const cachedSenderAvatar = m.senderId ? avatarService.get(m.senderId) : undefined;
  const senderAvatar = isOut
    ? undefined
    : (cachedSenderAvatar || (m.senderAvatar && (!m.senderAvatar.startsWith('data:image/') || m.senderAvatar.length > 5000) ? m.senderAvatar : undefined) || (m.senderId && m.senderId !== 'peer' ? resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(m.senderId)}`) : undefined));
  const senderThumbUrl = isOut ? undefined : m.senderThumbUrl;

  return {
    id: String(m.id),
    chatId,
    senderId,
    senderName,
    senderAvatar,
    senderThumbUrl,
    text: textStr,
    timestamp: formattedTime,
    date: msgDate,
    rawDate: m.date,
    isOutgoing: isOut,
    status: 'read',
    attachment,
    reactions: m.reactions,
    isService: Boolean(m.actionText),
    forwardFrom: m.forwardFrom,
    replyTo: m.replyToMsgId
      ? {
          id: String(m.replyToMsgId),
          senderName: m.replyToSenderName || 'Replied Message',
          text: m.replyToText || 'Original message',
        }
      : undefined,
  };
}

export function mapTelegramUserToProfile(user: TelegramUser): UserProfile {
  const photoId = user.photoId || '';
  const cachedHighRes = avatarService.get('me') || avatarService.get(user.id);
  const avatarUrl = cachedHighRes ||
    (user.avatar && user.avatar.length > 500 ? user.avatar : '') ||
    (user.hasAvatar === false
      ? ''
      : resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(user.id)}${photoId ? `&v=${photoId}` : ''}`));

  return {
    id: user.id,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Telegram User',
    username: user.username ? `@${user.username}` : '',
    phone: user.phone || '',
    bio: user.bio || '',
    avatar: avatarUrl,
  };
}
