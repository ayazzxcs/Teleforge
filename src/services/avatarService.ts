// High-Resolution Avatar Service for TeleForge
// Manages memory cache, IndexedDB persistent cache, and direct MTProto downloads
// Guarantees crystal-clear profile pictures for users, chats, groups, and channels.

import { telegramDirectClient, setAvatarListener } from './telegramDirectClient';

const DB_NAME = 'teleforge_avatar_cache';
const STORE_NAME = 'avatars';
const DB_VERSION = 1;

// In-memory cache for 0ms lookups
const memoryCache = new Map<string, string>(); // peerId -> genuine HIGH-RES base64/blob data URL (>= 8KB)
const thumbCache = new Map<string, string>(); // peerId -> low-res stripped preview thumbnail (< 8KB)
const negativeCache = new Set<string>(); // peerId -> known missing avatar (avoids infinite re-requesting)
const inflightPromises = new Map<string, Promise<string>>(); // peerId -> Promise
const subscribers = new Map<string, Set<(url: string) => void>>(); // peerId -> Set of callbacks

setAvatarListener((peerId, dataUrl, isHighRes) => {
  if (isHighRes || (dataUrl && dataUrl.length >= 8000)) {
    avatarService.setAvatar(peerId, dataUrl);
  } else {
    avatarService.setThumb(peerId, dataUrl);
  }
});

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
const isMobileClient = typeof window !== 'undefined' && Boolean((window as any).TeleForgeBridge || window.innerWidth < 768);
const MAX_CONCURRENT_DOWNLOADS = isMobileClient ? 3 : 4;

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
   * Synchronous check if genuine HIGH-RES avatar is already cached in memory
   */
  get(peerId?: string | null): string | null {
    if (!peerId) return null;
    const cleanId = String(peerId).trim();
    const direct = memoryCache.get(cleanId);
    if (direct && direct.length >= 8000) return direct;
    if (cleanId.startsWith('-100')) {
      const v = memoryCache.get(cleanId.slice(4)) || memoryCache.get(`-${cleanId.slice(4)}`);
      return (v && v.length >= 8000) ? v : null;
    } else if (cleanId.startsWith('-')) {
      const v = memoryCache.get(cleanId.slice(1)) || memoryCache.get(`-100${cleanId.slice(1)}`);
      return (v && v.length >= 8000) ? v : null;
    } else {
      const v = memoryCache.get(`-100${cleanId}`) || memoryCache.get(`-${cleanId}`);
      return (v && v.length >= 8000) ? v : null;
    }
  },

  /**
   * Get instant 0ms preview thumbnail (< 8KB stripped thumbnail)
   */
  getThumb(peerId?: string | null): string | null {
    if (!peerId) return null;
    const cleanId = String(peerId).trim();
    const thumb = thumbCache.get(cleanId) || memoryCache.get(cleanId);
    if (thumb) return thumb;
    if (cleanId.startsWith('-100')) {
      return thumbCache.get(cleanId.slice(4)) || thumbCache.get(`-${cleanId.slice(4)}`) || null;
    } else if (cleanId.startsWith('-')) {
      return thumbCache.get(cleanId.slice(1)) || thumbCache.get(`-100${cleanId.slice(1)}`) || null;
    } else {
      return thumbCache.get(`-100${cleanId}`) || thumbCache.get(`-${cleanId}`) || null;
    }
  },

  /**
   * Store instant preview thumbnail (does NOT satisfy high-res cache)
   */
  setThumb(peerId: string, dataUrl: string): void {
    if (!peerId || !dataUrl) return;
    const cleanId = String(peerId).trim();
    thumbCache.set(cleanId, dataUrl);
    if (cleanId.startsWith('-100')) {
      thumbCache.set(cleanId.slice(4), dataUrl);
      thumbCache.set(`-${cleanId.slice(4)}`, dataUrl);
    } else if (cleanId.startsWith('-')) {
      thumbCache.set(cleanId.slice(1), dataUrl);
      thumbCache.set(`-100${cleanId.slice(1)}`, dataUrl);
    } else {
      thumbCache.set(`-100${cleanId}`, dataUrl);
      thumbCache.set(`-${cleanId}`, dataUrl);
    }
  },

  /**
   * Remove avatar from memory and IndexedDB, notifying active subscribers
   */
  deleteAvatar(peerId?: string | null): void {
    if (!peerId) return;
    const cleanId = String(peerId).trim();
    memoryCache.delete(cleanId);
    thumbCache.delete(cleanId);
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
            thumbCache.delete(idStr);
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
            thumbCache.delete('me');
            deleteFromIndexedDB('me');
            notifySubscribers('me', '');
            memoryCache.delete('user-me');
            thumbCache.delete('user-me');
            deleteFromIndexedDB('user-me');
            notifySubscribers('user-me', '');
          }
        }
      } catch (e) {}
    }

    if (cleanId.startsWith('-100')) {
      const bare = cleanId.slice(4);
      memoryCache.delete(bare);
      thumbCache.delete(bare);
      deleteFromIndexedDB(bare);
      notifySubscribers(bare, '');
    } else if (cleanId.startsWith('-')) {
      const bare = cleanId.slice(1);
      memoryCache.delete(bare);
      thumbCache.delete(bare);
      deleteFromIndexedDB(bare);
      notifySubscribers(bare, '');
    }
  },

  /**
   * Store genuine high-res avatar in memory and IndexedDB, notifying any active UI components
   */
  setAvatar(peerId: string, dataUrl: string): void {
    if (!peerId) return;
    if (!dataUrl) {
      this.deleteAvatar(peerId);
      return;
    }
    // If it's a micro-thumbnail (< 8KB), only store in thumbCache, never as high-res!
    if (dataUrl.startsWith('data:image/') && dataUrl.length < 8000) {
      this.setThumb(peerId, dataUrl);
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

    // If already in memory and genuinely high-res, invoke callback immediately
    const cached = this.get(cleanId);
    if (cached && cached.length >= 8000) {
      callback(cached);
    } else {
      // Check IndexedDB asynchronously for high-res avatar
      getFromIndexedDB(cleanId).then((idbUrl) => {
        if (idbUrl && idbUrl.length >= 8000) {
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

    // 0. Known missing avatar check (<0ms)
    if (negativeCache.has(cleanId)) {
      return '';
    }

    // 1. In-memory cache (0ms) - only if genuinely high-res
    const cached = this.get(cleanId);
    if (cached && cached.length >= 8000) {
      return cached;
    }

    // 2. In-flight download deduplication
    if (inflightPromises.has(cleanId)) {
      return inflightPromises.get(cleanId)!;
    }

    const promise = (async () => {
      // 3. Persistent IndexedDB check - only if genuinely high-res (>= 8KB)
      try {
        let idbVal = await getFromIndexedDB(cleanId);
        if (!idbVal && cleanId.startsWith('-100')) {
          idbVal = await getFromIndexedDB(cleanId.slice(4));
        } else if (!idbVal && cleanId.startsWith('-')) {
          idbVal = await getFromIndexedDB(cleanId.slice(1));
        }
        if (idbVal && idbVal.length >= 8000) {
          memoryCache.set(cleanId, idbVal);
          notifySubscribers(cleanId, idbVal);
          return idbVal;
        } else if (idbVal && idbVal.length < 8000) {
          // Purge obsolete low-res thumbnail from persistent storage
          deleteFromIndexedDB(cleanId);
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
            if (!dataUrl && typeof fetch !== 'undefined' && !(typeof window !== 'undefined' && Boolean((window as any).TeleForgeBridge))) {
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

            if (dataUrl && dataUrl.length >= 8000) {
              memoryCache.set(cleanId, dataUrl);
              putToIndexedDB(cleanId, dataUrl);
              notifySubscribers(cleanId, dataUrl);
              resolve(dataUrl);
            } else if (dataUrl && dataUrl.length > 200) {
              // Store as thumbnail fallback
              thumbCache.set(cleanId, dataUrl);
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
      if (!memoryCache.has(clean) && !negativeCache.has(clean)) {
        this.loadAvatar(clean, false).catch(() => {});
      }
    }
  },
};
