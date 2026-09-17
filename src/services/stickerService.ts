// Service for managing custom stickers and Telegram sticker packs in TeleForge
// Persists user-added custom stickers to localStorage and notifies listeners in real-time.

import { telegramDirectClient } from './telegramDirectClient';

const CUSTOM_STICKERS_KEY = 'teleforge_custom_stickers';

export interface CustomSticker {
  id: string;
  name: string;
  emoji?: string;
  url: string;
  thumbUrl?: string;
  dateAdded: number;
  stickerSet?: {
    id?: string;
    accessHash?: string;
    shortName?: string;
    title?: string;
  };
  documentId?: string;
  accessHash?: string;
  fileReference?: string;
  rawDoc?: any;
}

type StickerListener = () => void;
const listeners = new Set<StickerListener>();

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[StickerService] Listener error:', e);
    }
  });
}

function loadFromStorage(): CustomSticker[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STICKERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[StickerService] Failed to load custom stickers:', e);
    return [];
  }
}

function saveToStorage(stickers: CustomSticker[]) {
  try {
    localStorage.setItem(CUSTOM_STICKERS_KEY, JSON.stringify(stickers));
    notifyListeners();
  } catch (e) {
    console.error('[StickerService] Failed to save custom stickers:', e);
  }
}

let cachedStickers: CustomSticker[] | null = null;

export const stickerService = {
  getCustomStickers(): CustomSticker[] {
    if (!cachedStickers) {
      cachedStickers = loadFromStorage();
    }
    return cachedStickers;
  },

  addCustomSticker(item: {
    id?: string;
    name?: string;
    emoji?: string;
    url: string;
    thumbUrl?: string;
    stickerSet?: {
      id?: string;
      accessHash?: string;
      shortName?: string;
      title?: string;
    };
    documentId?: string;
    accessHash?: string;
    fileReference?: string;
    rawDoc?: any;
  }): boolean {
    const current = this.getCustomStickers();
    const effectiveId = item.id || item.documentId || `stk-custom-${Date.now()}`;
    const effectiveUrl = item.url || item.thumbUrl || '';

    // Check if already saved
    const exists = current.some(
      (s) => s.id === effectiveId || (effectiveUrl && s.url === effectiveUrl) || (item.documentId && s.documentId === item.documentId)
    );
    if (exists) {
      return false;
    }

    const newSticker: CustomSticker = {
      id: effectiveId,
      name: item.name || (item.emoji ? `Sticker ${item.emoji}` : 'Custom Sticker'),
      emoji: item.emoji,
      url: effectiveUrl,
      thumbUrl: item.thumbUrl || effectiveUrl,
      dateAdded: Date.now(),
      stickerSet: item.stickerSet,
      documentId: item.documentId,
      accessHash: item.accessHash,
      fileReference: item.fileReference,
      rawDoc: item.rawDoc,
    };

    cachedStickers = [newSticker, ...current];
    saveToStorage(cachedStickers);

    // Sync with Telegram cloud MTProto if available
    try {
      if (item.stickerSet?.id && item.stickerSet?.accessHash) {
        telegramDirectClient.installStickerSet(item.stickerSet).catch(() => {});
      } else if (item.documentId && item.accessHash) {
        telegramDirectClient.faveSticker(item.documentId, item.accessHash, item.fileReference).catch(() => {});
      }
    } catch (e) {}

    return true;
  },

  removeCustomSticker(idOrUrl: string): void {
    const current = this.getCustomStickers();
    const filtered = current.filter((s) => s.id !== idOrUrl && s.url !== idOrUrl && s.documentId !== idOrUrl);
    cachedStickers = filtered;
    saveToStorage(cachedStickers);
  },

  isStickerSaved(idOrUrl?: string): boolean {
    if (!idOrUrl) return false;
    const current = this.getCustomStickers();
    return current.some((s) => s.id === idOrUrl || s.url === idOrUrl || s.documentId === idOrUrl);
  },

  subscribe(callback: StickerListener): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};
