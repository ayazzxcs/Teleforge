// TeleForge Command Center Service
// Orchestrator for TeleForge features, favorites, recents, settings search index,
// and safe client-side storage calculation.

export type CommandCenterActionId =
  | 'theme-studio'
  | 'power-folders'
  | 'power-tools'
  | 'compact-mode'
  | 'large-text'
  | 'swipe-gestures'
  | 'chat-appearance'
  | 'storage-info'
  | 'notifications'
  | 'privacy'
  | 'immersive-media';

export interface CommandCenterFeature {
  id: CommandCenterActionId;
  title: string;
  subtitle: string;
  category: 'Appearance' | 'Folders' | 'Tools' | 'Chat' | 'System';
  icon: string;
  keywords: string[];
}

export const COMMAND_CENTER_FEATURES: CommandCenterFeature[] = [
  {
    id: 'theme-studio',
    title: 'Theme Studio',
    subtitle: 'Customize 24 color tokens, contrast, and theme presets',
    category: 'Appearance',
    icon: 'Palette',
    keywords: ['theme', 'studio', 'color', 'tokens', 'dark', 'light', 'preset', 'crimson', 'accent'],
  },
  {
    id: 'power-folders',
    title: 'Power Folders',
    subtitle: 'Organize chats into MTProto-synchronized filter tabs',
    category: 'Folders',
    icon: 'Folder',
    keywords: ['folder', 'tabs', 'organize', 'filter', 'manage', 'personal', 'channels', 'groups', 'bots'],
  },
  {
    id: 'power-tools',
    title: 'Power Tools Hub',
    subtitle: 'Chat options, reactions, gestures, and media controls',
    category: 'Tools',
    icon: 'Wrench',
    keywords: ['power', 'tools', 'hub', 'advanced', 'settings', 'config'],
  },
  {
    id: 'compact-mode',
    title: 'Compact Density Mode',
    subtitle: 'High-density message layout with optimized padding',
    category: 'Chat',
    icon: 'Maximize2',
    keywords: ['compact', 'density', 'spacing', 'tight', 'layout', 'chat'],
  },
  {
    id: 'large-text',
    title: 'Message Font Size',
    subtitle: 'Cycle font size (Small 13px, Default 15px, Large 17px, XL 19px)',
    category: 'Chat',
    icon: 'Type',
    keywords: ['font', 'size', 'text', 'large', 'small', 'typography', 'scale'],
  },
  {
    id: 'swipe-gestures',
    title: 'Swipe Gestures',
    subtitle: 'Configure touch gestures for Read, Mute, Pin & Archive',
    category: 'Tools',
    icon: 'Hand',
    keywords: ['gesture', 'swipe', 'touch', 'left', 'right', 'action', 'read', 'mute', 'pin'],
  },
  {
    id: 'chat-appearance',
    title: 'Chat Appearance & Bubbles',
    subtitle: 'Bubble colors, corner rounding, and wallpaper styles',
    category: 'Appearance',
    icon: 'Sliders',
    keywords: ['bubble', 'corner', 'radius', 'wallpaper', 'background', 'chat', 'appearance'],
  },
  {
    id: 'immersive-media',
    title: 'Immersive Media Viewer',
    subtitle: 'Distraction-free tap-to-hide media viewer with zoom',
    category: 'Tools',
    icon: 'Image',
    keywords: ['media', 'viewer', 'photo', 'video', 'immersive', 'zoom', 'metadata'],
  },
  {
    id: 'storage-info',
    title: 'Storage & Cache Overview',
    subtitle: 'Inspect TeleForge cache size and manage storage safely',
    category: 'System',
    icon: 'HardDrive',
    keywords: ['storage', 'cache', 'clear', 'bytes', 'memory', 'disk', 'size'],
  },
  {
    id: 'notifications',
    title: 'Notification Settings',
    subtitle: 'Chat notification alerts, sounds, and badge controls',
    category: 'System',
    icon: 'Bell',
    keywords: ['notification', 'alert', 'sound', 'badge', 'preview', 'ringtone'],
  },
  {
    id: 'privacy',
    title: 'Privacy & Security',
    subtitle: 'Active MTProto sessions, two-step verification & locks',
    category: 'System',
    icon: 'Shield',
    keywords: ['privacy', 'security', 'session', 'lock', 'passcode', 'verification', 'two-step'],
  },
];

const FAVORITES_KEY = 'teleforge_command_center_favorites';
const RECENTS_KEY = 'teleforge_command_center_recents';
const DEFAULT_FAVORITES: CommandCenterActionId[] = [
  'theme-studio',
  'power-folders',
  'power-tools',
  'compact-mode',
];

// Favorites management
export const getFavorites = (): CommandCenterActionId[] => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_FAVORITES;
};

export const toggleFavorite = (id: CommandCenterActionId): CommandCenterActionId[] => {
  const current = getFavorites();
  let updated: CommandCenterActionId[];
  if (current.includes(id)) {
    updated = current.filter((item) => item !== id);
  } else {
    updated = [...current, id];
  }
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
};

export const isFavorite = (id: CommandCenterActionId): boolean => {
  return getFavorites().includes(id);
};

// Recently used management
export const getRecentlyUsed = (): CommandCenterActionId[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return ['theme-studio', 'power-folders'];
};

export const recordRecent = (id: CommandCenterActionId): CommandCenterActionId[] => {
  const current = getRecentlyUsed().filter((item) => item !== id);
  const updated = [id, ...current].slice(0, 6);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch (e) {}
  return updated;
};

export const clearRecentlyUsed = (): void => {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch (e) {}
};

// Search filter for Command Center items
export const searchCommandCenter = (query: string): CommandCenterFeature[] => {
  const clean = query.trim().toLowerCase();
  if (!clean) return COMMAND_CENTER_FEATURES;

  return COMMAND_CENTER_FEATURES.filter((feat) => {
    const matchTitle = feat.title.toLowerCase().includes(clean);
    const matchSubtitle = feat.subtitle.toLowerCase().includes(clean);
    const matchCategory = feat.category.toLowerCase().includes(clean);
    const matchKeywords = feat.keywords.some((k) => k.toLowerCase().includes(clean));
    return matchTitle || matchSubtitle || matchCategory || matchKeywords;
  });
};

// Storage Calculation Helper
export interface TeleForgeStorageStats {
  totalBytes: number;
  formattedSize: string;
  cachedChatsCount: number;
  cacheKeysCount: number;
}

export const getTeleForgeStorageStats = (): TeleForgeStorageStats => {
  let totalBytes = 0;
  let cacheKeysCount = 0;
  let cachedChatsCount = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('teleforge_')) {
        cacheKeysCount++;
        const val = localStorage.getItem(key) || '';
        totalBytes += (key.length + val.length) * 2; // Approximate UTF-16 bytes

        if (key === 'teleforge_cached_chats') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) cachedChatsCount = parsed.length;
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  // Format bytes nicely
  let formattedSize = '0 KB';
  if (totalBytes > 1024 * 1024) {
    formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
  } else if (totalBytes > 0) {
    formattedSize = `${(totalBytes / 1024).toFixed(1)} KB`;
  }

  return {
    totalBytes,
    formattedSize,
    cachedChatsCount,
    cacheKeysCount,
  };
};

// Safe cache clearing: flushes only temporary chat list and search caches,
// preserves user theme, power tools configuration, favorites, and recents.
export const clearTeleForgeLocalCache = (): void => {
  try {
    localStorage.removeItem('teleforge_cached_chats');
  } catch (e) {}
};
