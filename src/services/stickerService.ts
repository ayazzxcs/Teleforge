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

  /**
   * Batch-add multiple stickers into the user's custom stickers at once
   */
  addCustomStickersBatch(
    items: Array<{
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
    }>
  ): number {
    if (!items || items.length === 0) return 0;
    const current = this.getCustomStickers();
    const existingIds = new Set(current.map((s) => s.id));
    const existingDocs = new Set(current.map((s) => s.documentId).filter(Boolean));
    const existingUrls = new Set(current.map((s) => s.url).filter(Boolean));

    const toAdd: CustomSticker[] = [];

    for (const item of items) {
      const effectiveId = item.id || item.documentId || `stk-batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const effectiveUrl = item.url || item.thumbUrl || '';

      if (
        existingIds.has(effectiveId) ||
        (item.documentId && existingDocs.has(item.documentId)) ||
        (effectiveUrl && existingUrls.has(effectiveUrl))
      ) {
        continue;
      }

      existingIds.add(effectiveId);
      if (item.documentId) existingDocs.add(item.documentId);
      if (effectiveUrl) existingUrls.add(effectiveUrl);

      toAdd.push({
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
      });
    }

    if (toAdd.length > 0) {
      cachedStickers = [...toAdd, ...current];
      saveToStorage(cachedStickers);
    }

    return toAdd.length;
  },

  /**
   * Add an entire sticker pack (saves all stickers locally & installs in Telegram cloud)
   */
  async addStickerPack(pack: {
    id?: string;
    accessHash?: string;
    shortName?: string;
    title?: string;
    stickers?: Array<any>;
  }): Promise<{ addedCount: number; success: boolean }> {
    try {
      if (pack.id || pack.shortName) {
        await telegramDirectClient.installStickerSet({
          id: pack.id,
          accessHash: pack.accessHash,
          shortName: pack.shortName,
        }).catch(() => {});
      }

      let stickers = pack.stickers || [];
      if (stickers.length === 0 && (pack.id || pack.shortName)) {
        const full = await telegramDirectClient.getStickerSet({
          id: pack.id,
          accessHash: pack.accessHash,
          shortName: pack.shortName,
        });
        if (full?.stickers) {
          stickers = full.stickers;
        }
      }

      const mapped = stickers.map((stk: any) => ({
        id: stk.documentId || stk.id,
        name: stk.emoji ? `${pack.title || 'Sticker'} ${stk.emoji}` : (pack.title || 'Sticker'),
        emoji: stk.emoji,
        url: stk.thumbUrl || stk.url || '',
        thumbUrl: stk.thumbUrl || stk.url || '',
        stickerSet: {
          id: pack.id,
          accessHash: pack.accessHash,
          shortName: pack.shortName,
          title: pack.title,
        },
        documentId: stk.documentId || stk.id,
        accessHash: stk.accessHash,
        fileReference: stk.fileReference,
        rawDoc: stk.rawDoc,
      }));

      const addedCount = this.addCustomStickersBatch(mapped);
      return { addedCount, success: true };
    } catch (e) {
      console.warn('[StickerService] Failed to add sticker pack:', e);
      return { addedCount: 0, success: false };
    }
  },

  /**
   * Check if an entire sticker pack is already saved
   */
  isPackSaved(packIdOrShortName?: string): boolean {
    if (!packIdOrShortName) return false;
    const current = this.getCustomStickers();
    return current.some(
      (s) =>
        s.stickerSet?.id === packIdOrShortName ||
        s.stickerSet?.shortName === packIdOrShortName
    );
  },

  /**
   * Remove all stickers belonging to a pack
   */
  removeStickerPack(packIdOrShortName: string): void {
    if (!packIdOrShortName) return;
    const current = this.getCustomStickers();
    const filtered = current.filter(
      (s) =>
        s.stickerSet?.id !== packIdOrShortName &&
        s.stickerSet?.shortName !== packIdOrShortName
    );
    cachedStickers = filtered;
    saveToStorage(cachedStickers);
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
