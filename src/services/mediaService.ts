// High-Resolution Message Media Service for TeleForge
// Caches message photos, videos, and files in memory and IndexedDB.
// Downloads directly via MTProto client without requiring any backend server.

import { telegramDirectClient } from './telegramDirectClient';

const DB_NAME = 'teleforge_media_cache';
const STORE_NAME = 'media';
const DB_VERSION = 1;

// In-memory cache for 0ms lookups
const memoryCache = new Map<string, string>(); // `${chatId}_${messageId}` -> base64 data URL
const inflightPromises = new Map<string, Promise<string>>();
const subscribers = new Map<string, Set<(url: string) => void>>();
const progressSubscribers = new Map<string, Set<(pct: number, dl: number, tot: number) => void>>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function getFromIndexedDB(key: string): Promise<string | null> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

async function putToIndexedDB(key: string, value: string): Promise<void> {
  try {
    // Only store media up to 10MB in IndexedDB to prevent quota exhaustion
    if (value.length > 10 * 1024 * 1024) return;
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
  } catch (e) {}
}

function notifySubscribers(key: string, url: string): void {
  const subs = subscribers.get(key);
  if (subs) {
    subs.forEach((cb) => {
      try {
        cb(url);
      } catch (e) {}
    });
  }
}

function notifyProgressSubscribers(key: string, pct: number, dl: number, tot: number): void {
  const subs = progressSubscribers.get(key);
  if (subs) {
    subs.forEach((cb) => {
      try {
        cb(pct, dl, tot);
      } catch (e) {}
    });
  }
}

// Download queue for message media
const downloadQueue: Array<() => Promise<void>> = [];
let activeWorkers = 0;
const MAX_CONCURRENT_DOWNLOADS = 4;

function withMediaTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: any;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Media download timed out')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function enqueueDownload(fn: () => Promise<void>) {
  downloadQueue.push(fn);
  processQueue();
}

function processQueue() {
  while (activeWorkers < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length > 0) {
    activeWorkers++;
    const nextFn = downloadQueue.shift();
    if (nextFn) {
      (async () => {
        try {
          await withMediaTimeout(nextFn(), 20000);
        } catch (e) {
        } finally {
          activeWorkers--;
          processQueue();
        }
      })();
    } else {
      activeWorkers--;
    }
  }
}

export const mediaService = {
  /**
   * Synchronous check if media is already cached in memory
   */
  get(chatId: string, messageId: string | number, options?: { fullRes?: boolean; fullVideo?: boolean }): string | null {
    if (!chatId || messageId == null) return null;
    const suffix = options?.fullVideo ? '_video' : options?.fullRes ? '_fullres' : '';
    const key = `${chatId}_${messageId}${suffix}`;
    return memoryCache.get(key) || null;
  },

  /**
   * Store media data URL in memory and IndexedDB
   */
  set(chatId: string, messageId: string | number, dataUrl: string, options?: { fullRes?: boolean; fullVideo?: boolean }): void {
    if (!chatId || messageId == null || !dataUrl) return;
    const suffix = options?.fullVideo ? '_video' : options?.fullRes ? '_fullres' : '';
    const key = `${chatId}_${messageId}${suffix}`;
    memoryCache.set(key, dataUrl);
    if (dataUrl.startsWith('data:')) {
      putToIndexedDB(key, dataUrl);
    }
    notifySubscribers(key, dataUrl);
  },

  /**
   * Subscribe to media download updates
   */
  subscribe(
    chatId: string,
    messageId: string | number,
    callback: (url: string) => void,
    options?: { fullRes?: boolean; fullVideo?: boolean }
  ): () => void {
    const suffix = options?.fullVideo ? '_video' : options?.fullRes ? '_fullres' : '';
    const key = `${chatId}_${messageId}${suffix}`;
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key)!.add(callback);

    const cached = memoryCache.get(key);
    if (cached) {
      callback(cached);
    } else {
      getFromIndexedDB(key).then((idbVal) => {
        if (idbVal && idbVal.length > 5) {
          memoryCache.set(key, idbVal);
          callback(idbVal);
        }
      });
    }

    return () => {
      const subs = subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) subscribers.delete(key);
      }
    };
  },

  /**
   * Subscribe to download progress updates (pct: 0-100, downloaded bytes, total bytes)
   */
  subscribeProgress(
    chatId: string,
    messageId: string | number,
    callback: (pct: number, dl: number, tot: number) => void,
    options?: { fullRes?: boolean; fullVideo?: boolean }
  ): () => void {
    const suffix = options?.fullVideo ? '_video' : options?.fullRes ? '_fullres' : '';
    const key = `${chatId}_${messageId}${suffix}`;
    if (!progressSubscribers.has(key)) {
      progressSubscribers.set(key, new Set());
    }
    progressSubscribers.get(key)!.add(callback);

    return () => {
      const subs = progressSubscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) progressSubscribers.delete(key);
      }
    };
  },

  /**
   * Load media directly via MTProto
   */
  async loadMedia(
    chatId: string,
    messageId: string | number,
    options?: {
      fullRes?: boolean;
      fullVideo?: boolean;
      onProgress?: (pct: number, dl: number, tot: number) => void;
    }
  ): Promise<string> {
    if (!chatId || messageId == null) return '';
    const suffix = options?.fullVideo ? '_video' : options?.fullRes ? '_fullres' : '';
    const key = `${chatId}_${messageId}${suffix}`;

    if (memoryCache.has(key)) {
      return memoryCache.get(key)!;
    }

    if (inflightPromises.has(key)) {
      return inflightPromises.get(key)!;
    }

    const promise = (async () => {
      try {
        const idbVal = await getFromIndexedDB(key);
        if (idbVal && idbVal.length > 5) {
          memoryCache.set(key, idbVal);
          notifySubscribers(key, idbVal);
          return idbVal;
        }
      } catch (e) {}

      // For full video playback, bypass background queue and download immediately with high priority
      if (options?.fullVideo) {
        try {
          const res = await telegramDirectClient.downloadMessageMedia(chatId, messageId, {
            ...options,
            onProgress: (pct, dl, tot) => {
              notifyProgressSubscribers(key, pct, dl, tot);
              options?.onProgress?.(pct, dl, tot);
            },
          });
          if (res && res.dataUrl) {
            memoryCache.set(key, res.dataUrl);
            notifySubscribers(key, res.dataUrl);
            return res.dataUrl;
          }
          return '';
        } catch (err) {
          return '';
        }
      }

      return new Promise<string>((resolve) => {
        enqueueDownload(async () => {
          try {
            const res = await withMediaTimeout(
              telegramDirectClient.downloadMessageMedia(chatId, messageId, options),
              15000
            ).catch(() => null);
            if (res && res.dataUrl && res.dataUrl.length > 5) {
              memoryCache.set(key, res.dataUrl);
              if (res.dataUrl.startsWith('data:')) {
                putToIndexedDB(key, res.dataUrl);
              }
              notifySubscribers(key, res.dataUrl);
              resolve(res.dataUrl);
            } else {
              resolve('');
            }
          } catch (err) {
            resolve('');
          }
        });
      });
    })().finally(() => {
      inflightPromises.delete(key);
    });

    inflightPromises.set(key, promise);
    return promise;
  },

  /**
   * Preload media for visible messages in chat
   */
  preloadMedia(items: { chatId: string; messageId: string | number }[]): void {
    for (const item of items) {
      if (!item.chatId || item.messageId == null) continue;
      const key = `${item.chatId}_${item.messageId}`;
      if (!memoryCache.has(key)) {
        this.loadMedia(item.chatId, item.messageId).catch(() => {});
      }
    }
  },
};
