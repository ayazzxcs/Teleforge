// TeleForge Power Tools — Data Architecture & Local Preference Store
// Versioned client-side preferences for chat customization, message actions,
// quick reactions, gestures, compact mode, and media viewing.

export type MessageFontSize = 'small' | 'default' | 'large' | 'extraLarge';
export type CornerRounding = 'sharp' | 'default' | 'extra';
export type TimestampFormat = '12h' | '24h' | 'relative' | 'hidden';
export type SwipeAction = 'reply' | 'read' | 'mute' | 'pin' | 'archive' | 'delete' | 'none';

export interface TeleForgeReactionSettings {
  quickReactions: string[];
  showUnreadReactions: boolean;
}

export interface TeleForgeGestureSettings {
  enableSwipeActions: boolean;
  enableSwipeGestures?: boolean;
  swipeLeftAction: SwipeAction;
  swipeRightAction: SwipeAction;
}

export interface TeleForgeMediaSettings {
  immersiveMode: boolean;
  showMediaInfo: boolean;
}

export interface TeleForgeSearchSettings {
  activeFilter: 'all' | 'photo' | 'video' | 'file' | 'audio' | 'link';
}

export interface TeleForgePowerToolsSettings {
  version: number;
  compactMode: boolean;
  messageFontSize: MessageFontSize;
  timestampFormat?: TimestampFormat;
  reactions: TeleForgeReactionSettings;
  gestures: TeleForgeGestureSettings;
  mediaViewer: TeleForgeMediaSettings;
  search: TeleForgeSearchSettings;
}

// Per-Chat Customization Schema
export interface ChatCustomizationConfig {
  chatAccent?: string;
  bubbleInColor?: string;
  bubbleInTextColor?: string;
  bubbleOutColor?: string;
  bubbleOutTextColor?: string;
  wallpaperPattern?: 'default' | 'subtle' | 'none' | 'dots';
  fontSize?: MessageFontSize;
  cornerRounding?: CornerRounding;
  timestampFormat?: TimestampFormat;
  showAvatars?: boolean;
  compactSpacing?: boolean;
}

const POWER_TOOLS_STORAGE_KEY = 'teleforge_power_tools_settings';
const CHAT_CUSTOMIZATIONS_KEY = 'teleforge_chat_customizations';

export const DEFAULT_QUICK_REACTIONS = ['❤️', '👍', '🔥', '😂', '👏', '🎉', '⚡', '😎'];

export const DEFAULT_POWER_TOOLS_SETTINGS: TeleForgePowerToolsSettings = {
  version: 1,
  compactMode: false,
  messageFontSize: 'default',
  timestampFormat: '24h',
  reactions: {
    quickReactions: DEFAULT_QUICK_REACTIONS,
    showUnreadReactions: true,
  },
  gestures: {
    enableSwipeActions: true,
    swipeLeftAction: 'read',
    swipeRightAction: 'reply',
  },
  mediaViewer: {
    immersiveMode: false,
    showMediaInfo: true,
  },
  search: {
    activeFilter: 'all',
  },
};

// ---------------------------------------------------------------------------
// Power Tools Global Preferences Helpers
// ---------------------------------------------------------------------------

export function getPowerToolsSettings(): TeleForgePowerToolsSettings {
  if (typeof window === 'undefined') return DEFAULT_POWER_TOOLS_SETTINGS;
  try {
    const raw = localStorage.getItem(POWER_TOOLS_STORAGE_KEY);
    if (!raw) return DEFAULT_POWER_TOOLS_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_POWER_TOOLS_SETTINGS,
      ...parsed,
      timestampFormat: parsed.timestampFormat || '24h',
      reactions: {
        ...DEFAULT_POWER_TOOLS_SETTINGS.reactions,
        ...(parsed.reactions || {}),
      },
      gestures: {
        ...DEFAULT_POWER_TOOLS_SETTINGS.gestures,
        ...(parsed.gestures || {}),
      },
      mediaViewer: {
        ...DEFAULT_POWER_TOOLS_SETTINGS.mediaViewer,
        ...(parsed.mediaViewer || {}),
      },
      search: {
        ...DEFAULT_POWER_TOOLS_SETTINGS.search,
        ...(parsed.search || {}),
      },
    };
  } catch (e) {
    console.warn('Failed to load power tools settings:', e);
    return DEFAULT_POWER_TOOLS_SETTINGS;
  }
}

export function getGlobalTimestampFormat(): TimestampFormat {
  if (typeof window === 'undefined') return '24h';
  const settings = getPowerToolsSettings();
  return settings.timestampFormat || '24h';
}

export function saveGlobalTimestampFormat(format: TimestampFormat): void {
  if (typeof window === 'undefined') return;
  const current = getPowerToolsSettings();
  savePowerToolsSettings({
    ...current,
    timestampFormat: format,
  });
}

export function savePowerToolsSettings(settings: TeleForgePowerToolsSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(POWER_TOOLS_STORAGE_KEY, JSON.stringify(settings));
    if (settings.timestampFormat) {
      try {
        const all = getAllChatCustomizations();
        let changed = false;
        for (const chatId in all) {
          if (all[chatId].timestampFormat && all[chatId].timestampFormat !== settings.timestampFormat) {
            all[chatId].timestampFormat = settings.timestampFormat;
            changed = true;
          }
        }
        if (changed) {
          localStorage.setItem(CHAT_CUSTOMIZATIONS_KEY, JSON.stringify(all));
        }
      } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('teleforge:powertools-changed', { detail: settings }));
  } catch (e) {
    console.error('Failed to save power tools settings:', e);
  }
}

// ---------------------------------------------------------------------------
// Per-Chat Customization Storage
// ---------------------------------------------------------------------------

export function getAllChatCustomizations(): Record<string, ChatCustomizationConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CHAT_CUSTOMIZATIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

export function getChatCustomization(chatId: string): ChatCustomizationConfig {
  if (!chatId) return {};
  const all = getAllChatCustomizations();
  return all[chatId] || {};
}

export function saveChatCustomization(chatId: string, config: ChatCustomizationConfig): void {
  if (!chatId || typeof window === 'undefined') return;
  try {
    const all = getAllChatCustomizations();
    all[chatId] = {
      ...all[chatId],
      ...config,
    };
    localStorage.setItem(CHAT_CUSTOMIZATIONS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('teleforge:chat-customization-changed', { detail: { chatId, config: all[chatId] } }));
  } catch (e) {
    console.error(`Failed to save customization for chat ${chatId}:`, e);
  }
}

export function resetChatCustomization(chatId: string): void {
  if (!chatId || typeof window === 'undefined') return;
  try {
    const all = getAllChatCustomizations();
    delete all[chatId];
    localStorage.setItem(CHAT_CUSTOMIZATIONS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('teleforge:chat-customization-changed', { detail: { chatId, config: {} } }));
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Font Size Helper Map (in Tailwind classes / style values)
// ---------------------------------------------------------------------------

export function getFontSizeClass(size: MessageFontSize = 'default'): string {
  switch (size) {
    case 'small':
      return 'text-[13px] leading-relaxed';
    case 'large':
      return 'text-[17px] leading-relaxed';
    case 'extraLarge':
      return 'text-[19px] leading-relaxed';
    case 'default':
    default:
      return 'text-[15px] leading-relaxed';
  }
}

export function getCornerRadiusClass(rounding: CornerRounding = 'default', isOut: boolean): string {
  switch (rounding) {
    case 'sharp':
      return isOut ? 'rounded-md rounded-tr-none' : 'rounded-md rounded-tl-none';
    case 'extra':
      return isOut ? 'rounded-3xl rounded-tr-xs' : 'rounded-3xl rounded-tl-xs';
    case 'default':
    default:
      return isOut ? 'rounded-2xl rounded-tr-xs' : 'rounded-2xl rounded-tl-xs';
  }
}
