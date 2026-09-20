// Service for managing custom stickers and Telegram sticker packs in TeleForge
// Persists user-added custom stickers to localStorage and notifies listeners in real-time.

import { telegramApi } from './telegramApi';

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
        telegramApi.installStickerSet(item.stickerSet).catch(() => {});
      } else if (item.documentId && item.accessHash) {
        telegramApi.faveSticker(item.documentId, item.accessHash, item.fileReference).catch(() => {});
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
    let updatedExisting = false;

    for (const item of items) {
      const effectiveId = item.id || item.documentId || `stk-batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const effectiveUrl = item.url || item.thumbUrl || '';

      // Check if this sticker is already in the collection
      const existingIdx = current.findIndex(
        (s) => (item.documentId && s.documentId === item.documentId) || s.id === effectiveId || (effectiveUrl && s.url === effectiveUrl)
      );
      if (existingIdx !== -1) {
        // Enrich existing sticker with stickerSet metadata if missing
        if (item.stickerSet && (!current[existingIdx].stickerSet || !current[existingIdx].stickerSet?.id)) {
          current[existingIdx].stickerSet = {
            ...current[existingIdx].stickerSet,
            ...item.stickerSet,
          };
          updatedExisting = true;
        }
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

    if (toAdd.length > 0 || updatedExisting) {
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
      const packId = pack.id ? String(pack.id).trim() : '';
      const packAccessHash = pack.accessHash ? String(pack.accessHash).trim() : '';
      const packShortName = pack.shortName ? String(pack.shortName).trim() : '';
      const packTitle = pack.title || 'Sticker Pack';

      // 1. Sync with Telegram cloud via unified API (works on both Android and Web backend)
      if (packId || packShortName) {
        telegramApi.installStickerSet({
          id: packId,
          accessHash: packAccessHash,
          shortName: packShortName,
        }).catch(() => {});
      }

      // 2. Resolve stickers array
      let stickers: Array<any> = Array.isArray(pack.stickers) && pack.stickers.length > 0 ? [...pack.stickers] : [];
      if (stickers.length === 0 && (packId || packShortName)) {
        try {
          const full = await telegramApi.getStickerSet({
            id: packId,
            accessHash: packAccessHash,
            shortName: packShortName,
          });
          if (full?.stickers && full.stickers.length > 0) {
            stickers = full.stickers;
          }
        } catch (e) {}
      }

      if (stickers.length === 0) {
        return { addedCount: 0, success: false };
      }

      const mapped = stickers.map((stk: any) => ({
        id: stk.documentId || stk.id,
        name: stk.emoji ? `${packTitle} ${stk.emoji}` : packTitle,
        emoji: stk.emoji,
        url: stk.thumbUrl || stk.url || '',
        thumbUrl: stk.thumbUrl || stk.url || '',
        stickerSet: {
          id: packId,
          accessHash: packAccessHash,
          shortName: packShortName,
          title: packTitle,
        },
        documentId: stk.documentId || stk.id,
        accessHash: stk.accessHash,
        fileReference: stk.fileReference,
        rawDoc: stk.rawDoc,
      }));

      const addedCount = this.addCustomStickersBatch(mapped);
      return { addedCount: addedCount > 0 ? addedCount : mapped.length, success: true };
    } catch (e) {
      console.warn('[StickerService] Failed to add sticker pack:', e);
      return { addedCount: 0, success: false };
    }
  },

  /**
   * Check if an entire sticker pack is already saved (by pack ID or shortName)
   */
  isPackSaved(packId?: string, shortName?: string): boolean {
    if (!packId && !shortName) return false;
    const current = this.getCustomStickers();
    const idStr = packId ? String(packId).trim() : '';
    const nameStr = shortName ? String(shortName).trim().toLowerCase() : '';

    return current.some((s) => {
      const sId = s.stickerSet?.id ? String(s.stickerSet.id).trim() : '';
      const sName = s.stickerSet?.shortName ? String(s.stickerSet.shortName).trim().toLowerCase() : '';
      return Boolean(
        (idStr && (sId === idStr || sName === idStr.toLowerCase())) ||
        (nameStr && (sName === nameStr || sId === nameStr))
      );
    });
  },

  /**
   * Remove all stickers belonging to a pack
   */
  removeStickerPack(packId?: string, shortName?: string): void {
    if (!packId && !shortName) return;
    const current = this.getCustomStickers();
    const idStr = packId ? String(packId).trim() : '';
    const nameStr = shortName ? String(shortName).trim().toLowerCase() : '';

    const filtered = current.filter((s) => {
      const sId = s.stickerSet?.id ? String(s.stickerSet.id).trim() : '';
      const sName = s.stickerSet?.shortName ? String(s.stickerSet.shortName).trim().toLowerCase() : '';
      const matchesId = Boolean(idStr && (sId === idStr || sName === idStr.toLowerCase()));
      const matchesName = Boolean(nameStr && (sName === nameStr || sId === nameStr));
      return !matchesId && !matchesName;
    });

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
