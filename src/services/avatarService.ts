// High-Resolution Avatar Service for TeleForge
// Manages memory cache, IndexedDB persistent cache, and direct MTProto downloads
// Guarantees crystal-clear profile pictures for users, chats, groups, and channels.

import { telegramDirectClient } from './telegramDirectClient';

const DB_NAME = 'teleforge_avatar_cache';
const STORE_NAME = 'avatars';
const DB_VERSION = 1;

// In-memory cache for 0ms lookups
const memoryCache = new Map<string, string>(); // peerId -> base64 data URL
const inflightPromises = new Map<string, Promise<string>>(); // peerId -> Promise
const subscribers = new Map<string, Set<(url: string) => void>>(); // peerId -> Set of callbacks

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
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
  } catch (e) {}
}

async function deleteFromIndexedDB(key: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
  } catch (e) {}
}

function notifySubscribers(peerId: string, url: string): void {
  const subs = subscribers.get(peerId);
  if (subs) {
    subs.forEach((cb) => {
      try {
        cb(url);
      } catch (e) {}
    });
  }
}

// Concurrency queue for background avatar downloads
const downloadQueue: Array<() => Promise<void>> = [];
let activeWorkers = 0;
const MAX_CONCURRENT_DOWNLOADS = 3;

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

export const avatarService = {
  /**
   * Synchronous check if avatar is already cached in memory
   */
  get(peerId?: string | null): string | null {
    if (!peerId) return null;
    const cleanId = String(peerId).trim();
    const direct = memoryCache.get(cleanId);
    if (direct) return direct;
    if (cleanId.startsWith('-100')) {
      return memoryCache.get(cleanId.slice(4)) || memoryCache.get(`-${cleanId.slice(4)}`) || null;
    } else if (cleanId.startsWith('-')) {
      return memoryCache.get(cleanId.slice(1)) || memoryCache.get(`-100${cleanId.slice(1)}`) || null;
    } else {
      return memoryCache.get(`-100${cleanId}`) || memoryCache.get(`-${cleanId}`) || null;
    }
  },

  /**
   * Remove avatar from memory and IndexedDB, notifying active subscribers
   */
  deleteAvatar(peerId?: string | null): void {
    if (!peerId) return;
    const cleanId = String(peerId).trim();
    memoryCache.delete(cleanId);
    deleteFromIndexedDB(cleanId);
    notifySubscribers(cleanId, '');

    if (cleanId === 'me' || cleanId === 'user-me') {
      try {
        const cachedUser = localStorage.getItem('teleforge_cached_user');
        if (cachedUser) {
          const u = JSON.parse(cachedUser);
          if (u.id) {
            const idStr = String(u.id);
            memoryCache.delete(idStr);
            deleteFromIndexedDB(idStr);
            notifySubscribers(idStr, '');
          }
        }
      } catch (e) {}
    } else {
      try {
        const cachedUser = localStorage.getItem('teleforge_cached_user');
        if (cachedUser) {
          const u = JSON.parse(cachedUser);
          if (u.id && String(u.id) === cleanId) {
            memoryCache.delete('me');
            deleteFromIndexedDB('me');
            notifySubscribers('me', '');
            memoryCache.delete('user-me');
            deleteFromIndexedDB('user-me');
            notifySubscribers('user-me', '');
          }
        }
      } catch (e) {}
    }

    if (cleanId.startsWith('-100')) {
      const bare = cleanId.slice(4);
      memoryCache.delete(bare);
      deleteFromIndexedDB(bare);
      notifySubscribers(bare, '');
    } else if (cleanId.startsWith('-')) {
      const bare = cleanId.slice(1);
      memoryCache.delete(bare);
      deleteFromIndexedDB(bare);
      notifySubscribers(bare, '');
    }
  },

  /**
   * Store high-res avatar in memory and IndexedDB, notifying any active UI components
   */
  setAvatar(peerId: string, dataUrl: string): void {
    if (!peerId) return;
    if (!dataUrl) {
      this.deleteAvatar(peerId);
      return;
    }
    const cleanId = String(peerId).trim();
    memoryCache.set(cleanId, dataUrl);
    putToIndexedDB(cleanId, dataUrl);
    notifySubscribers(cleanId, dataUrl);

    if (cleanId === 'me' || cleanId === 'user-me') {
      try {
        const cachedUser = localStorage.getItem('teleforge_cached_user');
        if (cachedUser) {
          const u = JSON.parse(cachedUser);
          if (u.id && String(u.id) !== cleanId) {
            const idStr = String(u.id);
            memoryCache.set(idStr, dataUrl);
            putToIndexedDB(idStr, dataUrl);
            notifySubscribers(idStr, dataUrl);
          }
        }
      } catch (e) {}
    } else {
      try {
        const cachedUser = localStorage.getItem('teleforge_cached_user');
        if (cachedUser) {
          const u = JSON.parse(cachedUser);
          if (u.id && String(u.id) === cleanId) {
            memoryCache.set('me', dataUrl);
            putToIndexedDB('me', dataUrl);
            notifySubscribers('me', dataUrl);
            memoryCache.set('user-me', dataUrl);
            putToIndexedDB('user-me', dataUrl);
            notifySubscribers('user-me', dataUrl);
          }
        }
      } catch (e) {}
    }

    if (cleanId.startsWith('-100')) {
      const bare = cleanId.slice(4);
      memoryCache.set(bare, dataUrl);
      putToIndexedDB(bare, dataUrl);
      notifySubscribers(bare, dataUrl);
    } else if (cleanId.startsWith('-')) {
      const bare = cleanId.slice(1);
      memoryCache.set(bare, dataUrl);
      putToIndexedDB(bare, dataUrl);
      notifySubscribers(bare, dataUrl);
    }
  },

  /**
   * Subscribe to avatar updates for a given peer ID. Returns unsubscribe function.
   */
  subscribe(peerId: string, callback: (url: string) => void): () => void {
    const cleanId = String(peerId).trim();
    if (!subscribers.has(cleanId)) {
      subscribers.set(cleanId, new Set());
    }
    subscribers.get(cleanId)!.add(callback);

    // If already in memory, invoke callback immediately
    const cached = this.get(cleanId);
    if (cached) {
      callback(cached);
    } else {
      // Check IndexedDB asynchronously
      getFromIndexedDB(cleanId).then((idbUrl) => {
        if (idbUrl) {
          memoryCache.set(cleanId, idbUrl);
          callback(idbUrl);
        }
      });
    }

    return () => {
      const subs = subscribers.get(cleanId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) subscribers.delete(cleanId);
      }
    };
  },

  /**
   * Asynchronously load high-resolution avatar for a peer.
   * Checks Memory -> IndexedDB -> Direct MTProto download.
   */
  async loadAvatar(peerId: string, isBig = false): Promise<string> {
    if (!peerId) return '';
    const cleanId = String(peerId).trim();

    // 1. In-memory cache (0ms)
    const cached = this.get(cleanId);
    if (cached) {
      return cached;
    }

    // 2. In-flight download deduplication
    if (inflightPromises.has(cleanId)) {
      return inflightPromises.get(cleanId)!;
    }

    const promise = (async () => {
      // 3. Persistent IndexedDB check (<5ms)
      try {
        let idbVal = await getFromIndexedDB(cleanId);
        if (!idbVal && cleanId.startsWith('-100')) {
          idbVal = await getFromIndexedDB(cleanId.slice(4));
        } else if (!idbVal && cleanId.startsWith('-')) {
          idbVal = await getFromIndexedDB(cleanId.slice(1));
        }
        if (idbVal && idbVal.length > 200) {
          memoryCache.set(cleanId, idbVal);
          notifySubscribers(cleanId, idbVal);
          return idbVal;
        }
      } catch (e) {}

      return new Promise<string>((resolve) => {
        enqueueDownload(async () => {
          try {
            let dataUrl = '';
            try {
              dataUrl = await telegramDirectClient.downloadAvatarUrl(cleanId, isBig);
            } catch (e) {}

            // Fallback to backend avatar endpoint on localhost/web or if direct client failed
            if (!dataUrl && typeof fetch !== 'undefined') {
              try {
                const res = await fetch(`/api/telegram/avatar?id=${encodeURIComponent(cleanId)}&v=${isBig ? 'big' : '1'}`);
                if (res.ok) {
                  const blob = await res.blob();
                  if (blob.size > 200) {
                    dataUrl = await new Promise<string>((resBlob) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resBlob(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  }
                }
              } catch (e) {}
            }

            if (dataUrl && dataUrl.length > 200) {
              memoryCache.set(cleanId, dataUrl);
              putToIndexedDB(cleanId, dataUrl);
              notifySubscribers(cleanId, dataUrl);
              resolve(dataUrl);
            } else {
              resolve('');
            }
          } catch (err) {
            resolve('');
          }
        });
      });
    })().finally(() => {
      inflightPromises.delete(cleanId);
    });

    inflightPromises.set(cleanId, promise);
    return promise;
  },

  /**
   * Preload high-res avatars in the background for a list of dialogs/peers
   */
  preloadAvatars(peerIds: string[]): void {
    for (const id of peerIds) {
      if (!id) continue;
      const clean = String(id).trim();
      if (!memoryCache.has(clean)) {
        this.loadAvatar(clean, false).catch(() => {});
      }
    }
  },
};
