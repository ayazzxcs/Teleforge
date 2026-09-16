// TeleForge Central Theme Architecture & Engine
// Full token specification, built-in presets, custom theme persistence,
// WCAG contrast validation, and import/export utilities.

export interface TeleForgeThemeTokens {
  // 1. General / Accent
  primary: string;           // Brand core accent (e.g. #8B1E22)
  primaryHover: string;      // Button hover state
  primaryActive: string;     // Button active / pressed state
  primarySubtle: string;     // Subtle translucent background tint
  secondaryAccent: string;   // Secondary accent (warm cream or complementary tint)
  textPrimary: string;       // Main body / title text
  textSecondary: string;     // Muted caption text
  linkColor: string;         // Hyperlinks and clickable entities
  bg: string;                // Root canvas background
  surface: string;           // Sidebar, header, drawers
  surfaceElevated: string;   // Modals, cards, floating popovers

  // 2. Chat
  bubbleIn: string;          // Incoming message bubble background
  bubbleInText: string;      // Incoming message text color
  bubbleOut: string;         // Outgoing message bubble background
  bubbleOutText: string;     // Outgoing message text color
  replyAccent: string;       // Reply vertical accent line
  selectedMessage: string;   // Selected message highlight background
  timestamp: string;         // Bubble timestamp & read receipt color

  // 3. Navigation
  topBar: string;            // Header / Toolbar background
  tabBg: string;             // Folder / tab bar background
  tabSelected: string;       // Active tab text / indicator color
  border: string;            // Dividers, card borders, separators
  searchBg: string;          // Search bar input background
  actionButton: string;      // Send button / primary action fill

  // 4. Media / UI
  mediaOverlay: string;      // Scrim / overlay on media preview
  progressBar: string;       // Audio / download progress fill
  switchActive: string;      // Toggle switch active fill
  checkboxActive: string;    // Checkbox active fill
  iconTint: string;          // Icon color for toolbar / actions

  // Backward compatibility aliases
  cream?: string;
  creamAccent?: string;
  creamMuted?: string;
}

export interface TeleForgeTheme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  isCustom?: boolean;
  tokens: TeleForgeThemeTokens;
}

// 1. TeleForge Red (Default Brand)
export const teleforgeRedPreset: TeleForgeTheme = {
  id: 'teleforge-red',
  name: 'TeleForge Red (Default)',
  mode: 'dark',
  tokens: {
    primary: '#8B1E22',
    primaryHover: '#74181B',
    primaryActive: '#5F1215',
    primarySubtle: 'rgba(139, 30, 34, 0.20)',
    secondaryAccent: '#FFF8EE',
    textPrimary: '#F0F4F8',
    textSecondary: '#94A3B8',
    linkColor: '#FF6B7A',
    bg: '#0c1017',
    surface: '#151d27',
    surfaceElevated: '#1a2430',
    bubbleIn: '#1a2430',
    bubbleInText: '#E6EDF3',
    bubbleOut: '#43191d',
    bubbleOutText: '#FFF8EE',
    replyAccent: '#8B1E22',
    selectedMessage: 'rgba(139, 30, 34, 0.28)',
    timestamp: '#94A3B8',
    topBar: '#151d27',
    tabBg: '#111722',
    tabSelected: '#8B1E22',
    border: 'rgba(255, 248, 238, 0.08)',
    searchBg: '#1c2736',
    actionButton: '#8B1E22',
    mediaOverlay: 'rgba(0, 0, 0, 0.75)',
    progressBar: '#8B1E22',
    switchActive: '#8B1E22',
    checkboxActive: '#8B1E22',
    iconTint: '#94A3B8',
    cream: '#FFF8EE',
    creamAccent: '#F5EBE1',
    creamMuted: '#D8CAB8',
  },
};

// Aliases for backwards compatibility
export const teleforgeDarkTheme = teleforgeRedPreset;

// 2. Midnight (Pure Dark OLED / Deep Navy)
export const midnightPreset: TeleForgeTheme = {
  id: 'midnight',
  name: 'Midnight OLED',
  mode: 'dark',
  tokens: {
    primary: '#00D2FF',
    primaryHover: '#00B8E0',
    primaryActive: '#009EC2',
    primarySubtle: 'rgba(0, 210, 255, 0.15)',
    secondaryAccent: '#38BDF8',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    linkColor: '#38BDF8',
    bg: '#0A0F1D',
    surface: '#10172A',
    surfaceElevated: '#1E293B',
    bubbleIn: '#131C31',
    bubbleInText: '#F1F5F9',
    bubbleOut: '#1E293B',
    bubbleOutText: '#00D2FF',
    replyAccent: '#00D2FF',
    selectedMessage: 'rgba(0, 210, 255, 0.20)',
    timestamp: '#64748B',
    topBar: '#10172A',
    tabBg: '#0C1222',
    tabSelected: '#00D2FF',
    border: 'rgba(255, 255, 255, 0.08)',
    searchBg: '#1E293B',
    actionButton: '#00D2FF',
    mediaOverlay: 'rgba(0, 0, 0, 0.85)',
    progressBar: '#00D2FF',
    switchActive: '#00D2FF',
    checkboxActive: '#00D2FF',
    iconTint: '#94A3B8',
    cream: '#E2E8F0',
    creamAccent: '#CBD5E1',
    creamMuted: '#94A3B8',
  },
};

// 3. Crimson (Bold Luxury Charcoal & Fiery Crimson)
export const crimsonPreset: TeleForgeTheme = {
  id: 'crimson',
  name: 'Crimson Luxury',
  mode: 'dark',
  tokens: {
    primary: '#E11D48',
    primaryHover: '#BE123C',
    primaryActive: '#9F1239',
    primarySubtle: 'rgba(225, 29, 72, 0.20)',
    secondaryAccent: '#FB7185',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    linkColor: '#FB7185',
    bg: '#121113',
    surface: '#1A181C',
    surfaceElevated: '#242127',
    bubbleIn: '#1F1C23',
    bubbleInText: '#F4F4F5',
    bubbleOut: '#4C0519',
    bubbleOutText: '#FFE4E6',
    replyAccent: '#E11D48',
    selectedMessage: 'rgba(225, 29, 72, 0.25)',
    timestamp: '#A1A1AA',
    topBar: '#1A181C',
    tabBg: '#151317',
    tabSelected: '#E11D48',
    border: 'rgba(255, 255, 255, 0.07)',
    searchBg: '#242127',
    actionButton: '#E11D48',
    mediaOverlay: 'rgba(0, 0, 0, 0.80)',
    progressBar: '#E11D48',
    switchActive: '#E11D48',
    checkboxActive: '#E11D48',
    iconTint: '#A1A1AA',
    cream: '#FFE4E6',
    creamAccent: '#FECDD3',
    creamMuted: '#FDA4AF',
  },
};

// 4. Cream (Warm Day Light Mode)
export const creamPreset: TeleForgeTheme = {
  id: 'cream',
  name: 'Cream Warm Day',
  mode: 'light',
  tokens: {
    primary: '#8B1E22',
    primaryHover: '#74181B',
    primaryActive: '#5F1215',
    primarySubtle: 'rgba(139, 30, 34, 0.08)',
    secondaryAccent: '#D8CAB8',
    textPrimary: '#1E293B',
    textSecondary: '#64748B',
    linkColor: '#8B1E22',
    bg: '#F8F4EE',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    bubbleIn: '#FFFFFF',
    bubbleInText: '#1E293B',
    bubbleOut: '#FCEBEB',
    bubbleOutText: '#2B1214',
    replyAccent: '#8B1E22',
    selectedMessage: 'rgba(139, 30, 34, 0.12)',
    timestamp: '#8C7E70',
    topBar: '#FFFFFF',
    tabBg: '#F2EAE0',
    tabSelected: '#8B1E22',
    border: 'rgba(139, 30, 34, 0.12)',
    searchBg: '#F2ECE4',
    actionButton: '#8B1E22',
    mediaOverlay: 'rgba(0, 0, 0, 0.65)',
    progressBar: '#8B1E22',
    switchActive: '#8B1E22',
    checkboxActive: '#8B1E22',
    iconTint: '#64748B',
    cream: '#FFF8EE',
    creamAccent: '#F3E8DB',
    creamMuted: '#8C7E70',
  },
};

// Alias for backwards compatibility
export const teleforgeLightTheme = creamPreset;

// 5. Ocean (Deep Slate & Azure Blue)
export const oceanPreset: TeleForgeTheme = {
  id: 'ocean',
  name: 'Ocean Deep',
  mode: 'dark',
  tokens: {
    primary: '#0284C7',
    primaryHover: '#0369A1',
    primaryActive: '#075985',
    primarySubtle: 'rgba(2, 132, 199, 0.20)',
    secondaryAccent: '#38BDF8',
    textPrimary: '#F0F9FF',
    textSecondary: '#94A3B8',
    linkColor: '#38BDF8',
    bg: '#0B132B',
    surface: '#1C2541',
    surfaceElevated: '#243356',
    bubbleIn: '#16213E',
    bubbleInText: '#E2E8F0',
    bubbleOut: '#0369A1',
    bubbleOutText: '#F0F9FF',
    replyAccent: '#38BDF8',
    selectedMessage: 'rgba(2, 132, 199, 0.25)',
    timestamp: '#94A3B8',
    topBar: '#1C2541',
    tabBg: '#131B32',
    tabSelected: '#38BDF8',
    border: 'rgba(255, 255, 255, 0.08)',
    searchBg: '#243356',
    actionButton: '#0284C7',
    mediaOverlay: 'rgba(0, 0, 0, 0.80)',
    progressBar: '#38BDF8',
    switchActive: '#0284C7',
    checkboxActive: '#0284C7',
    iconTint: '#94A3B8',
    cream: '#E0F2FE',
    creamAccent: '#BAE6FD',
    creamMuted: '#7DD3FC',
  },
};

// 6. Forest (Emerald Dark)
export const forestPreset: TeleForgeTheme = {
  id: 'forest',
  name: 'Forest Emerald',
  mode: 'dark',
  tokens: {
    primary: '#10B981',
    primaryHover: '#059669',
    primaryActive: '#047857',
    primarySubtle: 'rgba(16, 185, 129, 0.20)',
    secondaryAccent: '#34D399',
    textPrimary: '#F0FDF4',
    textSecondary: '#9CA3AF',
    linkColor: '#34D399',
    bg: '#0A150F',
    surface: '#132219',
    surfaceElevated: '#1B3225',
    bubbleIn: '#14281E',
    bubbleInText: '#D1FAE5',
    bubbleOut: '#065F46',
    bubbleOutText: '#ECFDF5',
    replyAccent: '#10B981',
    selectedMessage: 'rgba(16, 185, 129, 0.25)',
    timestamp: '#9CA3AF',
    topBar: '#132219',
    tabBg: '#0D1C13',
    tabSelected: '#10B981',
    border: 'rgba(255, 255, 255, 0.07)',
    searchBg: '#1B3225',
    actionButton: '#10B981',
    mediaOverlay: 'rgba(0, 0, 0, 0.80)',
    progressBar: '#10B981',
    switchActive: '#10B981',
    checkboxActive: '#10B981',
    iconTint: '#9CA3AF',
    cream: '#ECFDF5',
    creamAccent: '#D1FAE5',
    creamMuted: '#A7F3D0',
  },
};

// 7. Violet (Amethyst & Neon Violet)
export const violetPreset: TeleForgeTheme = {
  id: 'violet',
  name: 'Violet Amethyst',
  mode: 'dark',
  tokens: {
    primary: '#8B5CF6',
    primaryHover: '#7C3AED',
    primaryActive: '#6D28D9',
    primarySubtle: 'rgba(139, 92, 246, 0.20)',
    secondaryAccent: '#A78BFA',
    textPrimary: '#FAF5FF',
    textSecondary: '#A1A1AA',
    linkColor: '#A78BFA',
    bg: '#120E1E',
    surface: '#1B152B',
    surfaceElevated: '#251E3E',
    bubbleIn: '#1E1736',
    bubbleInText: '#EDE9FE',
    bubbleOut: '#4C1D95',
    bubbleOutText: '#F5F3FF',
    replyAccent: '#8B5CF6',
    selectedMessage: 'rgba(139, 92, 246, 0.25)',
    timestamp: '#A1A1AA',
    topBar: '#1B152B',
    tabBg: '#151022',
    tabSelected: '#8B5CF6',
    border: 'rgba(255, 255, 255, 0.08)',
    searchBg: '#251E3E',
    actionButton: '#8B5CF6',
    mediaOverlay: 'rgba(0, 0, 0, 0.80)',
    progressBar: '#8B5CF6',
    switchActive: '#8B5CF6',
    checkboxActive: '#8B5CF6',
    iconTint: '#A1A1AA',
    cream: '#F5F3FF',
    creamAccent: '#EDE9FE',
    creamMuted: '#DDD6FE',
  },
};

export const BUILTIN_PRESETS: TeleForgeTheme[] = [
  teleforgeRedPreset,
  midnightPreset,
  crimsonPreset,
  creamPreset,
  oceanPreset,
  forestPreset,
  violetPreset,
];

// Storage Keys
const THEME_STORAGE_KEY = 'teleforge_theme_mode';
const ACTIVE_THEME_ID_KEY = 'teleforge_active_theme_id';
const CUSTOM_THEMES_KEY = 'teleforge_custom_themes';

// LocalStorage helpers
export function getSavedCustomThemes(): TeleForgeTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((t) => ({ ...t, isCustom: true }));
    }
  } catch (e) {
    console.warn('Failed to load custom themes from localStorage:', e);
  }
  return [];
}

export function saveCustomThemes(themes: TeleForgeTheme[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = themes.map((t) => ({ ...t, isCustom: true }));
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(sanitized));
  } catch (e) {
    console.error('Failed to save custom themes to localStorage:', e);
  }
}

export function getAllThemes(): TeleForgeTheme[] {
  const custom = getSavedCustomThemes();
  return [...BUILTIN_PRESETS, ...custom];
}

export function getActiveThemeId(): string {
  if (typeof window === 'undefined') return 'teleforge-red';
  const saved = localStorage.getItem(ACTIVE_THEME_ID_KEY);
  if (saved) return saved;

  const mode = localStorage.getItem(THEME_STORAGE_KEY);
  if (mode === 'light') return 'cream';
  return 'teleforge-red';
}

export function setActiveThemeId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_THEME_ID_KEY, id);
  } catch (e) {}
}

export function getInitialTheme(): TeleForgeTheme {
  const all = getAllThemes();
  const activeId = getActiveThemeId();
  const match = all.find((t) => t.id === activeId);
  return match || teleforgeRedPreset;
}

export function getInitialThemeMode(): 'dark' | 'light' {
  const theme = getInitialTheme();
  return theme.mode;
}

// Apply CSS Variables to DOM
export function applyTheme(theme: TeleForgeTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const { tokens } = theme;

  // Toggle dark/light class
  if (theme.mode === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
  }

  // 1. General / Accent
  root.style.setProperty('--tf-primary', tokens.primary);
  root.style.setProperty('--tf-primary-hover', tokens.primaryHover);
  root.style.setProperty('--tf-primary-active', tokens.primaryActive);
  root.style.setProperty('--tf-primary-subtle', tokens.primarySubtle);
  root.style.setProperty('--tf-secondary-accent', tokens.secondaryAccent);
  root.style.setProperty('--tf-text-primary', tokens.textPrimary);
  root.style.setProperty('--tf-text-secondary', tokens.textSecondary);
  root.style.setProperty('--tf-link', tokens.linkColor);
  root.style.setProperty('--tf-bg', tokens.bg);
  root.style.setProperty('--tf-surface', tokens.surface);
  root.style.setProperty('--tf-surface-elevated', tokens.surfaceElevated);

  // Backward compatibility cream variables
  root.style.setProperty('--tf-cream', tokens.cream || tokens.secondaryAccent);
  root.style.setProperty('--tf-cream-accent', tokens.creamAccent || tokens.secondaryAccent);
  root.style.setProperty('--tf-cream-muted', tokens.creamMuted || tokens.textSecondary);

  // 2. Chat
  root.style.setProperty('--tf-bubble-in', tokens.bubbleIn);
  root.style.setProperty('--tf-bubble-in-text', tokens.bubbleInText);
  root.style.setProperty('--tf-bubble-out', tokens.bubbleOut);
  root.style.setProperty('--tf-bubble-out-text', tokens.bubbleOutText);
  root.style.setProperty('--tf-reply-accent', tokens.replyAccent);
  root.style.setProperty('--tf-selected-message', tokens.selectedMessage);
  root.style.setProperty('--tf-timestamp', tokens.timestamp);

  // 3. Navigation
  root.style.setProperty('--tf-top-bar', tokens.topBar);
  root.style.setProperty('--tf-tab-bg', tokens.tabBg);
  root.style.setProperty('--tf-tab-selected', tokens.tabSelected);
  root.style.setProperty('--tf-border', tokens.border);
  root.style.setProperty('--tf-search-bg', tokens.searchBg);
  root.style.setProperty('--tf-action-button', tokens.actionButton);

  // 4. Media / UI
  root.style.setProperty('--tf-media-overlay', tokens.mediaOverlay);
  root.style.setProperty('--tf-progress-bar', tokens.progressBar);
  root.style.setProperty('--tf-switch-active', tokens.switchActive);
  root.style.setProperty('--tf-checkbox-active', tokens.checkboxActive);
  root.style.setProperty('--tf-icon-tint', tokens.iconTint);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.mode);
    localStorage.setItem(ACTIVE_THEME_ID_KEY, theme.id);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// WCAG 2.1 Contrast Ratio & Relative Luminance Calculator
// ---------------------------------------------------------------------------

function parseColorToRgb(colorStr: string): { r: number; g: number; b: number } | null {
  if (!colorStr) return null;
  const str = colorStr.trim();

  // Hex (#fff or #ffffff or #ffffffff)
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  // rgb / rgba
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  return null;
}

function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;

  const R = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const G = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const B = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = parseColorToRgb(color1);
  const rgb2 = parseColorToRgb(color2);

  if (!rgb1 || !rgb2) return 4.5; // fallback safe default

  const lum1 = calculateRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = calculateRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  const ratio = (brighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 10) / 10;
}

export interface ContrastStatus {
  ratio: number;
  level: 'AAA' | 'AA' | 'AA-Large' | 'Fail';
  isCompliant: boolean;
  message: string;
}

export function checkContrast(bg: string, fg: string): ContrastStatus {
  const ratio = getContrastRatio(bg, fg);

  if (ratio >= 7.0) {
    return {
      ratio,
      level: 'AAA',
      isCompliant: true,
      message: 'Enhanced Contrast (WCAG AAA)',
    };
  }
  if (ratio >= 4.5) {
    return {
      ratio,
      level: 'AA',
      isCompliant: true,
      message: 'High Contrast (WCAG AA Compliant)',
    };
  }
  if (ratio >= 3.0) {
    return {
      ratio,
      level: 'AA-Large',
      isCompliant: true,
      message: 'Acceptable for Large Text / UI',
    };
  }
  return {
    ratio,
    level: 'Fail',
    isCompliant: false,
    message: 'Low Contrast - May be difficult to read!',
  };
}

// ---------------------------------------------------------------------------
// Portable Theme Import / Export with Schema Validation & Sanitization
// ---------------------------------------------------------------------------

export interface TeleForgeExportPayload {
  version: string;
  format: 'teleforge-theme';
  exportedAt: string;
  theme: TeleForgeTheme;
}

export function exportThemeToFile(theme: TeleForgeTheme): void {
  if (typeof window === 'undefined') return;
  const payload: TeleForgeExportPayload = {
    version: '1.0',
    format: 'teleforge-theme',
    exportedAt: new Date().toISOString(),
    theme,
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const sanitizedName = theme.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  a.download = `${sanitizedName || 'teleforge'}.teleforge-theme.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeColorString(val: any, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  // Allow valid hex (#rgb, #rrggbb, #rrggbbaa) or rgb/rgba or valid css color
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(trimmed)) return trimmed;
  return fallback;
}

export function validateAndSanitizeTheme(raw: any): { success: boolean; theme?: TeleForgeTheme; error?: string } {
  try {
    let data = raw;
    if (typeof raw === 'string') {
      data = JSON.parse(raw);
    }

    const themeCandidate: any = data.format === 'teleforge-theme' && data.theme ? data.theme : data;

    if (!themeCandidate || typeof themeCandidate !== 'object') {
      return { success: false, error: 'Invalid theme file structure.' };
    }

    if (!themeCandidate.name || typeof themeCandidate.name !== 'string') {
      return { success: false, error: 'Theme is missing a valid name.' };
    }

    const mode: 'dark' | 'light' = themeCandidate.mode === 'light' ? 'light' : 'dark';
    const fallbackBase = mode === 'light' ? creamPreset : teleforgeRedPreset;
    const rawTokens = themeCandidate.tokens || {};

    const sanitizedTokens: TeleForgeThemeTokens = {
      primary: sanitizeColorString(rawTokens.primary, fallbackBase.tokens.primary),
      primaryHover: sanitizeColorString(rawTokens.primaryHover, fallbackBase.tokens.primaryHover),
      primaryActive: sanitizeColorString(rawTokens.primaryActive, fallbackBase.tokens.primaryActive),
      primarySubtle: sanitizeColorString(rawTokens.primarySubtle, fallbackBase.tokens.primarySubtle),
      secondaryAccent: sanitizeColorString(rawTokens.secondaryAccent, fallbackBase.tokens.secondaryAccent),
      textPrimary: sanitizeColorString(rawTokens.textPrimary, fallbackBase.tokens.textPrimary),
      textSecondary: sanitizeColorString(rawTokens.textSecondary, fallbackBase.tokens.textSecondary),
      linkColor: sanitizeColorString(rawTokens.linkColor, fallbackBase.tokens.linkColor),
      bg: sanitizeColorString(rawTokens.bg, fallbackBase.tokens.bg),
      surface: sanitizeColorString(rawTokens.surface, fallbackBase.tokens.surface),
      surfaceElevated: sanitizeColorString(rawTokens.surfaceElevated, fallbackBase.tokens.surfaceElevated),
      bubbleIn: sanitizeColorString(rawTokens.bubbleIn, fallbackBase.tokens.bubbleIn),
      bubbleInText: sanitizeColorString(rawTokens.bubbleInText, fallbackBase.tokens.bubbleInText),
      bubbleOut: sanitizeColorString(rawTokens.bubbleOut, fallbackBase.tokens.bubbleOut),
      bubbleOutText: sanitizeColorString(rawTokens.bubbleOutText, fallbackBase.tokens.bubbleOutText),
      replyAccent: sanitizeColorString(rawTokens.replyAccent, fallbackBase.tokens.replyAccent),
      selectedMessage: sanitizeColorString(rawTokens.selectedMessage, fallbackBase.tokens.selectedMessage),
      timestamp: sanitizeColorString(rawTokens.timestamp, fallbackBase.tokens.timestamp),
      topBar: sanitizeColorString(rawTokens.topBar, fallbackBase.tokens.topBar),
      tabBg: sanitizeColorString(rawTokens.tabBg, fallbackBase.tokens.tabBg),
      tabSelected: sanitizeColorString(rawTokens.tabSelected, fallbackBase.tokens.tabSelected),
      border: sanitizeColorString(rawTokens.border, fallbackBase.tokens.border),
      searchBg: sanitizeColorString(rawTokens.searchBg, fallbackBase.tokens.searchBg),
      actionButton: sanitizeColorString(rawTokens.actionButton, fallbackBase.tokens.actionButton),
      mediaOverlay: sanitizeColorString(rawTokens.mediaOverlay, fallbackBase.tokens.mediaOverlay),
      progressBar: sanitizeColorString(rawTokens.progressBar, fallbackBase.tokens.progressBar),
      switchActive: sanitizeColorString(rawTokens.switchActive, fallbackBase.tokens.switchActive),
      checkboxActive: sanitizeColorString(rawTokens.checkboxActive, fallbackBase.tokens.checkboxActive),
      iconTint: sanitizeColorString(rawTokens.iconTint, fallbackBase.tokens.iconTint),
    };

    const newTheme: TeleForgeTheme = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${themeCandidate.name.trim()} (Imported)`,
      mode,
      isCustom: true,
      tokens: sanitizedTokens,
    };

    return { success: true, theme: newTheme };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to parse theme JSON.' };
  }
}
