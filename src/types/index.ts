export type ChatType = 'direct' | 'group' | 'channel' | 'bot';

export type ChatFolder = 'all' | 'personal' | 'channels' | 'groups' | 'bots' | 'unread';

/**
 * Telegram Dialog Filter / TeleForge Power Folder Architecture:
 * Aligns with Telegram MTProto TL schema (messages.dialogFilters / DialogFilter)
 * while providing extensible attributes for upcoming custom filter rules.
 */
export interface TeleForgeDialogFilter {
  id: string;
  numericId?: number;
  title: string;
  emoticon?: string;
  unreadOnly?: boolean;
  contacts?: boolean;
  nonContacts?: boolean;
  groups?: boolean;
  channels?: boolean;
  bots?: boolean;
  excludeMuted?: boolean;
  excludeRead?: boolean;
  excludeArchived?: boolean;
  pinnedChatIds?: string[];
  includeChatIds?: string[];
  excludeChatIds?: string[];
  customOrder?: number;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  userReacted?: boolean;
}

export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name?: string;
  size?: string;
  duration?: string; // e.g. "0:24" for audio
  thumbUrl?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  senderThumbUrl?: string;
  text: string;
  timestamp: string;
  date: string;
  rawDate?: number;
  isOutgoing: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  attachment?: Attachment;
  reactions?: Reaction[];
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  pinned?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  thumbUrl?: string;
  avatarColor: string;
  type: ChatType;
  verified?: boolean;
  online?: boolean;
  lastSeen?: string;
  memberCount?: number;
  description?: string;
  username?: string;
  phone?: string;
  isMuted?: boolean;
  isPinned?: boolean;
  isJoined?: boolean;
  unreadCount: number;
  lastMessage?: {
    text: string;
    timestamp: string;
    rawDate?: number;
    senderName?: string;
    isOutgoing?: boolean;
  };
  messages: Message[];
}

export interface UserProfile {
  name: string;
  username: string;
  phone: string;
  bio: string;
  avatar: string;
}
