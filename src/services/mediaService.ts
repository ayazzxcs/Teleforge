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

// Download queue for message media
const downloadQueue: Array<() => Promise<void>> = [];
let activeWorkers = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;

function enqueueDownload(fn: () => Promise<void>) {
  downloadQueue.push(fn);
  processQueue();
}

async function processQueue() {
  if (activeWorkers >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) return;
  activeWorkers++;
  const nextFn = downloadQueue.shift();
  if (nextFn) {
    try {
      await nextFn();
    } catch (e) {
    } finally {
      activeWorkers--;
      processQueue();
    }
  } else {
    activeWorkers--;
  }
}

export const mediaService = {
  /**
   * Synchronous check if media is already cached in memory
   */
  get(chatId: string, messageId: string | number): string | null {
    if (!chatId || messageId == null) return null;
    const key = `${chatId}_${messageId}`;
    return memoryCache.get(key) || null;
  },

  /**
   * Store media data URL in memory and IndexedDB
   */
  set(chatId: string, messageId: string | number, dataUrl: string): void {
    if (!chatId || messageId == null || !dataUrl) return;
    const key = `${chatId}_${messageId}`;
    memoryCache.set(key, dataUrl);
    putToIndexedDB(key, dataUrl);
    notifySubscribers(key, dataUrl);
  },

  /**
   * Subscribe to media download updates
   */
  subscribe(chatId: string, messageId: string | number, callback: (url: string) => void): () => void {
    const key = `${chatId}_${messageId}`;
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    subscribers.get(key)!.add(callback);

    const cached = memoryCache.get(key);
    if (cached) {
      callback(cached);
    } else {
      getFromIndexedDB(key).then((idbVal) => {
        if (idbVal) {
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
   * Load media directly via MTProto
   */
  async loadMedia(chatId: string, messageId: string | number): Promise<string> {
    if (!chatId || messageId == null) return '';
    const key = `${chatId}_${messageId}`;

    if (memoryCache.has(key)) {
      return memoryCache.get(key)!;
    }

    if (inflightPromises.has(key)) {
      return inflightPromises.get(key)!;
    }

    const promise = (async () => {
      try {
        const idbVal = await getFromIndexedDB(key);
        if (idbVal && idbVal.length > 100) {
          memoryCache.set(key, idbVal);
          notifySubscribers(key, idbVal);
          return idbVal;
        }
      } catch (e) {}

      return new Promise<string>((resolve) => {
        enqueueDownload(async () => {
          try {
            const res = await telegramDirectClient.downloadMessageMedia(chatId, messageId);
            if (res && res.dataUrl && res.dataUrl.length > 100) {
              memoryCache.set(key, res.dataUrl);
              putToIndexedDB(key, res.dataUrl);
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
