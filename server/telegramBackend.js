import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { strippedPhotoToJpg } from 'telegram/Utils.js';
import { CustomFile } from 'telegram/client/uploads.js';
import bigInt from 'big-integer';

const SESSION_FILE = path.resolve(process.cwd(), '.telegram_session');
const CONFIG_FILE = path.resolve(process.cwd(), '.telegram_config.json');

// Get API credentials securely from environment or saved config file
let cachedApiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
let cachedApiHash = process.env.TELEGRAM_API_HASH || '';

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (configData.apiId && (!cachedApiId || cachedApiId === 0)) {
      cachedApiId = parseInt(configData.apiId, 10);
    }
    if (configData.apiHash && !cachedApiHash) {
      cachedApiHash = String(configData.apiHash).trim();
    }
  }
} catch (e) {
  console.error('[MTProto] Error reading config file:', e.message);
}

let clientInstance = null;
let currentSessionString = '';

// Load existing session from file if available
try {
  if (fs.existsSync(SESSION_FILE)) {
    const saved = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
    if (saved) {
      currentSessionString = saved;
    }
  }
} catch (e) {
  console.error('[MTProto] Error reading session file:', e.message);
}

// Ensure local avatar cache directory exists
const AVATARS_DIR = path.resolve(process.cwd(), '.cache', 'avatars');
const MEDIA_CACHE_DIR = path.resolve(process.cwd(), '.cache', 'media');
try {
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEDIA_CACHE_DIR)) {
    fs.mkdirSync(MEDIA_CACHE_DIR, { recursive: true });
  }
} catch (e) {}

const avatarMemoryCache = new Map(); // peerId -> high-res Buffer (> 1000 bytes)
const thumbMemoryCache = new Map(); // peerId -> 8x8 stripped thumb Buffer
const negativeAvatarCache = new Map(); // cleanId -> timestamp
const avatarNegativeCache = negativeAvatarCache; // alias preventing ReferenceError
function isNegativeCached(id) {
  const ts = negativeAvatarCache.get(id);
  if (!ts) return false;
  if (Date.now() - ts > 60000) {
    negativeAvatarCache.delete(id);
    return false;
  }
  return true;
}
function setNegativeCached(id) {
  negativeAvatarCache.set(id, Date.now());
}
const peerEntityCache = new Map(); // peerId -> GramJS entity
const inputPeerCache = new Map(); // peerId -> GramJS InputPeer (with accessHash)
const inflightAvatarPromises = new Map(); // peerId -> Promise<Buffer|null>

export async function resolveInputPeer(chatId) {
  if (!chatId) return null;
  const idStr = String(chatId).trim();
  const variations = [idStr];
  if (idStr.startsWith('-100')) {
    variations.push(idStr.slice(4));
    variations.push(`-${idStr.slice(4)}`);
  } else if (idStr.startsWith('-')) {
    variations.push(idStr.slice(1));
    variations.push(`-100${idStr.slice(1)}`);
  } else {
    variations.push(`-100${idStr}`);
    variations.push(`-${idStr}`);
  }

  for (const v of variations) {
    if (inputPeerCache.has(v)) return inputPeerCache.get(v);
  }

  for (const v of variations) {
    if (peerEntityCache.has(v)) {
      const ent = peerEntityCache.get(v);
      if (ent?._?.startsWith('input') || ent?.className?.startsWith('Input')) {
        return ent;
      }
    }
  }

  try {
    await getDialogsList(100);
    for (const v of variations) {
      if (inputPeerCache.has(v)) return inputPeerCache.get(v);
    }
  } catch (e) {}

  try {
    const client = await getClient();
    const ent = await client.getInputEntity(chatId);
    if (ent) {
      for (const v of variations) inputPeerCache.set(v, ent);
      return ent;
    }
  } catch (e) {}

  return chatId;
}


/**
 * Lookup real high-resolution profile photo from memory or disk cache (> 1000 bytes)
 */
export function getCachedHighResAvatar(peerId, version = '') {
  if (!peerId) return null;
  const cleanId = peerId.toString().trim();
  const variations = [cleanId];

  if (cleanId.startsWith('-100')) {
    variations.push(cleanId.slice(4));
    variations.push(`-${cleanId.slice(4)}`);
  } else if (cleanId.startsWith('-')) {
    variations.push(cleanId.slice(1));
    variations.push(`-100${cleanId.slice(1)}`);
  } else {
    variations.push(`-100${cleanId}`);
    variations.push(`-${cleanId}`);
  }

  // If a specific photo version is requested, look for that exact version first
  if (version) {
    for (const v of variations) {
      const vKey = `${v}_${version}`;
      if (avatarMemoryCache.has(vKey)) {
        const buf = avatarMemoryCache.get(vKey);
        if (buf && buf.length > 200) return buf;
      }
      const diskPath = path.join(AVATARS_DIR, `${vKey}.jpg`);
      if (fs.existsSync(diskPath)) {
        try {
          const fileBuf = fs.readFileSync(diskPath);
          if (fileBuf && fileBuf.length > 200) {
            avatarMemoryCache.set(vKey, fileBuf);
            return fileBuf;
          }
        } catch (e) {}
      }
    }
  }

  // Fallback to high-res avatar in memory or disk (e.g. ${cleanId}.jpg)
  for (const v of variations) {
    if (avatarMemoryCache.has(v)) {
      const buf = avatarMemoryCache.get(v);
      if (buf && buf.length > 200) return buf;
    }
  }

  for (const v of variations) {
    const diskPath = path.join(AVATARS_DIR, `${v}.jpg`);
    if (fs.existsSync(diskPath)) {
      try {
        const fileBuf = fs.readFileSync(diskPath);
        if (fileBuf && fileBuf.length > 200) {
          avatarMemoryCache.set(cleanId, fileBuf);
          return fileBuf;
        }
      } catch (e) {}
    }
  }

  return null;
}

/**
 * Fast lookup of lightweight stripped thumbnail (for 0ms blur-up preview)
 */
export function getCachedThumbBuffer(peerId) {
  if (!peerId) return null;
  const cleanId = peerId.toString().trim();
  const variations = [cleanId];

  if (cleanId.startsWith('-100')) {
    variations.push(cleanId.slice(4));
  } else if (cleanId.startsWith('-')) {
    variations.push(cleanId.slice(1));
  } else {
    variations.push(`-100${cleanId}`);
    variations.push(`-${cleanId}`);
  }

  for (const v of variations) {
    if (thumbMemoryCache.has(v)) {
      const buf = thumbMemoryCache.get(v);
      if (buf && buf.length > 0) return buf;
    }
  }

  for (const v of variations) {
    const targetPeer = peerEntityCache.get(v);
    if (targetPeer?.photo?.strippedThumb) {
      try {
        const thumbBuf = strippedPhotoToJpg(targetPeer.photo.strippedThumb);
        if (thumbBuf && thumbBuf.length > 0) {
          thumbMemoryCache.set(cleanId, thumbBuf);
          return thumbBuf;
        }
      } catch (e) {}
    }
  }

  return null;
}

// Concurrency limiter for avatar downloads (max 4 simultaneous MTProto download RPCs)
const avatarQueue = [];
let activeAvatarDownloads = 0;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Avatar download timed out')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function scheduleAvatarDownload(fn) {
  return new Promise((resolve, reject) => {
    avatarQueue.push({ fn, resolve, reject });
    runNextAvatarDownload();
  });
}

async function runNextAvatarDownload() {
  if (activeAvatarDownloads >= 4 || avatarQueue.length === 0) return;
  activeAvatarDownloads++;
  const { fn, resolve, reject } = avatarQueue.shift();
  try {
    const res = await fn();
    resolve(res);
  } catch (err) {
    resolve(null);
  } finally {
    activeAvatarDownloads--;
    runNextAvatarDownload();
  }
}

function hasEntityPhoto(entity) {
  if (!entity || !entity.photo) return false;
  const p = entity.photo;
  const cls = p.className || p._ || '';
  if (cls.includes('Empty') || cls.includes('empty')) return false;
  return true;
}

// Dialogs cache (5 second memory buffer for instantaneous responsiveness)
let cachedDialogsResult = null;
let lastDialogsFetchTime = 0;

export function getApiCredentials() {
  return {
    hasCredentials: cachedApiId > 0 && Boolean(cachedApiHash),
    apiId: cachedApiId,
  };
}

export function setApiCredentials(apiId, apiHash) {
  if (apiId && apiHash) {
    cachedApiId = parseInt(apiId, 10);
    cachedApiHash = apiHash.trim();
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ apiId: cachedApiId, apiHash: cachedApiHash }, null, 2));
    } catch (e) {
      console.error('[MTProto] Failed to save config file:', e.message);
    }
  }
}

let clientPromise = null;

export async function getClient() {
  if (!cachedApiId || !cachedApiHash) {
    throw new Error('Telegram API ID and API Hash are required to initialize MTProto client');
  }

  if (clientInstance && clientInstance.connected) {
    return clientInstance;
  }

  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    try {
      if (!clientInstance) {
        const session = new StringSession(currentSessionString);
        clientInstance = new TelegramClient(session, cachedApiId, cachedApiHash, {
          connectionRetries: 5,
          timeout: 30,
          useWSS: false, // direct native TCP transport in Node
        });

        console.log('[MTProto] Connecting to Telegram production servers...');
        await clientInstance.connect();
        console.log('[MTProto] Connected to Telegram production servers.');
        setupBackendUpdateHandler(clientInstance);
      } else if (!clientInstance.connected) {
        await clientInstance.connect();
        setupBackendUpdateHandler(clientInstance);
      }
      return clientInstance;
    } catch (err) {
      console.warn('[MTProto] Connection failed:', err?.message || err);
      try {
        if (clientInstance) await clientInstance.disconnect();
      } catch (e) {}
      backendUpdateHandlerAttached = false;
      clientInstance = null;
      throw err;
    } finally {
      clientPromise = null;
    }
  })();

  return clientPromise;
}

export async function saveSession() {
  if (clientInstance) {
    const sessionStr = clientInstance.session.save();
    currentSessionString = sessionStr;
    try {
      fs.writeFileSync(SESSION_FILE, sessionStr, 'utf-8');
      console.log('[MTProto] Session saved successfully.');
    } catch (e) {
      console.error('[MTProto] Failed to save session:', e.message);
    }
    return sessionStr;
  }
  return '';
}

export async function clearSession() {
  currentSessionString = '';
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch (e) {}

  if (clientInstance) {
    try {
      await clientInstance.disconnect();
    } catch (e) {}
    backendUpdateHandlerAttached = false;
    clientInstance = null;
  }
}

// Temporary storage for pending phone code verification requests
const pendingLogins = new Map();

export async function handleSendCode(phoneNumber) {
  let client = await getClient();
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  try {
    const result = await client.sendCode(
      {
        apiId: cachedApiId,
        apiHash: cachedApiHash,
      },
      cleanPhone
    );

    pendingLogins.set(cleanPhone, {
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.type?._ === 'auth.sentCodeTypeApp',
      timeout: Date.now() + 10 * 60 * 1000,
    });

    return {
      success: true,
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.type?._ === 'auth.sentCodeTypeApp',
      type: result.type?._,
    };
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('disconnected') || msg.includes('econnrefused') || msg.includes('socket')) {
      console.warn('[MTProto] Network hiccup on sendCode, retrying with fresh connection...');
      try {
        await client.disconnect();
      } catch (e) {}
      clientInstance = null;
      client = await getClient();
      const retryResult = await client.sendCode(
        {
          apiId: cachedApiId,
          apiHash: cachedApiHash,
        },
        cleanPhone
      );
      pendingLogins.set(cleanPhone, {
        phoneCodeHash: retryResult.phoneCodeHash,
        isCodeViaApp: retryResult.type?._ === 'auth.sentCodeTypeApp',
        timeout: Date.now() + 10 * 60 * 1000,
      });
      return {
        success: true,
        phoneCodeHash: retryResult.phoneCodeHash,
        isCodeViaApp: retryResult.type?._ === 'auth.sentCodeTypeApp',
        type: retryResult.type?._,
      };
    }
    throw err;
  }
}

export async function handleSignIn(phoneNumber, phoneCode, phoneCodeHash) {
  const client = await getClient();
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

  let codeHash = phoneCodeHash;
  if (!codeHash) {
    const pending = pendingLogins.get(cleanPhone);
    if (pending) {
      codeHash = pending.phoneCodeHash;
    }
  }

  if (!codeHash) {
    throw new Error('Verification session expired or missing phoneCodeHash. Please request a new code.');
  }

  try {
    const user = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: cleanPhone,
        phoneCodeHash: codeHash,
        phoneCode: phoneCode.trim(),
      })
    );

    pendingLogins.delete(cleanPhone);
    await saveSession();

    const me = await client.getMe();
    let bio = '';
    try {
      const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      bio = full?.fullUser?.about || full?.about || '';
    } catch (e) {}
    const sUser = serializeUser(me || user);
    if (sUser) sUser.bio = bio;
    const sessionStr = currentSessionString || (fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8') : '');
    return {
      success: true,
      user: sUser,
      session: sessionStr,
    };
  } catch (err) {
    if (err.message && err.message.includes('SESSION_PASSWORD_NEEDED')) {
      return {
        success: false,
        requires2FA: true,
        message: 'Two-Step Verification (2FA) password required.',
      };
    }
    throw err;
  }
}

export async function handle2FA(password) {
  const client = await getClient();
  
  await client.signInWithPassword(
    {
      apiId: cachedApiId,
      apiHash: cachedApiHash,
    },
    {
      password: password,
    }
  );

  await saveSession();
  const me = await client.getMe();
  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {}
  const sUser = serializeUser(me);
  if (sUser) sUser.bio = bio;
  const sessionStr = currentSessionString || (fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8') : '');
  return {
    success: true,
    user: sUser,
    session: sessionStr,
  };
}

export async function checkAuthStatus() {
  try {
    if (!cachedApiId || !cachedApiHash) {
      return { authorized: false, configured: false };
    }
    if (!currentSessionString && !fs.existsSync(SESSION_FILE)) {
      return { authorized: false, configured: true };
    }

    const client = await getClient();
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      return { authorized: false, configured: true };
    }

    const me = await client.getMe();
    let bio = '';
    try {
      const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      bio = full?.fullUser?.about || full?.about || '';
    } catch (e) {}

    if (me && me.id) {
      peerEntityCache.set(me.id.toString(), me);
    }
    const sUser = serializeUser(me);
    if (sUser) sUser.bio = bio;
    const sessionStr = currentSessionString || (fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8') : '');
    return {
      authorized: true,
      configured: true,
      user: sUser,
      session: sessionStr,
    };
  } catch (e) {
    console.error('[MTProto] Auth status check error:', e.message);
    return { authorized: false, configured: Boolean(cachedApiId && cachedApiHash), error: e.message };
  }
}

export async function getDialogsList(limit = 40, forceRefresh = false) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  // Short memory cache: return cached result if within 6 seconds unless forced
  const now = Date.now();
  if (!forceRefresh && cachedDialogsResult && (now - lastDialogsFetchTime < 6000)) {
    return cachedDialogsResult;
  }

  const dialogs = await client.getDialogs({ limit: Math.min(limit, 100) });
  
  const mapped = dialogs.map((d) => {
    const entity = d.entity;
    const inputEntity = d.inputEntity;
    const peerIdStr = d.id?.toString();

    // Cache inputEntity with accessHash for instant MTProto RPCs (shared media, stream, messages)
    if (inputEntity && peerIdStr) {
      inputPeerCache.set(peerIdStr, inputEntity);
      if (entity?.id) {
        inputPeerCache.set(entity.id.toString(), inputEntity);
        if (entity.className === 'Channel') {
          inputPeerCache.set(`-100${entity.id.toString()}`, inputEntity);
        } else if (entity.className === 'Chat') {
          inputPeerCache.set(`-${entity.id.toString()}`, inputEntity);
        }
      }
    }

    // Cache entity reference for fast avatar / message lookups
    if (entity && peerIdStr) {
      peerEntityCache.set(peerIdStr, entity);
      if (entity.id) {
        peerEntityCache.set(entity.id.toString(), entity);
        if (entity.className === 'Channel') {
          peerEntityCache.set(`-100${entity.id.toString()}`, entity);
        } else if (entity.className === 'Chat') {
          peerEntityCache.set(`-${entity.id.toString()}`, entity);
        }
      }

      // If stripped thumbnail is available on entity photo, convert to JPEG instantly
      if (entity.photo && entity.photo.strippedThumb) {
        try {
          const thumbBuf = strippedPhotoToJpg(entity.photo.strippedThumb);
          if (thumbBuf && thumbBuf.length > 0) {
            thumbMemoryCache.set(peerIdStr, thumbBuf);
            if (entity.id) {
              thumbMemoryCache.set(entity.id.toString(), thumbBuf);
              if (entity.className === 'Channel') {
                thumbMemoryCache.set(`-100${entity.id.toString()}`, thumbBuf);
              } else if (entity.className === 'Chat') {
                thumbMemoryCache.set(`-${entity.id.toString()}`, thumbBuf);
              }
            }
          }
        } catch (e) {
          console.warn(`[Avatar] strippedPhotoToJpg failed for ${peerIdStr}:`, e.message);
        }
      } else if (hasEntityPhoto(entity)) {
        console.log(`[Avatar] Entity ${peerIdStr} has photo but NO strippedThumb (photo class: ${entity.photo?.className})`);
      }
    }

    const hasPhoto = hasEntityPhoto(entity);

    const isUser = Boolean(d.isUser);
    const isGroup = Boolean(d.isGroup || (entity && (entity.megagroup || entity.gigagroup || entity.className === 'Chat')));
    const isChannel = Boolean(d.isChannel && !isGroup);

    let title = d.title || d.name || 'Telegram User';
    let username = entity?.username || '';
    let phone = entity?.phone || '';
    let isVerified = Boolean(entity?.verified);
    let isScam = Boolean(entity?.scam);
    let isFake = Boolean(entity?.fake);

    // Format last message preview
    let messageText = d.message?.message || '';
    if (!messageText && d.message?.media) {
      const mediaType = d.message.media.className || d.message.media._ || '';
      if (mediaType.includes('Photo')) messageText = '📷 Photo';
      else if (mediaType.includes('Document')) {
        messageText = d.message.media.document?.attributes?.some((a) => a._ === 'documentAttributeAudio')
          ? '🎤 Voice message'
          : '📁 Document';
      } else messageText = '📎 Media';
    }

    // Build inline base64 data-URL from cached stripped thumbnail (0ms preview)
    let thumbUrl = undefined;
    if (hasPhoto && peerIdStr) {
      try {
        const buf = getCachedThumbBuffer(peerIdStr) || (entity?.id ? getCachedThumbBuffer(entity.id.toString()) : null);
        if (buf && buf.length > 0) {
          thumbUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
        }
      } catch (e) {}
    }

    // Extract real Telegram MTProto member/subscriber count
    let participantsCount = undefined;
    if (entity) {
      if (typeof entity.participantsCount === 'number') {
        participantsCount = entity.participantsCount;
      } else if (typeof entity.participants_count === 'number') {
        participantsCount = entity.participants_count;
      }
    }

    return {
      id: peerIdStr,
      title,
      username,
      phone,
      isUser,
      isGroup,
      isChannel,
      isVerified,
      hasAvatar: hasPhoto,
      thumbUrl,
      unreadCount: d.unreadCount || 0,
      unreadMentionsCount: d.unreadMentionsCount || 0,
      pinned: Boolean(d.pinned),
      participantsCount,
      memberCount: participantsCount,
      date: d.date ? d.date * 1000 : Date.now(),
      lastMessage: {
        id: d.message?.id,
        text: messageText,
        date: d.message?.date ? d.message.date * 1000 : Date.now(),
        out: Boolean(d.message?.out),
        senderId: d.message?.senderId?.toString(),
      },
    };
  });

  cachedDialogsResult = mapped;
  lastDialogsFetchTime = now;

  const withThumb = mapped.filter(d => d.thumbUrl).length;
  const withAvatar = mapped.filter(d => d.hasAvatar).length;
  console.log(`[Dialogs] Loaded ${mapped.length} dialogs: ${withAvatar} have photos, ${withThumb} have inline thumbs, ${withAvatar - withThumb} will need HTTP avatar requests`);

  return mapped;
}

// Server-Sent Events (SSE) clients for real-time updates to browser
const sseClients = new Set();

export function addSseClient(res) {
  sseClients.add(res);
}

export function removeSseClient(res) {
  sseClients.delete(res);
}

export function broadcastUpdate(data) {
  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// 25s keepalive ping to prevent proxy/browser timeout
setInterval(() => {
  if (sseClients.size === 0) return;
  for (const client of sseClients) {
    try {
      client.write(':keepalive\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 25000);

export function mapBackendMessage(m, fallbackPeerId = null, batchMessagesMap = null) {
  if (!m) return null;
  let senderIdStr = m.senderId ? m.senderId.toString() : (m.fromId ? extractPeerId(m.fromId) : null);
  const senderEntity = m.sender || m._sender || (senderIdStr ? peerEntityCache.get(senderIdStr) : null);

  if (senderEntity && senderEntity.id) {
    const sId = senderEntity.id.toString();
    if (!senderIdStr) senderIdStr = sId;
    peerEntityCache.set(sId, senderEntity);
    if (senderEntity.className === 'Channel') {
      peerEntityCache.set(`-100${sId}`, senderEntity);
    } else if (senderEntity.className === 'Chat') {
      peerEntityCache.set(`-${sId}`, senderEntity);
    }
    if (senderEntity.photo?.strippedThumb) {
      try {
        const thumbBuf = strippedPhotoToJpg(senderEntity.photo.strippedThumb);
        if (thumbBuf && thumbBuf.length > 0) {
          thumbMemoryCache.set(sId, thumbBuf);
          if (senderIdStr) thumbMemoryCache.set(senderIdStr, thumbBuf);
        }
      } catch (e) {}
    }
  }

  let senderName = '';
  if (senderEntity) {
    if (senderEntity.title) {
      senderName = senderEntity.title;
    } else {
      senderName = [senderEntity.firstName, senderEntity.lastName].filter(Boolean).join(' ');
    }
  }
  if (!senderName && m.postAuthor) {
    senderName = m.postAuthor;
  }

  let senderAvatar = undefined;
  let senderThumbUrl = undefined;
  if (!m.out && senderIdStr) {
    const cachedBuf = getCachedThumbBuffer(senderIdStr);
    if (cachedBuf && cachedBuf.length > 0) {
      try {
        senderThumbUrl = `data:image/jpeg;base64,${cachedBuf.toString('base64')}`;
      } catch (e) {}
    }
    senderAvatar = `/api/telegram/avatar?id=${encodeURIComponent(senderIdStr)}`;
  }

  let hasMedia = Boolean(m.media);
  let mediaType = null;
  let mediaThumb = undefined;
  let fileName = null;
  let fileSize = null;
  let durationStr = undefined;
  let isRound = false;
  let isSticker = false;
  let isGif = false;
  let stickerEmoji = undefined;
  let stickerSet = undefined;
  let documentId = undefined;
  let accessHash = undefined;
  let fileReference = undefined;

  if (m.media) {
    const cls = m.media.className || m.media._ || '';
    if (cls.includes('Photo')) {
      mediaType = 'photo';
      let strippedBytes = m.media.photo?.strippedThumb;
      if (!strippedBytes && Array.isArray(m.media.photo?.sizes)) {
        const strippedObj = m.media.photo.sizes.find(
          (s) => s._ === 'photoStrippedSize' || s.className === 'PhotoStrippedSize' || s.bytes
        );
        if (strippedObj?.bytes) strippedBytes = strippedObj.bytes;
      }
      if (strippedBytes) {
        try {
          const thumbBuf = strippedPhotoToJpg(strippedBytes);
          if (thumbBuf && thumbBuf.length > 0) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
          }
        } catch (e) {}
      }
      if (!mediaThumb && Array.isArray(m.media.photo?.sizes)) {
        const cachedObj = m.media.photo.sizes.find(
          (s) => s._ === 'photoCachedSize' || s.className === 'PhotoCachedSize'
        );
        if (cachedObj?.bytes) {
          mediaThumb = `data:image/jpeg;base64,${Buffer.from(cachedObj.bytes).toString('base64')}`;
        }
      }
    } else if (cls.includes('Document')) {
      const doc = m.media.document;
      if (doc) {
        documentId = doc.id ? doc.id.toString() : undefined;
        accessHash = doc.accessHash ? doc.accessHash.toString() : undefined;
        if (doc.fileReference) {
          try {
            fileReference = Buffer.from(doc.fileReference).toString('hex');
          } catch (e) {}
        }
      }

      const attrs = doc?.attributes || [];
      const stickerAttr = attrs.find((a) => a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker');
      if (stickerAttr) {
        stickerEmoji = stickerAttr.alt || undefined;
        if (stickerAttr.stickerset) {
          const ss = stickerAttr.stickerset;
          stickerSet = {
            id: ss.id ? ss.id.toString() : undefined,
            accessHash: ss.accessHash ? ss.accessHash.toString() : undefined,
            shortName: ss.shortName || undefined,
          };
        }
      }
      isSticker = Boolean(stickerAttr);
      const isGifAttr = attrs.some((a) => a._ === 'documentAttributeAnimated' || a.className === 'DocumentAttributeAnimated');
      const videoAttr = attrs.find((a) => a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo');
      isRound = Boolean(videoAttr?.roundMessage);
      const isVoice = attrs.some((a) => (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && a.voice);
      const isAudio = attrs.some((a) => (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && !a.voice);
      const filenameAttr = attrs.find((a) => a._ === 'documentAttributeFilename' || a.className === 'DocumentAttributeFilename');

      const mime = (m.media.document?.mimeType || '').toLowerCase();
      const fn = (filenameAttr?.fileName || '').toLowerCase();
      const isVideoFile = videoAttr || mime.startsWith('video/') || /\.(mp4|mkv|mov|webm|avi|flv|m4v|3gp|ts)$/i.test(fn);

      if (isSticker || mime === 'image/webp' || mime === 'application/x-tgsticker') {
        mediaType = 'sticker';
        isSticker = true;
      } else if (isRound) {
        mediaType = 'videoNote';
      } else if (isGifAttr) {
        mediaType = 'gif';
        isGif = true;
      } else if (isVideoFile) {
        mediaType = 'video';
      } else if (isVoice) {
        mediaType = 'voice';
      } else if (isAudio || mime.startsWith('audio/')) {
        mediaType = 'audio';
      } else if (mime.startsWith('image/')) {
        mediaType = 'photo';
      } else {
        mediaType = 'document';
      }

      const rawDuration = videoAttr?.duration ?? (isVoice || isAudio ? attrs.find((a) => a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio')?.duration : undefined);
      if (rawDuration != null) {
        const totalSecs = Math.round(Number(rawDuration));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }

      if (m.media.document?.thumbs) {
        const stripped = m.media.document.thumbs.find((t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize');
        if (stripped?.bytes) {
          try {
            const thumbBuf = strippedPhotoToJpg(stripped.bytes);
            if (thumbBuf && thumbBuf.length > 0) {
              mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
            }
          } catch (e) {}
        }
        if (!mediaThumb) {
          const cached = m.media.document.thumbs.find((t) => (t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize') && t.bytes);
          if (cached?.bytes) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(cached.bytes).toString('base64')}`;
          }
        }
      }

      if (filenameAttr) fileName = filenameAttr.fileName;
      fileSize = m.media.document?.size ? formatBytes(Number(m.media.document.size)) : null;
    }
  }

  let actionText = undefined;
  if (m.action) {
    const actCls = m.action.className || m.action._ || '';
    if (actCls.includes('ChatAddUser') || actCls.includes('ChatJoinedByLink')) {
      actionText = 'joined the group';
    } else if (actCls.includes('ChatDeleteUser')) {
      actionText = 'left the group';
    } else if (actCls.includes('PinMessage')) {
      actionText = 'pinned a message';
    } else if (actCls.includes('ChatEditPhoto')) {
      actionText = 'changed group photo';
    } else if (actCls.includes('ChatEditTitle')) {
      actionText = `changed group name to "${m.action.title || ''}"`;
    } else if (actCls.includes('ChannelCreate')) {
      actionText = 'Channel created';
    } else if (actCls.includes('ChatCreate')) {
      actionText = 'Group created';
    } else if (actCls.includes('PhoneCall')) {
      actionText = 'Phone call';
    } else {
      actionText = 'Notification update';
    }
  }

  let rawMessage = m.message || '';
  if (!rawMessage && actionText) {
    rawMessage = `${senderName ? `${senderName} ` : ''}${actionText}`;
  }

  let reactions = [];
  if (m.reactions && m.reactions.results) {
    reactions = m.reactions.results.map((r) => {
      let emojiStr = '👍';
      if (r.reaction && r.reaction.emoticon) {
        emojiStr = r.reaction.emoticon;
      } else if (typeof r.reaction === 'string') {
        emojiStr = r.reaction;
      }
      return {
        emoji: emojiStr,
        count: r.count || 1,
        userReacted: Boolean(r.chosenOrder !== undefined && r.chosenOrder !== null),
      };
    });
  }

  return {
    id: m.id,
    text: rawMessage,
    date: m.date ? m.date * 1000 : Date.now(),
    out: Boolean(m.out),
    senderId: senderIdStr,
    senderName: senderName || undefined,
    senderAvatar,
    senderThumbUrl,
    hasMedia,
    mediaType,
    mediaThumb,
    fileName,
    fileSize,
    duration: durationStr,
    isRound,
    isSticker,
    isGif,
    stickerEmoji,
    stickerSet,
    documentId,
    accessHash,
    fileReference,
    replyToMsgId: m.replyTo?.replyToMsgId,
    replyToText: (() => {
      if (m.replyTo?.quoteText) return m.replyTo.quoteText;
      if (m.replyTo?.replyToMsgId && batchMessagesMap) {
        const rm = batchMessagesMap.get(m.replyTo.replyToMsgId);
        if (rm) {
          if (rm.message) return rm.message;
          if (rm.media) return 'Attachment';
        }
      }
      return undefined;
    })(),
    replyToSenderName: (() => {
      if (m.replyTo?.replyToMsgId && batchMessagesMap) {
        const rm = batchMessagesMap.get(m.replyTo.replyToMsgId);
        if (rm) {
          if (rm.out) return 'You';
          const rmSenderId = rm.senderId ? rm.senderId.toString() : (rm.fromId ? extractPeerId(rm.fromId) : null);
          if (rmSenderId) {
            const ent = rm.sender || rm._sender || peerEntityCache.get(rmSenderId.toString());
            if (ent) {
              return ent.firstName
                ? `${ent.firstName}${ent.lastName ? ` ${ent.lastName}` : ''}`
                : (ent.title || ent.username || undefined);
            }
          }
        }
      }
      return undefined;
    })(),
    reactions,
    actionText,
  };
}

let backendUpdateHandlerAttached = false;

function handleSingleBackendUpdate(u) {
  if (!u) return;
  const cls = u.className || u._ || '';
  let msgObj = null;
  let chatId = null;

  if (u.message && (cls.includes('UpdateNewMessage') || cls.includes('UpdateNewChannelMessage'))) {
    msgObj = u.message;
    chatId = msgObj.peerId ? extractPeerId(msgObj.peerId) : null;
  } else if (cls.includes('UpdateShortChatMessage')) {
    chatId = `-${u.chatId}`;
    msgObj = {
      id: u.id,
      message: u.message,
      date: u.date,
      out: Boolean(u.out),
      fromId: u.fromId ? { userId: u.fromId } : undefined,
    };
  } else if (cls.includes('UpdateShortMessage')) {
    chatId = u.userId ? u.userId.toString() : null;
    msgObj = {
      id: u.id,
      message: u.message,
      date: u.date,
      out: Boolean(u.out),
      fromId: u.out ? undefined : (u.userId ? { userId: u.userId } : undefined),
    };
  }

  if (msgObj && chatId) {
    const mapped = mapBackendMessage(msgObj, chatId);
    if (mapped) {
      broadcastUpdate({
        type: 'new_message',
        chatId: chatId.toString(),
        message: mapped,
      });
    }
  }
}

function handleIncomingBackendUpdate(event) {
  if (!event) return;
  if (Array.isArray(event.users)) {
    for (const user of event.users) {
      if (user && user.id) peerEntityCache.set(user.id.toString(), user);
    }
  }
  if (Array.isArray(event.chats)) {
    for (const chat of event.chats) {
      if (chat && chat.id) {
        const idStr = chat.id.toString();
        peerEntityCache.set(idStr, chat);
        peerEntityCache.set(`-${idStr}`, chat);
        peerEntityCache.set(`-100${idStr}`, chat);
      }
    }
  }

  if (Array.isArray(event.updates)) {
    for (const sub of event.updates) {
      handleSingleBackendUpdate(sub);
    }
  } else {
    handleSingleBackendUpdate(event);
  }
}

export function setupBackendUpdateHandler(client) {
  if (backendUpdateHandlerAttached || !client) return;
  try {
    client.addEventHandler((event) => {
      try {
        handleIncomingBackendUpdate(event);
      } catch (err) {
        console.warn('[MTProto Backend] Update event processing error:', err?.message || err);
      }
    });
    backendUpdateHandlerAttached = true;
    console.log('[MTProto Backend] Real-time update event handler successfully registered.');
  } catch (err) {
    console.warn('[MTProto Backend] Failed to register update event handler:', err?.message || err);
  }
}

export async function getMessagesForPeer(peerId, limit = 50, offsetId = 0, options = {}) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = await resolveInputPeer(peerId);

  const fetchOptions = { limit: Math.min(limit, 100) };
  if (offsetId && parseInt(offsetId, 10) > 0) {
    fetchOptions.offsetId = parseInt(offsetId, 10);
  }
  if (options.addOffset !== undefined) {
    fetchOptions.addOffset = parseInt(options.addOffset, 10);
  }
  if (options.search && typeof options.search === 'string' && options.search.trim()) {
    fetchOptions.search = options.search.trim();
  }
  if (options.ids && Array.isArray(options.ids)) {
    fetchOptions.ids = options.ids;
  }

  let messages = [];
  try {
    messages = await client.getMessages(targetPeer, fetchOptions);
  } catch (err) {
    console.warn('[MTProto Backend] getMessages fallback for peer:', peerId, err.message);
    return [];
  }

  // Pre-cache all entities returned in the messages batch for instant 0ms lookups
  for (const m of messages) {
    if (m && m._entities && m._entities instanceof Map) {
      for (const [k, ent] of m._entities.entries()) {
        if (ent && ent.id) {
          const eId = ent.id.toString();
          peerEntityCache.set(eId, ent);
          peerEntityCache.set(k.toString(), ent);
          if (ent.photo?.strippedThumb) {
            try {
              const tb = strippedPhotoToJpg(ent.photo.strippedThumb);
              if (tb && tb.length > 0) {
                thumbMemoryCache.set(eId, tb);
                thumbMemoryCache.set(k.toString(), tb);
              }
            } catch (e) {}
          }
        }
      }
    }
  }
  // Build map of messages in this batch for resolving replies
  const batchMessagesMap = new Map();
  for (const m of messages) {
    if (m && m.id) batchMessagesMap.set(m.id, m);
  }

  // Find any replied messages that were not part of this batch and fetch them in one roundtrip
  const missingReplyIds = [];
  for (const m of messages) {
    const rId = m?.replyTo?.replyToMsgId;
    if (rId && !batchMessagesMap.has(rId) && !missingReplyIds.includes(rId)) {
      missingReplyIds.push(rId);
    }
  }

  if (missingReplyIds.length > 0) {
    try {
      const fetchedReplies = await client.getMessages(targetPeer, { ids: missingReplyIds.slice(0, 25) });
      if (Array.isArray(fetchedReplies)) {
        for (const rm of fetchedReplies) {
          if (rm && rm.id) {
            batchMessagesMap.set(rm.id, rm);
          }
        }
      }
    } catch (e) {}
  }
  
  return messages.map((m) => mapBackendMessage(m, peerId, batchMessagesMap)).filter(Boolean).reverse();
}

export async function searchMessagesInPeer(peerId, query, limit = 30) {
  if (!query || !query.trim()) return [];
  return getMessagesForPeer(peerId, limit, 0, { search: query.trim() });
}

export async function getMessagesAroundMessage(peerId, messageId, limit = 50) {
  const mid = parseInt(messageId, 10);
  if (!mid) return [];
  const half = Math.floor(limit / 2);
  return getMessagesForPeer(peerId, limit, mid, { addOffset: -half });
}

export async function sendPeerMessage(peerId, messageText, replyToMsgId) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId);
  } catch (e) {
    targetPeer = peerId;
  }

  const result = await client.sendMessage(targetPeer, {
    message: messageText,
    replyTo: replyToMsgId ? parseInt(replyToMsgId, 10) : undefined,
  });

  return {
    id: result.id,
    text: result.message || messageText,
    date: result.date ? result.date * 1000 : Date.now(),
    out: true,
    senderId: 'user-me',
    senderName: 'You',
  };
}

export async function sendPeerReaction(peerId, messageId, emoji) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = peerEntityCache.get(peerId?.toString());
  if (!targetPeer) {
    try {
      targetPeer = await client.getInputEntity(peerId);
    } catch (e) {
      targetPeer = peerId;
    }
  }

  const msgIdNum = parseInt(messageId, 10);
  if (isNaN(msgIdNum)) {
    throw new Error('Invalid message ID');
  }

  const reactionList = emoji
    ? [new Api.ReactionEmoji({ emoticon: emoji })]
    : [];

  try {
    const res = await client.invoke(
      new Api.messages.SendReaction({
        peer: targetPeer,
        msgId: msgIdNum,
        reaction: reactionList,
      })
    );
    return { success: true, result: res };
  } catch (err) {
    console.error('[MTProto] Error sending reaction:', err.message);
    throw err;
  }
}

export async function editPeerMessage(peerId, messageId, newText) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = peerEntityCache.get(peerId?.toString());
  if (!targetPeer) {
    try {
      targetPeer = await client.getInputEntity(peerId);
    } catch (e) {
      targetPeer = peerId;
    }
  }

  const msgIdNum = parseInt(messageId, 10);
  const result = await client.editMessage(targetPeer, {
    message: msgIdNum,
    text: newText,
  });

  return {
    id: result.id,
    text: result.message || newText,
    date: result.date ? result.date * 1000 : Date.now(),
  };
}

export async function deletePeerMessages(peerId, messageIds, revoke = true) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = peerEntityCache.get(peerId?.toString());
  if (!targetPeer) {
    try {
      targetPeer = await client.getInputEntity(peerId);
    } catch (e) {
      targetPeer = peerId;
    }
  }

  const ids = Array.isArray(messageIds)
    ? messageIds.map((id) => parseInt(id, 10))
    : [parseInt(messageIds, 10)];

  await client.deleteMessages(targetPeer, ids, { revoke: Boolean(revoke) });
  return { success: true, count: ids.length };
}

export async function pinPeerMessage(peerId, messageId, silent = false) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let targetPeer = peerEntityCache.get(peerId?.toString());
  if (!targetPeer) {
    try {
      targetPeer = await client.getInputEntity(peerId);
    } catch (e) {
      targetPeer = peerId;
    }
  }

  const msgIdNum = parseInt(messageId, 10);
  await client.pinMessage(targetPeer, msgIdNum, { notify: !silent });
  return { success: true, id: msgIdNum };
}


// Document Cache for MTProto Documents (GIFs, Stickers, Videos)
const documentCache = new Map(); // idStr -> doc

export function cacheDocument(doc) {
  if (!doc) return;
  const idStr = doc.id ? doc.id.toString() : '';
  if (idStr) {
    documentCache.set(idStr, doc);
  }
}

export async function downloadDocumentMedia(id, options = {}) {
  const client = await getClient();
  const idStr = id ? id.toString() : '';
  const doc = documentCache.get(idStr);
  if (!doc) {
    return null;
  }

  let buffer = null;
  let mimeType = options.mimeType || doc.mimeType || 'application/octet-stream';

  if (options.thumb) {
    const thumbs = doc.thumbs || [];
    const normalThumbs = thumbs.filter((t) => t.className === 'PhotoSize' || t._ === 'photoSize');
    const videoThumbs = doc.videoThumbs || [];

    if (normalThumbs.length > 0) {
      const best = normalThumbs[normalThumbs.length - 1];
      try {
        buffer = await client.downloadMedia(doc, { thumb: best.type });
        mimeType = 'image/jpeg';
      } catch (e) {}
    }
    if (!buffer && strippedPhotoToJpg) {
      const stripped = thumbs.find((t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize');
      if (stripped?.bytes) {
        try {
          const jpgBuf = strippedPhotoToJpg(stripped.bytes);
          if (jpgBuf) {
            buffer = Buffer.from(jpgBuf);
            mimeType = 'image/jpeg';
          }
        } catch (e) {}
      }
    }
    if (!buffer && videoThumbs.length > 0) {
      try {
        buffer = await client.downloadMedia(doc, { thumb: videoThumbs[0].type });
        mimeType = 'image/jpeg';
      } catch (e) {}
    }
  }

  if (!buffer) {
    buffer = await client.downloadMedia(doc, {});
    mimeType = options.mimeType || doc.mimeType || 'video/mp4';
  }

  return { buffer, mimeType };
}

const mediaThumbCache = new Map(); // `${chatId}_${messageId}` -> { buffer, mimeType }
const inflightMediaPromises = new Map(); // `${chatId}_${messageId}_${thumb}` -> Promise<{ buffer, mimeType } | null>
const activeFFmpegStreams = new Map(); // `${cleanChat}_${cleanMsg}` -> child_process
const mediaTracksCache = new Map(); // `${chatId}_${messageId}` -> { tracks: [...] }

export async function downloadMessageMedia(chatId, messageId, options = {}) {
  const isThumb = Boolean(options.thumb);
  const cleanChat = String(chatId).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanMsg = String(messageId).replace(/[^a-zA-Z0-9_-]/g, '');
  const cacheKey = `${chatId}_${messageId}`;

  if (isThumb && mediaThumbCache.has(cacheKey)) {
    return mediaThumbCache.get(cacheKey);
  }

  // Check persistent disk cache for full video / audio / document media
  const diskBinPath = path.join(MEDIA_CACHE_DIR, `${cleanChat}_${cleanMsg}.bin`);
  const diskMetaPath = path.join(MEDIA_CACHE_DIR, `${cleanChat}_${cleanMsg}.json`);
  if (!isThumb && fs.existsSync(diskBinPath) && fs.existsSync(diskMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(diskMetaPath, 'utf-8'));
      const buffer = fs.readFileSync(diskBinPath);
      if (buffer && buffer.length > 0) {
        return {
          buffer,
          mimeType: meta.mimeType || 'application/octet-stream',
        };
      }
    } catch (e) {}
  }

  // Deduplicate in-flight downloads for the same media file across multiple range requests
  const inflightKey = `${chatId}_${messageId}_${isThumb ? '1' : '0'}`;
  if (inflightMediaPromises.has(inflightKey)) {
    return inflightMediaPromises.get(inflightKey);
  }

  const promise = (async () => {
    try {
      const client = await getClient();
      const targetPeer = await resolveInputPeer(chatId);

      const messages = await client.getMessages(targetPeer, { ids: [parseInt(messageId, 10)] });
      if (!messages || !messages[0] || !messages[0].media) {
        return null;
      }

      const msg = messages[0];
      const media = msg.media;
      const cls = media.className || media._ || '';
      const isDoc = cls.includes('Document') && media.document;
      const isPhoto = cls.includes('Photo') && media.photo;

      if (isDoc && media.document) {
        cacheDocument(media.document);
      }

      const isSticker = Boolean(
        isDoc &&
          ((media.document.attributes || []).some(
            (a) => a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker'
          ) ||
            media.document.mimeType === 'application/x-tgsticker' ||
            media.document.mimeType === 'image/webp')
      );

      let buffer = null;
      let mimeType = 'application/octet-stream';

      // If thumbnail requested OR if it is an animated sticker (.tgs must be rendered as thumbnail image!)
      if (isThumb || isSticker) {
        if (isDoc) {
          const thumbs = media.document.thumbs || [];
          const normalThumbs = thumbs.filter((t) =>
            t.className === 'PhotoSize' || t._ === 'photoSize' ||
            t.className === 'PhotoSizeProgressive' || t._ === 'photoSizeProgressive'
          );
          if (normalThumbs.length > 0) {
            const best = normalThumbs[normalThumbs.length - 1];
            try {
              buffer = await client.downloadMedia(media, { thumb: best.type });
              mimeType = 'image/jpeg';
            } catch (e) {}
          }
          if (!buffer && media.document.videoThumbs && media.document.videoThumbs.length > 0) {
            try {
              buffer = await client.downloadMedia(media, { thumb: media.document.videoThumbs[0].type });
              mimeType = 'image/jpeg';
            } catch (e) {}
          }
          if (!buffer) {
            const stripped = thumbs.find((t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize');
            if (stripped?.bytes) {
              try {
                const jpgBuf = strippedPhotoToJpg(stripped.bytes);
                if (jpgBuf) {
                  buffer = Buffer.from(jpgBuf);
                  mimeType = 'image/jpeg';
                }
              } catch (e) {}
            }
          }
        } else if (isPhoto) {
          try {
            buffer = await client.downloadMedia(media, { thumb: 'm' });
            mimeType = 'image/jpeg';
          } catch (e) {}
        }
      }

      // Full media fallback / download
      if (!buffer) {
        try {
          buffer = await client.downloadMedia(msg, {});
        } catch (e) {
          try {
            buffer = await client.downloadMedia(media, {});
          } catch (e2) {}
        }
        if (cls.includes('Photo')) {
          mimeType = 'image/jpeg';
        } else if (isDoc) {
          mimeType = media.document?.mimeType || 'video/mp4';
        }
      }

      if (!buffer || buffer.length === 0) {
        return null;
      }

      const result = {
        buffer,
        mimeType,
      };

      if (isThumb) {
        if (mediaThumbCache.size > 200) {
          const first = mediaThumbCache.keys().next().value;
          mediaThumbCache.delete(first);
        }
        mediaThumbCache.set(cacheKey, result);
      } else {
        // Cache full media to disk asynchronously so subsequent range requests serve in 0ms!
        try {
          fs.writeFileSync(diskBinPath, buffer);
          fs.writeFileSync(diskMetaPath, JSON.stringify({ mimeType, size: buffer.length }));
        } catch (e) {}
      }

      return result;
    } catch (err) {
      console.warn('[Backend] downloadMessageMedia error:', err?.message || err);
      return null;
    } finally {
      inflightMediaPromises.delete(inflightKey);
    }
  })();

  inflightMediaPromises.set(inflightKey, promise);
  return promise;
}

export async function downloadPeerAvatar(peerId, version = '') {
  if (!peerId) return null;
  const cleanId = peerId.toString().trim();
  const cacheKey = version ? `${cleanId}_${version}` : cleanId;

  // 1. Instant 0ms check for high-res photo already on disk/memory
  const highRes = getCachedHighResAvatar(cleanId, version);
  if (highRes && highRes.length > 200) {
    return highRes;
  }

  // 2. In-flight request deduplication
  if (inflightAvatarPromises.has(cacheKey)) {
    return inflightAvatarPromises.get(cacheKey);
  }

  const variations = [cleanId];
  if (cleanId.startsWith('-100')) {
    variations.push(cleanId.slice(4));
    variations.push(`-${cleanId.slice(4)}`);
  } else if (cleanId.startsWith('-')) {
    variations.push(cleanId.slice(1));
    variations.push(`-100${cleanId.slice(1)}`);
  } else {
    variations.push(`-100${cleanId}`);
    variations.push(`-${cleanId}`);
  }

  let targetPeer = null;
  for (const v of variations) {
    if (peerEntityCache.has(v)) {
      targetPeer = peerEntityCache.get(v);
      break;
    }
  }

  // 3. Queued download for high-res profile photo (10s timeout)
  const downloadPromise = scheduleAvatarDownload(async () => {
    try {
      const client = await getClient();
      let me = null;
      try {
        me = await client.getMe();
      } catch (e) {}
      const isMe = cleanId === 'me' || (me && me.id && cleanId === me.id.toString());

      if (!isMe && !targetPeer) {
        for (const v of variations) {
          if (peerEntityCache.has(v)) {
            targetPeer = peerEntityCache.get(v);
            break;
          }
        }
      }

      if (!isMe && !targetPeer) {
        try {
          if (/^-?\d+$/.test(cleanId)) {
            try {
              targetPeer = await client.getInputEntity(BigInt(cleanId));
            } catch (e1) {
              targetPeer = await resolveClientInputPeer(client, cleanId);
            }
          } else {
            targetPeer = await client.getInputEntity(cleanId);
          }
        } catch (e) {
          targetPeer = await resolveClientInputPeer(client, cleanId);
        }
      }

      if (!isMe && !targetPeer) {
        targetPeer = cleanId;
      }

      // Download real high-res profile photo (isBig: true ensures full quality, 'me' ensures live active user photo)
      const downloadTarget = isMe ? 'me' : targetPeer;
      let buffer = null;
      try {
        buffer = await withTimeout(
          client.downloadProfilePhoto(downloadTarget, { isBig: true }),
          10000
        );
      } catch (e) {}

      // If isBig failed or returned empty, try standard size (isBig: false)
      if (!buffer || buffer.length < 500) {
        try {
          buffer = await withTimeout(
            client.downloadProfilePhoto(downloadTarget, { isBig: false }),
            6000
          );
        } catch (e) {}
      }

      if (buffer && buffer.length > 200) {
        if (avatarMemoryCache.size > 300) {
          const firstKey = avatarMemoryCache.keys().next().value;
          avatarMemoryCache.delete(firstKey);
        }
        avatarMemoryCache.set(cleanId, buffer);
        if (version) {
          avatarMemoryCache.set(cacheKey, buffer);
        }
        if (isMe && me && me.id) {
          const myIdStr = me.id.toString();
          avatarMemoryCache.set(myIdStr, buffer);
          avatarMemoryCache.set('me', buffer);
          if (version) {
            avatarMemoryCache.set(`${myIdStr}_${version}`, buffer);
            avatarMemoryCache.set(`me_${version}`, buffer);
          }
        }

        try {
          const diskPath = path.join(AVATARS_DIR, `${cleanId}.jpg`);
          fs.writeFileSync(diskPath, buffer);
          if (version) {
            const verPath = path.join(AVATARS_DIR, `${cacheKey}.jpg`);
            fs.writeFileSync(verPath, buffer);
          }
          if (isMe && me && me.id) {
            const myIdStr = me.id.toString();
            fs.writeFileSync(path.join(AVATARS_DIR, `${myIdStr}.jpg`), buffer);
            fs.writeFileSync(path.join(AVATARS_DIR, 'me.jpg'), buffer);
            if (version) {
              fs.writeFileSync(path.join(AVATARS_DIR, `${myIdStr}_${version}.jpg`), buffer);
              fs.writeFileSync(path.join(AVATARS_DIR, `me_${version}.jpg`), buffer);
            }
          }
        } catch (e) {}

        return buffer;
      } else {
        return null;
      }
    } catch (err) {
      return null;
    }
  }).finally(() => {
    inflightAvatarPromises.delete(cacheKey);
  });

  inflightAvatarPromises.set(cacheKey, downloadPromise);
  return downloadPromise;
}

export async function getContactsList() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const result = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
  if (!result || !result.users) return [];

  // Cache contacts in peerEntityCache and convert stripped thumbnails
  for (const u of result.users) {
    if (u && u.id) {
      const uIdStr = u.id.toString();
      peerEntityCache.set(uIdStr, u);
      if (u.photo?.strippedThumb) {
        try {
          const thumbBuf = strippedPhotoToJpg(u.photo.strippedThumb);
          if (thumbBuf && thumbBuf.length > 0) {
            thumbMemoryCache.set(uIdStr, thumbBuf);
          }
        } catch (e) {}
      }
    }
  }

  return result.users.map((u) => serializeUser(u));
}

// Helper to extract string ID from peer
function extractPeerId(peer) {
  if (!peer) return null;
  if (typeof peer === 'string' || typeof peer === 'number') return peer.toString();
  if (peer.userId != null) return peer.userId.toString();
  if (peer.chatId != null) return `-${peer.chatId.toString()}`;
  if (peer.channelId != null) return `-100${peer.channelId.toString()}`;
  if (peer.id != null) return peer.id.toString();
  return null;
}

// Helper to convert chat string ID to InputPeer for Telegram MTProto
async function resolveClientInputPeer(client, id) {
  if (!id) return null;
  const str = id.toString();
  try {
    const entity = await client.getInputEntity(str);
    if (entity) return entity;
  } catch (e) {
    // Fall back to manual InputPeer construction if getInputEntity fails
  }

  try {
    if (str.startsWith('-100')) {
      const channelId = BigInt(str.slice(4));
      return new Api.InputPeerChannel({ channelId, accessHash: BigInt(0) });
    } else if (str.startsWith('-')) {
      const chatId = BigInt(str.slice(1));
      return new Api.InputPeerChat({ chatId });
    } else {
      const userId = BigInt(str);
      return new Api.InputPeerUser({ userId, accessHash: BigInt(0) });
    }
  } catch (e) {
    console.error('[MTProto] Could not resolve peer for filter:', id, e.message);
    return null;
  }
}

export async function getDialogFiltersList() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const res = await client.invoke(new Api.messages.GetDialogFilters());
  const rawFilters = Array.isArray(res) ? res : (res?.filters || []);

  const filters = [];
  for (const f of rawFilters) {
    if (!f) continue;
    if (f.className === 'DialogFilterDefault' || f._ === 'dialogFilterDefault') {
      filters.push({
        id: 'all',
        numericId: 0,
        title: 'All Chats',
        emoticon: '',
        isDefault: true,
      });
      continue;
    }

    const pinnedChatIds = (f.pinnedPeers || []).map(extractPeerId).filter(Boolean);
    const includeChatIds = (f.includePeers || []).map(extractPeerId).filter(Boolean);
    const excludeChatIds = (f.excludePeers || []).map(extractPeerId).filter(Boolean);

    // Extract title as string safely (GramJS often returns TextWithEntities object)
    let titleStr = 'Folder';
    if (typeof f.title === 'string') {
      titleStr = f.title;
    } else if (f.title && typeof f.title === 'object' && typeof f.title.text === 'string') {
      titleStr = f.title.text;
    } else if (f.title) {
      titleStr = String(f.title);
    }

    let emoticonStr = '';
    if (typeof f.emoticon === 'string') {
      emoticonStr = f.emoticon;
    } else if (f.emoticon && typeof f.emoticon === 'object' && typeof f.emoticon.text === 'string') {
      emoticonStr = f.emoticon.text;
    } else if (f.emoticon) {
      emoticonStr = String(f.emoticon);
    }

    filters.push({
      id: f.id ? f.id.toString() : `filter-${Date.now()}`,
      numericId: f.id || 0,
      title: titleStr,
      emoticon: emoticonStr,
      contacts: Boolean(f.contacts),
      nonContacts: Boolean(f.nonContacts),
      groups: Boolean(f.groups),
      channels: Boolean(f.broadcasts),
      bots: Boolean(f.bots),
      excludeMuted: Boolean(f.excludeMuted),
      excludeRead: Boolean(f.excludeRead),
      unreadOnly: Boolean(f.excludeRead),
      excludeArchived: Boolean(f.excludeArchived),
      pinnedChatIds,
      includeChatIds,
      excludeChatIds,
    });
  }

  return filters;
}

export async function saveDialogFilter(filterData) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let numericId = parseInt(filterData.numericId || filterData.id, 10);
  if (isNaN(numericId) || numericId <= 1) {
    const existing = await getDialogFiltersList();
    const existingIds = existing
      .map((f) => f.numericId)
      .filter((n) => typeof n === 'number' && n >= 2);
    numericId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 2;
  }

  const pinnedPeers = [];
  for (const id of filterData.pinnedChatIds || []) {
    const peer = await resolveClientInputPeer(client, id);
    if (peer) pinnedPeers.push(peer);
  }

  const includePeers = [];
  for (const id of filterData.includeChatIds || []) {
    const peer = await resolveClientInputPeer(client, id);
    if (peer) includePeers.push(peer);
  }

  const excludePeers = [];
  for (const id of filterData.excludeChatIds || []) {
    const peer = await resolveClientInputPeer(client, id);
    if (peer) excludePeers.push(peer);
  }

  const cleanTitle = typeof filterData.title === 'string'
    ? filterData.title.trim()
    : (filterData.title?.text ? String(filterData.title.text).trim() : String(filterData.title || '').trim());

  if (!cleanTitle) {
    throw new Error('Folder title cannot be empty');
  }

  const cleanEmoticon = typeof filterData.emoticon === 'string'
    ? filterData.emoticon.trim()
    : (filterData.emoticon?.text ? String(filterData.emoticon.text).trim() : String(filterData.emoticon || '').trim());

  // GramJS / Telegram MTProto requires title to be an Api.TextWithEntities object
  const titleObj = new Api.TextWithEntities({
    text: cleanTitle,
    entities: [],
  });

  const dialogFilter = new Api.DialogFilter({
    id: numericId,
    title: titleObj,
    emoticon: cleanEmoticon || undefined,
    contacts: Boolean(filterData.contacts),
    nonContacts: Boolean(filterData.nonContacts),
    groups: Boolean(filterData.groups),
    broadcasts: Boolean(filterData.channels),
    bots: Boolean(filterData.bots),
    excludeMuted: Boolean(filterData.excludeMuted),
    excludeRead: Boolean(filterData.unreadOnly || filterData.excludeRead),
    excludeArchived: filterData.excludeArchived !== false,
    pinnedPeers,
    includePeers,
    excludePeers,
  });

  const success = await client.invoke(
    new Api.messages.UpdateDialogFilter({
      id: numericId,
      filter: dialogFilter,
    })
  );

  return {
    success: Boolean(success),
    filter: {
      id: numericId.toString(),
      numericId,
      title: cleanTitle,
      emoticon: cleanEmoticon,
      contacts: Boolean(filterData.contacts),
      nonContacts: Boolean(filterData.nonContacts),
      groups: Boolean(filterData.groups),
      channels: Boolean(filterData.channels),
      bots: Boolean(filterData.bots),
      excludeMuted: Boolean(filterData.excludeMuted),
      excludeRead: Boolean(filterData.unreadOnly || filterData.excludeRead),
      unreadOnly: Boolean(filterData.unreadOnly || filterData.excludeRead),
      excludeArchived: filterData.excludeArchived !== false,
      pinnedChatIds: filterData.pinnedChatIds || [],
      includeChatIds: filterData.includeChatIds || [],
      excludeChatIds: filterData.excludeChatIds || [],
    },
  };
}

export async function deleteDialogFilter(id) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const numericId = parseInt(id, 10);
  if (isNaN(numericId) || numericId <= 0) {
    throw new Error('Invalid folder ID');
  }

  const success = await client.invoke(
    new Api.messages.UpdateDialogFilter({
      id: numericId,
      filter: undefined,
    })
  );

  return { success: Boolean(success), id: numericId.toString() };
}

export async function reorderDialogFilters(orderIds) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const numericOrder = orderIds
    .map((id) => parseInt(id, 10))
    .filter((n) => !isNaN(n) && n >= 2);

  const success = await client.invoke(
    new Api.messages.UpdateDialogFiltersOrder({
      order: numericOrder,
    })
  );

  return { success: Boolean(success), order: numericOrder };
}

function serializeUser(u) {
  if (!u) return null;
  const firstName = u.firstName || '';
  const lastName = u.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Telegram User';
  const idStr = u.id?.toString();

  if (idStr) {
    peerEntityCache.set(idStr, u);
  }

  const hasPhoto = hasEntityPhoto(u);
  if (!hasPhoto && idStr) {
    setNegativeCached(idStr);
  }

  const photoId = u.photo?.photoId ? u.photo.photoId.toString() : (u.photo?.id ? u.photo.id.toString() : '');
  const avatarUrl = hasPhoto
    ? `/api/telegram/avatar?id=${encodeURIComponent(idStr)}${photoId ? `&v=${photoId}` : ''}`
    : '';

  return {
    id: idStr,
    firstName,
    lastName,
    name: fullName,
    username: u.username || '',
    phone: u.phone ? `+${u.phone}` : '',
    isBot: Boolean(u.bot),
    isSelf: Boolean(u.self),
    isVerified: Boolean(u.verified),
    hasAvatar: hasPhoto,
    photoId: photoId || undefined,
    avatar: avatarUrl || undefined,
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function getFullChatInfo(peerId) {
  const client = await getClient();
  let entity = peerEntityCache.get(peerId?.toString());
  if (!entity) {
    try {
      entity = await client.getEntity(peerId);
      if (entity) {
        peerEntityCache.set(peerId.toString(), entity);
      }
    } catch (e) {
      console.warn(`[FullChatInfo] getEntity failed for ${peerId}:`, e.message);
    }
  }
  if (!entity) return null;

  let memberCount = entity.participantsCount ?? entity.participants_count ?? undefined;
  let about = undefined;

  try {
    if (entity.className === 'Channel') {
      const full = await client.invoke(new Api.channels.GetFullChannel({ channel: entity }));
      if (full && full.fullChat) {
        memberCount = full.fullChat.participantsCount ?? full.fullChat.participants_count ?? memberCount;
        about = full.fullChat.about;
      }
    } else if (entity.className === 'Chat') {
      const full = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
      if (full && full.fullChat) {
        if (full.fullChat.participants && full.fullChat.participants.participants) {
          memberCount = full.fullChat.participants.participants.length;
        }
        about = full.fullChat.about;
      }
    } else if (entity.className === 'User') {
      const full = await client.invoke(new Api.users.GetFullUser({ id: entity }));
      if (full && full.fullUser) {
        about = full.fullUser.about;
      }
    }
  } catch (e) {
    console.warn(`[FullChatInfo] Could not fetch full info for ${peerId}:`, e.message);
  }

  return {
    id: peerId,
    memberCount,
    about,
  };
}

/**
 * Mark a peer's messages as read on the Telegram server.
 * This sends ReadHistory (for users/groups) or ReadChannelHistory (for channels)
 * so the server resets the unread count for this chat.
 */
export async function markPeerAsRead(peerId) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  try {
    // Resolve the peer entity
    let entity = peerEntityCache.get(String(peerId));
    if (!entity) {
      entity = peerEntityCache.get(`-100${peerId}`);
    }
    if (!entity) {
      entity = peerEntityCache.get(`-${peerId}`);
    }
    if (!entity) {
      try {
        entity = await client.getEntity(peerId);
      } catch (e) {
        // Try as BigInt for numeric IDs
        try {
          entity = await client.getEntity(BigInt(peerId));
        } catch (e2) {
          throw new Error(`Could not resolve entity for peer ${peerId}`);
        }
      }
    }

    // GramJS client.markAsRead sends the appropriate ReadHistory RPC
    await client.markAsRead(entity);
    console.log(`[MTProto] Marked peer ${peerId} as read`);
    return { success: true };
  } catch (e) {
    console.warn(`[markAsRead] Error marking ${peerId} as read:`, e.message);
    // Non-fatal — return success anyway since the client-side already cleared the badge
    return { success: false, error: e.message };
  }
}

/**
 * Search global public channels, groups, bots, and users via Telegram MTProto contacts.Search
 */
export async function searchGlobalPeers(query, limit = 20) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const cleanQuery = (query || '').trim();
  if (cleanQuery.length < 2) {
    return { myResults: [], globalResults: [] };
  }

  try {
    const res = await client.invoke(
      new Api.contacts.Search({
        q: cleanQuery,
        limit: Math.min(limit, 50),
      })
    );

    // Build lookup maps for chats and users returned
    const chatsMap = new Map();
    if (res.chats && Array.isArray(res.chats)) {
      for (const ch of res.chats) {
        const idStr = ch.id.toString();
        chatsMap.set(idStr, ch);
        // Pre-cache entity in peerEntityCache for instant subsequent interaction
        peerEntityCache.set(idStr, ch);
        peerEntityCache.set(`-100${idStr}`, ch);
        peerEntityCache.set(`-${idStr}`, ch);

        // Pre-decode stripped thumbnail if available
        if (ch.photo?.strippedThumb) {
          try {
            const tb = strippedPhotoToJpg(ch.photo.strippedThumb);
            if (tb && tb.length > 0) {
              thumbMemoryCache.set(idStr, tb);
              thumbMemoryCache.set(`-100${idStr}`, tb);
            }
          } catch (e) {}
        }
      }
    }

    const usersMap = new Map();
    if (res.users && Array.isArray(res.users)) {
      for (const u of res.users) {
        const idStr = u.id.toString();
        usersMap.set(idStr, u);
        peerEntityCache.set(idStr, u);

        if (u.photo?.strippedThumb) {
          try {
            const tb = strippedPhotoToJpg(u.photo.strippedThumb);
            if (tb && tb.length > 0) {
              thumbMemoryCache.set(idStr, tb);
            }
          } catch (e) {}
        }
      }
    }

    function formatPeerToDialog(peer) {
      if (!peer) return null;
      let entity = null;
      let id = '';
      let isChannel = false;
      let isGroup = false;
      let isUser = false;

      if (peer.channelId) {
        const cid = peer.channelId.toString();
        entity = chatsMap.get(cid);
        id = `-100${cid}`;
        isChannel = entity ? !entity.megagroup : true;
        isGroup = entity ? Boolean(entity.megagroup) : false;
      } else if (peer.chatId) {
        const cid = peer.chatId.toString();
        entity = chatsMap.get(cid);
        id = `-${cid}`;
        isGroup = true;
      } else if (peer.userId) {
        const uid = peer.userId.toString();
        entity = usersMap.get(uid);
        id = uid;
        isUser = true;
      }

      if (!entity) return null;

      const hasPhoto = Boolean(entity.photo);
      let thumbUrl = undefined;
      if (hasPhoto) {
        const buf = getCachedThumbBuffer(id) || getCachedThumbBuffer(entity.id.toString());
        if (buf && buf.length > 0) {
          thumbUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
        }
      }

      let title = '';
      if (isUser) {
        title = `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || entity.username || 'Telegram User';
      } else {
        title = entity.title || 'Untitled';
      }

      let participantsCount = undefined;
      if (typeof entity.participantsCount === 'number') {
        participantsCount = entity.participantsCount;
      } else if (typeof entity.participants_count === 'number') {
        participantsCount = entity.participants_count;
      }

      return {
        id,
        title,
        username: entity.username || undefined,
        isUser,
        isGroup,
        isChannel,
        isVerified: Boolean(entity.verified),
        hasAvatar: hasPhoto,
        thumbUrl,
        unreadCount: 0,
        unreadMentionsCount: 0,
        pinned: false,
        memberCount: participantsCount,
        participantsCount,
        date: Date.now(),
      };
    }

    const myResults = (res.myResults || []).map(formatPeerToDialog).filter(Boolean);
    const globalResults = (res.results || []).map(formatPeerToDialog).filter(Boolean);

    return {
      myResults,
      globalResults,
    };
  } catch (err) {
    console.error('[MTProto Search Error]:', err.message);
    return { myResults: [], globalResults: [] };
  }
}

/**
 * Join a public channel or group
 */
export async function joinChatOrChannel(peerId) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let entity = peerEntityCache.get(String(peerId));
  if (!entity) entity = peerEntityCache.get(`-100${peerId}`);
  if (!entity) entity = peerEntityCache.get(`-${peerId}`);
  if (!entity) {
    try {
      entity = await client.getEntity(peerId);
    } catch (e) {
      try {
        entity = await client.getEntity(BigInt(peerId));
      } catch (e2) {
        throw new Error(`Could not resolve entity for chat ${peerId}`);
      }
    }
  }

  try {
    if (entity.className === 'Channel') {
      await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
      console.log(`[MTProto] Joined channel ${peerId}`);
      return { success: true };
    } else if (entity.className === 'Chat') {
      await client.invoke(new Api.messages.AddChatUser({ chatId: entity.id, userId: 'me', fwdLimit: 100 }));
      console.log(`[MTProto] Joined chat ${peerId}`);
      return { success: true };
    } else {
      return { success: true };
    }
  } catch (err) {
    console.error(`[MTProto] Join error for ${peerId}:`, err.message);
    throw err;
  }
}

/**
 * Fetch authenticated user's profile with bio
 */
export async function getUserProfile() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const me = await client.getMe();
  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {
    console.warn('[MTProto] Could not fetch bio in getUserProfile:', e.message);
  }

  const sUser = serializeUser(me);
  if (sUser) sUser.bio = bio;

  return {
    success: true,
    user: sUser,
  };
}

/**
 * Update authenticated user's name, bio (about), and username on Telegram cloud via MTProto
 */
export async function updateUserProfile({ name, firstName, lastName, bio, username }) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let fName = firstName;
  let lName = lastName;
  if (name !== undefined && fName === undefined) {
    const trimmed = name.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx > 0) {
      fName = trimmed.slice(0, spaceIdx);
      lName = trimmed.slice(spaceIdx + 1);
    } else {
      fName = trimmed;
      lName = '';
    }
  }

  const updateFields = {};
  if (fName !== undefined) updateFields.firstName = fName;
  if (lName !== undefined) updateFields.lastName = lName;
  if (bio !== undefined) updateFields.about = bio;

  if (Object.keys(updateFields).length > 0) {
    await client.invoke(new Api.account.UpdateProfile(updateFields));
    console.log('[MTProto] Updated profile on Telegram cloud');
  }

  if (username !== undefined) {
    const cleanUsername = username.replace(/^@/, '').trim();
    const currentMe = await client.getMe();
    if ((currentMe.username || '') !== cleanUsername) {
      await client.invoke(new Api.account.UpdateUsername({ username: cleanUsername }));
      console.log('[MTProto] Updated username on Telegram cloud');
    }
  }

  const me = await client.getMe();
  let latestBio = bio !== undefined ? bio : '';
  if (bio === undefined) {
    try {
      const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
      latestBio = full?.fullUser?.about || full?.about || '';
    } catch (e) {}
  }

  const sUser = serializeUser(me);
  if (sUser) sUser.bio = latestBio;

  return {
    success: true,
    user: sUser,
  };
}

export async function uploadProfilePhoto({ fileBase64, filename, url }) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  let buffer;
  let name = filename || 'profile.jpg';

  if (url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TeleForge/1.0',
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to download image from URL (HTTP ${response.status})`);
      }
      const arrayBuf = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      if (!buffer || buffer.length < 100) {
        throw new Error('Downloaded file is empty or invalid image');
      }
      try {
        const urlPath = new URL(url).pathname;
        const base = path.basename(urlPath);
        if (base && /\.(jpe?g|png|webp|gif)$/i.test(base)) {
          name = base;
        }
      } catch (e) {}
    } catch (err) {
      throw new Error(`Could not fetch image from URL: ${err.message}`);
    }
  } else if (fileBase64) {
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '').trim();
    buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer || buffer.length < 100) {
      throw new Error('Uploaded file is empty or invalid image');
    }
  } else {
    throw new Error('Either fileBase64 or url must be provided');
  }

  if (!name.toLowerCase().endsWith('.jpg') && !name.toLowerCase().endsWith('.jpeg')) {
    name = `${path.parse(name).name || 'profile'}.jpg`;
  }

  const customFile = new CustomFile(name, buffer.length, '', buffer);
  const uploadedFile = await client.uploadFile({
    file: customFile,
    workers: 1,
  });

  const photoResult = await client.invoke(
    new Api.photos.UploadProfilePhoto({
      file: uploadedFile,
    })
  );

  console.log('[MTProto] Successfully uploaded profile photo to Telegram cloud');

  if (photoResult && photoResult.users && photoResult.users[0]) {
    client._me = photoResult.users[0];
  }

  const me = client._me || (await client.getMe());
  const myId = String(me.id);
  const photoId = photoResult?.photo?.id ? photoResult.photo.id.toString() : (me.photo?.photoId ? me.photo.photoId.toString() : (me.photo?.id ? me.photo.id.toString() : String(Date.now())));

  // Invalidate local memory and disk caches for both numeric user ID and 'me'
  for (const k of Array.from(avatarMemoryCache.keys())) {
    if (k === myId || k === 'me' || k.startsWith(`${myId}_`) || k.startsWith('me_')) {
      avatarMemoryCache.delete(k);
    }
  }
  for (const k of Array.from(thumbMemoryCache.keys())) {
    if (k === myId || k === 'me' || k.startsWith(`${myId}_`) || k.startsWith('me_')) {
      thumbMemoryCache.delete(k);
    }
  }
  negativeAvatarCache.delete(myId);
  negativeAvatarCache.delete('me');
  cachedDialogsResult = null;
  peerEntityCache.set(myId, me);
  peerEntityCache.set('me', me);

  // Remove ALL old avatar files for this user and 'me' from disk
  try {
    const files = fs.readdirSync(AVATARS_DIR);
    for (const f of files) {
      if (f.startsWith(myId) || f.startsWith('me')) {
        try {
          fs.unlinkSync(path.join(AVATARS_DIR, f));
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Write new avatar buffer to disk for all standard keys and variations
  try {
    fs.writeFileSync(path.join(AVATARS_DIR, `${myId}.jpg`), buffer);
    fs.writeFileSync(path.join(AVATARS_DIR, 'me.jpg'), buffer);
    fs.writeFileSync(path.join(AVATARS_DIR, `${myId}_${photoId}.jpg`), buffer);
    fs.writeFileSync(path.join(AVATARS_DIR, `me_${photoId}.jpg`), buffer);
    fs.writeFileSync(path.join(AVATARS_DIR, `${myId}_2.jpg`), buffer);
    fs.writeFileSync(path.join(AVATARS_DIR, 'me_2.jpg'), buffer);
  } catch (e) {
    console.error('[MTProto] Error writing avatar to disk cache:', e.message);
  }

  // Populate memory cache with the new avatar buffer
  avatarMemoryCache.set(myId, buffer);
  avatarMemoryCache.set('me', buffer);
  avatarMemoryCache.set(`${myId}_${photoId}`, buffer);
  avatarMemoryCache.set(`me_${photoId}`, buffer);
  avatarMemoryCache.set(`${myId}_2`, buffer);
  avatarMemoryCache.set('me_2', buffer);

  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {}

  const sUser = serializeUser(me);
  const avatarUrl = `/api/telegram/avatar?id=${encodeURIComponent(myId)}&v=${photoId}&t=${Date.now()}`;
  const base64DataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
  if (sUser) {
    sUser.bio = bio;
    sUser.hasAvatar = true;
    sUser.photoId = photoId;
    sUser.avatar = avatarUrl;
  }

  return {
    success: true,
    user: sUser,
    avatarUrl,
    dataUrl: base64DataUrl,
    photoId,
  };
}

export async function deleteProfilePhoto() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const me = await client.getMe();
  const myId = String(me.id);

  try {
    const userPhotos = await client.invoke(
      new Api.photos.GetUserPhotos({
        userId: 'me',
        offset: 0,
        maxId: 0,
        limit: 1,
      })
    );

    if (userPhotos && userPhotos.photos && userPhotos.photos.length > 0) {
      const photo = userPhotos.photos[0];
      if (photo.id) {
        await client.invoke(
          new Api.photos.DeletePhotos({
            id: [
              new Api.InputPhoto({
                id: photo.id,
                accessHash: photo.accessHash,
                fileReference: photo.fileReference,
              }),
            ],
          })
        );
        console.log('[MTProto] Successfully deleted profile photo on Telegram cloud');
      }
    }
  } catch (err) {
    console.error('[MTProto] Error deleting profile photo:', err.message);
    throw err;
  }

  for (const k of Array.from(avatarMemoryCache.keys())) {
    if (k === myId || k === 'me' || k.startsWith(`${myId}_`) || k.startsWith('me_')) {
      avatarMemoryCache.delete(k);
    }
  }
  for (const k of Array.from(thumbMemoryCache.keys())) {
    if (k === myId || k === 'me' || k.startsWith(`${myId}_`) || k.startsWith('me_')) {
      thumbMemoryCache.delete(k);
    }
  }
  negativeAvatarCache.delete(myId);
  negativeAvatarCache.delete('me');
  cachedDialogsResult = null;

  try {
    const files = fs.readdirSync(AVATARS_DIR);
    for (const f of files) {
      if (f.startsWith(myId) || f.startsWith('me')) {
        try {
          fs.unlinkSync(path.join(AVATARS_DIR, f));
        } catch (e) {}
      }
    }
  } catch (e) {}

  if (client._me) {
    client._me.photo = null;
  }

  const updatedMe = await client.getMe();
  if (updatedMe) {
    peerEntityCache.set(myId, updatedMe);
    peerEntityCache.set('me', updatedMe);
  }

  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {}

  const sUser = serializeUser(updatedMe);
  if (sUser) {
    sUser.bio = bio;
    sUser.hasAvatar = false;
    sUser.avatar = undefined;
    sUser.photoId = undefined;
  }

  return {
    success: true,
    user: sUser,
  };
}

export async function getUserFull(userId) {
  if (!userId) return {};
  const client = await getClient();
  let target = peerEntityCache.get(userId.toString());
  if (!target) {
    try {
      target = await client.getInputEntity(userId);
    } catch (e) {
      try {
        target = await client.getEntity(userId);
      } catch (e2) {
        target = null;
      }
    }
  }
  if (!target) return {};
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: target }));
    const u = full?.users?.[0] || full?.user;
    const fullUser = full?.fullUser;
    return {
      bio: fullUser?.about || '',
      phone: u?.phone || '',
      username: u?.username || '',
      name: [u?.firstName, u?.lastName].filter(Boolean).join(' ') || '',
    };
  } catch (err) {
    console.warn('[MTProto Backend] getUserFull error:', err.message);
    return {};
  }
}

export async function getOnlineGifs(query = '', offset = '') {
  const client = await getClient();
  try {
    let bot = peerEntityCache.get('gif_bot');
    if (!bot) {
      bot = await client.getInputEntity('gif');
      peerEntityCache.set('gif_bot', bot);
    }
    const peer = new Api.InputPeerSelf();
    const q = (query || '').trim() || 'trending';

    const res = await client.invoke(
      new Api.messages.GetInlineBotResults({
        bot,
        peer,
        query: q,
        offset: offset || '',
      })
    );

    const queryIdStr = res?.queryId ? res.queryId.toString() : '';
    const nextOffsetStr = res?.nextOffset || '';
    const results = [];

    for (const item of (res?.results || [])) {
      if (!item) continue;
      let thumbUrl = '';
      let gifUrl = '';
      let width;
      let height;

      if (item.content?.url && typeof item.content.url === 'string') {
        gifUrl = item.content.url;
      }
      if (item.thumb?.url && typeof item.thumb.url === 'string') {
        thumbUrl = item.thumb.url;
      }

      if (item.url && typeof item.url === 'string' && item.url.startsWith('http')) {
        const isDirectMedia = /\.(gif|mp4|webm|webp|png|jpg|jpeg)($|\?)/i.test(item.url) ||
          item.url.includes('/media.') || item.url.includes('/c.tenor.com');
        if (isDirectMedia) {
          if (!gifUrl) gifUrl = item.url;
          if (!thumbUrl) thumbUrl = item.url;
        }
      }

      if (thumbUrl && thumbUrl.includes('tenor.com')) {
        if (thumbUrl.includes('/nanogif.gif')) {
          thumbUrl = thumbUrl.replace('/nanogif.gif', '/tinygif.gif');
        } else if (thumbUrl.includes('/nanomp4.mp4')) {
          thumbUrl = thumbUrl.replace('/nanomp4.mp4', '/tinymp4.mp4');
        }
      }
      if (gifUrl && gifUrl.includes('tenor.com')) {
        if (gifUrl.includes('/nanogif.gif')) {
          gifUrl = gifUrl.replace('/nanogif.gif', '/mediumgif.gif');
        } else if (gifUrl.includes('/nanomp4.mp4')) {
          gifUrl = gifUrl.replace('/nanomp4.mp4', '/mediummp4.mp4');
        }
      }

      const doc = item.document;
      if (doc) {
        const dId = doc.id ? doc.id.toString() : '';
        cacheDocument(doc);

        gifUrl = `/api/telegram/document?id=${dId}&mimeType=video/mp4`;
        thumbUrl = `/api/telegram/document?id=${dId}&thumb=1`;

        const videoAttr = (doc.attributes || []).find(
          (a) => a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo'
        );
        if (videoAttr) {
          width = videoAttr.w;
          height = videoAttr.h;
        }

        const stripped = (doc.thumbs || []).find(
          (t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
        );
        let previewThumb = '';
        if (stripped?.bytes) {
          try {
            const jpgBuf = strippedPhotoToJpg(stripped.bytes);
            if (jpgBuf) {
              previewThumb = `data:image/jpeg;base64,${Buffer.from(jpgBuf).toString('base64')}`;
            }
          } catch (e) {}
        }

        results.push({
          id: item.id,
          url: gifUrl,
          thumbUrl: thumbUrl,
          previewThumb: previewThumb || thumbUrl,
          title: item.title || q,
          width,
          height,
          queryId: queryIdStr,
          rawItem: item,
        });
        continue;
      }

      results.push({
        id: item.id,
        url: gifUrl || thumbUrl,
        thumbUrl: thumbUrl || gifUrl,
        title: item.title || q,
        width,
        height,
        queryId: queryIdStr,
        rawItem: item,
      });
    }

    return { results, nextOffset: nextOffsetStr };
  } catch (err) {
    console.warn('[MTProto Backend] getOnlineGifs error:', err.message);
    return { results: [], nextOffset: '' };
  }
}

export async function getInstalledStickerSets() {
  const client = await getClient();
  try {
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) return [];

    const res = await client.invoke(new Api.messages.GetAllStickers({ hash: BigInt(0) }));
    const sets = res?.sets || [];
    const result = [];

    for (const s of sets) {
      if (!s || s.archived) continue;
      let thumbUrl = '';
      if (s.thumbs) {
        const stripped = (s.thumbs || []).find(
          (t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
        );
        if (stripped?.bytes) {
          try {
            const jpgBuf = strippedPhotoToJpg(stripped.bytes);
            if (jpgBuf) {
              thumbUrl = `data:image/jpeg;base64,${Buffer.from(jpgBuf).toString('base64')}`;
            }
          } catch (e) {}
        }
      }

      result.push({
        id: s.id ? s.id.toString() : '',
        accessHash: s.accessHash ? s.accessHash.toString() : '',
        title: s.title || 'Sticker Set',
        shortName: s.shortName || '',
        count: s.count || 0,
        thumbUrl,
      });
    }

    return result;
  } catch (e) {
    console.warn('[MTProto Backend] getInstalledStickerSets error:', e.message);
    return [];
  }
}

export async function getStickerSet(stickerset) {
  const client = await getClient();
  try {
    let inputSet;
    if (stickerset.id && stickerset.accessHash) {
      inputSet = new Api.InputStickerSetID({
        id: BigInt(stickerset.id),
        accessHash: BigInt(stickerset.accessHash),
      });
    } else if (stickerset.shortName) {
      inputSet = new Api.InputStickerSetShortName({
        shortName: stickerset.shortName,
      });
    } else {
      return null;
    }

    const res = await client.invoke(
      new Api.messages.GetStickerSet({
        stickerset: inputSet,
        hash: 0,
      })
    );

    const s = res?.set;
    if (!s) return null;

    const stickers = [];
    const docs = res.documents || [];
    const packs = res.packs || [];

    const emojiMap = new Map();
    for (const pack of packs) {
      const emoji = pack.emoticon;
      for (const docId of pack.documents || []) {
        emojiMap.set(docId.toString(), emoji);
      }
    }

    for (const doc of docs) {
      if (!doc) continue;
      const dId = doc.id ? doc.id.toString() : '';
      const aHash = doc.accessHash ? doc.accessHash.toString() : '';
      const fileRef = doc.fileReference ? Buffer.from(doc.fileReference).toString('hex') : undefined;
      cacheDocument(doc);
      let thumbUrl = '';

      const stripped = (doc.thumbs || []).find(
        (t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize'
      );
      if (stripped?.bytes) {
        try {
          const jpgBuf = strippedPhotoToJpg(stripped.bytes);
          if (jpgBuf) {
            thumbUrl = `data:image/jpeg;base64,${Buffer.from(jpgBuf).toString('base64')}`;
          }
        } catch (e) {}
      }
      if (!thumbUrl) {
        thumbUrl = `/api/telegram/document?id=${dId}&thumb=m`;
      }

      stickers.push({
        id: dId,
        documentId: dId,
        accessHash: aHash,
        fileReference: fileRef,
        emoji: emojiMap.get(dId),
        thumbUrl,
        url: `/api/telegram/document?id=${dId}&thumb=m`,
        rawDoc: doc,
      });
    }

    return {
      id: s.id ? s.id.toString() : '',
      accessHash: s.accessHash ? s.accessHash.toString() : '',
      title: s.title || 'Sticker Set',
      shortName: s.shortName || '',
      count: stickers.length,
      stickers,
    };
  } catch (e) {
    console.warn('[MTProto Backend] getStickerSet error:', e.message);
    return null;
  }
}

export async function installStickerSet(stickerset) {
  const client = await getClient();
  try {
    let inputSet;
    if (stickerset.id && stickerset.accessHash) {
      inputSet = new Api.InputStickerSetID({
        id: BigInt(stickerset.id),
        accessHash: BigInt(stickerset.accessHash),
      });
    } else if (stickerset.shortName) {
      inputSet = new Api.InputStickerSetShortName({
        shortName: stickerset.shortName,
      });
    } else {
      return false;
    }

    await client.invoke(
      new Api.messages.InstallStickerSet({
        stickerset: inputSet,
        archived: false,
      })
    );
    return true;
  } catch (e) {
    console.warn('[MTProto Backend] installStickerSet error:', e.message);
    return false;
  }
}

export async function faveSticker(documentId, accessHash, fileReference) {
  const client = await getClient();
  try {
    const inputDoc = new Api.InputDocument({
      id: BigInt(documentId),
      accessHash: BigInt(accessHash),
      fileReference: fileReference ? Buffer.from(fileReference, 'hex') : Buffer.alloc(0),
    });

    await client.invoke(
      new Api.messages.FaveSticker({
        id: inputDoc,
        unfave: false,
      })
    );
    return true;
  } catch (e) {
    console.warn('[MTProto Backend] faveSticker error:', e.message);
    return false;
  }
}

export async function sendStickerDocument(chatId, docOrInput, replyToMsgId) {
  const client = await getClient();
  let targetPeer = peerEntityCache.get(chatId.toString());
  if (!targetPeer) {
    targetPeer = await client.getInputEntity(chatId);
  }

  let fileToSend = docOrInput;
  if (docOrInput && typeof docOrInput === 'object' && docOrInput.documentId && docOrInput.accessHash) {
    fileToSend = new Api.InputDocument({
      id: BigInt(docOrInput.documentId),
      accessHash: BigInt(docOrInput.accessHash),
      fileReference: docOrInput.fileReference ? Buffer.from(docOrInput.fileReference, 'hex') : Buffer.alloc(0),
    });
  }

  const sendParams = { file: fileToSend };
  if (replyToMsgId) {
    sendParams.replyTo = parseInt(replyToMsgId, 10);
  }

  const result = await client.sendMessage(targetPeer, sendParams);
  return {
    id: result.id,
    text: '',
    date: result.date ? result.date * 1000 : Date.now(),
    out: true,
    hasMedia: true,
    mediaType: 'sticker',
    reactions: [],
  };
}

export function formatBackendMessage(m, chatId) {
  let senderEntity = null;
  let senderIdStr = '';
  if (m.senderId) {
    senderIdStr = m.senderId.toString();
  } else if (m.fromId) {
    if (m.fromId.userId) senderIdStr = m.fromId.userId.toString();
    else if (m.fromId.channelId) senderIdStr = `-100${m.fromId.channelId.toString()}`;
    else if (m.fromId.chatId) senderIdStr = `-${m.fromId.chatId.toString()}`;
  } else if (m.peerId) {
    if (m.peerId.userId) senderIdStr = m.peerId.userId.toString();
    else if (m.peerId.channelId) senderIdStr = `-100${m.peerId.channelId.toString()}`;
    else if (m.peerId.chatId) senderIdStr = `-${m.peerId.chatId.toString()}`;
  }

  if (senderIdStr && peerEntityCache.has(senderIdStr)) {
    senderEntity = peerEntityCache.get(senderIdStr);
  }

  let senderName = '';
  if (senderEntity) {
    if (senderEntity.title) {
      senderName = senderEntity.title;
    } else {
      senderName = [senderEntity.firstName, senderEntity.lastName].filter(Boolean).join(' ');
    }
  }
  if (!senderName && m.postAuthor) {
    senderName = m.postAuthor;
  }

  let senderAvatar = undefined;
  let senderThumbUrl = undefined;
  if (!m.out && senderIdStr) {
    const cachedBuf = getCachedThumbBuffer(senderIdStr);
    if (cachedBuf && cachedBuf.length > 0) {
      try {
        senderThumbUrl = `data:image/jpeg;base64,${cachedBuf.toString('base64')}`;
      } catch (e) {}
    }
    senderAvatar = `/api/telegram/avatar?id=${encodeURIComponent(senderIdStr)}`;
  }

  let hasMedia = Boolean(m.media);
  let mediaType = null;
  let mediaThumb = undefined;
  let fileName = null;
  let fileSize = null;
  let durationStr = undefined;
  let isRound = false;
  let isSticker = false;
  let isGif = false;
  let stickerEmoji = undefined;
  let stickerSet = undefined;
  let documentId = undefined;
  let accessHash = undefined;
  let fileReference = undefined;

  if (m.media) {
    const cls = m.media.className || m.media._ || '';
    if (cls.includes('Photo')) {
      mediaType = 'photo';
      let strippedBytes = m.media.photo?.strippedThumb;
      if (!strippedBytes && Array.isArray(m.media.photo?.sizes)) {
        const strippedObj = m.media.photo.sizes.find(
          (s) => s._ === 'photoStrippedSize' || s.className === 'PhotoStrippedSize' || s.bytes
        );
        if (strippedObj?.bytes) strippedBytes = strippedObj.bytes;
      }
      if (strippedBytes) {
        try {
          const thumbBuf = strippedPhotoToJpg(strippedBytes);
          if (thumbBuf && thumbBuf.length > 0) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
          }
        } catch (e) {}
      }
      if (!mediaThumb && Array.isArray(m.media.photo?.sizes)) {
        const cachedObj = m.media.photo.sizes.find(
          (s) => s._ === 'photoCachedSize' || s.className === 'PhotoCachedSize'
        );
        if (cachedObj?.bytes) {
          mediaThumb = `data:image/jpeg;base64,${Buffer.from(cachedObj.bytes).toString('base64')}`;
        }
      }
    } else if (cls.includes('Document')) {
      const doc = m.media.document;
      if (doc) {
        documentId = doc.id ? doc.id.toString() : undefined;
        accessHash = doc.accessHash ? doc.accessHash.toString() : undefined;
        if (doc.fileReference) {
          try {
            fileReference = Buffer.from(doc.fileReference).toString('hex');
          } catch (e) {}
        }
      }

      const attrs = doc?.attributes || [];
      const stickerAttr = attrs.find((a) => a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker');
      if (stickerAttr) {
        stickerEmoji = stickerAttr.alt || undefined;
        if (stickerAttr.stickerset) {
          const ss = stickerAttr.stickerset;
          stickerSet = {
            id: ss.id ? ss.id.toString() : undefined,
            accessHash: ss.accessHash ? ss.accessHash.toString() : undefined,
            shortName: ss.shortName || undefined,
          };
        }
      }
      isSticker = Boolean(stickerAttr);
      const isGifAttr = attrs.some((a) => a._ === 'documentAttributeAnimated' || a.className === 'DocumentAttributeAnimated');
      const videoAttr = attrs.find((a) => a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo');
      isRound = Boolean(videoAttr?.roundMessage);
      const isVoice = attrs.some((a) => (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && a.voice);
      const isAudio = attrs.some((a) => (a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio') && !a.voice);
      const filenameAttr = attrs.find((a) => a._ === 'documentAttributeFilename' || a.className === 'DocumentAttributeFilename');

      const mime = (m.media.document?.mimeType || '').toLowerCase();

      const fn = (filenameAttr?.fileName || '').toLowerCase();
      const isVideoFile = videoAttr || mime.startsWith('video/') || /\.(mp4|mkv|mov|webm|avi|flv|m4v|3gp|ts)$/i.test(fn);

      if (isSticker || mime === 'image/webp' || mime === 'application/x-tgsticker') {
        mediaType = 'sticker';
        isSticker = true;
      } else if (isRound) {
        mediaType = 'videoNote';
      } else if (isGifAttr) {
        mediaType = 'gif';
        isGif = true;
      } else if (isVideoFile) {
        mediaType = 'video';
      } else if (isVoice) {
        mediaType = 'voice';
      } else if (isAudio || mime.startsWith('audio/')) {
        mediaType = 'audio';
      } else if (mime.startsWith('image/')) {
        mediaType = 'photo';
      } else {
        mediaType = 'document';
      }

      const rawDuration = videoAttr?.duration ?? (isVoice || isAudio ? attrs.find((a) => a._ === 'documentAttributeAudio' || a.className === 'DocumentAttributeAudio')?.duration : undefined);
      if (rawDuration != null) {
        const totalSecs = Math.round(Number(rawDuration));
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }

      if (m.media.document?.thumbs) {
        const stripped = m.media.document.thumbs.find((t) => t._ === 'photoStrippedSize' || t.className === 'PhotoStrippedSize');
        if (stripped?.bytes) {
          try {
            const thumbBuf = strippedPhotoToJpg(stripped.bytes);
            if (thumbBuf && thumbBuf.length > 0) {
              mediaThumb = `data:image/jpeg;base64,${Buffer.from(thumbBuf).toString('base64')}`;
            }
          } catch (e) {}
        }
        if (!mediaThumb) {
          const cached = m.media.document.thumbs.find((t) => (t._ === 'photoCachedSize' || t.className === 'PhotoCachedSize') && t.bytes);
          if (cached?.bytes) {
            mediaThumb = `data:image/jpeg;base64,${Buffer.from(cached.bytes).toString('base64')}`;
          }
        }
      }

      if (filenameAttr) fileName = filenameAttr.fileName;
      fileSize = m.media.document?.size ? formatBytes(Number(m.media.document.size)) : null;
    }
  }

  let reactions = [];
  if (m.reactions && m.reactions.results) {
    reactions = m.reactions.results.map((r) => {
      let emojiStr = '👍';
      if (r.reaction && r.reaction.emoticon) {
        emojiStr = r.reaction.emoticon;
      } else if (typeof r.reaction === 'string') {
        emojiStr = r.reaction;
      }
      return {
        emoji: emojiStr,
        count: r.count || 1,
        userReacted: Boolean(r.chosenOrder !== undefined && r.chosenOrder !== null),
      };
    });
  }

  return {
    id: m.id,
    text: m.message || '',
    date: m.date ? m.date * 1000 : Date.now(),
    out: Boolean(m.out),
    senderId: senderIdStr,
    senderName: senderName || undefined,
    senderAvatar,
    senderThumbUrl,
    hasMedia,
    mediaType,
    mediaThumb,
    fileName,
    fileSize,
    duration: durationStr,
    isRound,
    isSticker,
    isGif,
    stickerEmoji,
    stickerSet,
    documentId,
    accessHash,
    fileReference,
    replyToMsgId: m.replyTo?.replyToMsgId,
    reactions,
  };
}

export async function getChatSharedMediaList(chatId, type, limit = 50) {
  if (!chatId) return [];
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const targetPeer = await resolveInputPeer(chatId);

  let filter;
  if (type === 'photos') {
    filter = new Api.InputMessagesFilterPhotos();
  } else if (type === 'videos') {
    filter = new Api.InputMessagesFilterVideo();
  } else if (type === 'audio') {
    filter = new Api.InputMessagesFilterMusic();
  } else {
    filter = new Api.InputMessagesFilterDocument();
  }

  let messages = await client.getMessages(targetPeer, {
    filter,
    limit: Math.min(Number(limit) || 50, 100),
  });

  // If "videos" tab returned 0, search document messages for video files (.mkv, .mp4, etc.)
  if (type === 'videos' && (!messages || messages.length === 0)) {
    try {
      const docMessages = await client.getMessages(targetPeer, {
        filter: new Api.InputMessagesFilterDocument(),
        limit: Math.min(Number(limit) || 50, 100),
      });
      const videoDocs = (docMessages || []).filter((m) => {
        const mime = (m.media?.document?.mimeType || '').toLowerCase();
        const fn = (m.media?.document?.attributes?.find(a => a._ === 'documentAttributeFilename' || a.className === 'DocumentAttributeFilename')?.fileName || '').toLowerCase();
        return mime.startsWith('video/') || /\.(mp4|mkv|mov|webm|avi|flv|m4v|3gp|ts)$/i.test(fn);
      });
      if (videoDocs.length > 0) {
        messages = videoDocs;
      }
    } catch (e) {}
  }

  return (messages || []).map((m) => formatBackendMessage(m, chatId));
}

export async function getSessionsList() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  const res = await client.invoke(new Api.account.GetAuthorizations());
  const rawList = res?.authorizations || [];
  return rawList.map((auth) => ({
    hash: auth.hash ? auth.hash.toString() : '',
    deviceModel: auth.deviceModel || 'Unknown Device',
    platform: auth.platform || '',
    systemVersion: auth.systemVersion || '',
    appName: auth.appName || 'TeleForge Client',
    appVersion: auth.appVersion || '1.0.0',
    dateActive: Number(auth.dateActive || 0),
    dateCreated: Number(auth.dateCreated || 0),
    ip: auth.ip || '',
    country: auth.country || '',
    region: auth.region || '',
    current: Boolean(auth.current),
    officialApp: Boolean(auth.officialApp),
  }));
}

export async function terminateSessionByHash(hash) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }
  await client.invoke(new Api.account.ResetAuthorization({ hash: bigInt(hash) }));
  return { success: true };
}

export async function terminateAllOtherSessions() {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }
  await client.invoke(new Api.auth.ResetAuthorizations());
  return { success: true };
}

export async function getPrivacySetting(keyType) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }
  const inputKey = keyType === 'phoneNumber'
    ? new Api.InputPrivacyKeyPhoneNumber()
    : new Api.InputPrivacyKeyStatusTimestamp();
  const res = await client.invoke(new Api.account.GetPrivacy({ key: inputKey }));
  const rules = res?.rules || [];
  const disallowsAll = rules.some((r) => r.className === 'PrivacyValueDisallowAll' || r._ === 'privacyValueDisallowAll');
  const allowsContacts = rules.some((r) => r.className === 'PrivacyValueAllowContacts' || r._ === 'privacyValueAllowContacts');
  const allowsAll = rules.some((r) => r.className === 'PrivacyValueAllowAll' || r._ === 'privacyValueAllowAll');
  if (disallowsAll) return 'nobody';
  if (allowsContacts) return 'contacts';
  if (allowsAll) return 'everybody';
  return 'everybody';
}

export async function setPrivacySetting(keyType, rule) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }
  const inputKey = keyType === 'phoneNumber'
    ? new Api.InputPrivacyKeyPhoneNumber()
    : new Api.InputPrivacyKeyStatusTimestamp();
  let rules = [];
  if (rule === 'everybody') {
    rules = [new Api.InputPrivacyValueAllowAll()];
  } else if (rule === 'contacts') {
    rules = [new Api.InputPrivacyValueAllowContacts()];
  } else {
    rules = [new Api.InputPrivacyValueDisallowAll()];
  }
  await client.invoke(new Api.account.SetPrivacy({ key: inputKey, rules }));
  return { success: true };
}

export function swapAudioTracks(headerBuf, targetIdx) {
  if (!headerBuf || headerBuf.length < 500) return headerBuf;
  // Matroska EBML: 0x1A 0x45 0xDF 0xA3
  if (headerBuf[0] === 0x1A && headerBuf[1] === 0x45 && headerBuf[2] === 0xDF && headerBuf[3] === 0xA3) {
    const entries = [];
    const searchLimit = Math.min(headerBuf.length, 16384);
    for (let i = 0; i < searchLimit; i++) {
      if (headerBuf[i] === 0xAE) entries.push(i);
    }
    const audioEntries = [];
    for (let idx = 0; idx < entries.length; idx++) {
      const start = entries[idx];
      const end = idx + 1 < entries.length ? entries[idx + 1] : start + 300;
      const slice = headerBuf.slice(start, end);
      const strSlice = slice.toString('binary');
      if (slice.includes(Buffer.from([0x83, 0x81, 0x02])) || /A_[A-Z0-9_\/]+/.test(strSlice)) {
        const isEac3OrAc3 = /A_(EAC3|AC3|DTS)/.test(strSlice);
        const isBrowserSupported = /A_(AAC|MPEG\/L3|OPUS|VORBIS|FLAC)/.test(strSlice);
        audioEntries.push({ start, end, slice, isEac3OrAc3, isBrowserSupported });
      }
    }

    let swapWithIdx = -1;
    if (targetIdx !== undefined && targetIdx !== null && targetIdx > 0 && targetIdx < audioEntries.length) {
      swapWithIdx = targetIdx;
    } else if (targetIdx === 0) {
      swapWithIdx = -1;
    } else if (targetIdx === undefined || targetIdx === null) {
      // If Track 1 is an unsupported codec (EAC3 / AC3 / DTS), auto-promote the first browser-supported track (AAC)
      if (audioEntries.length > 1 && audioEntries[0].isEac3OrAc3) {
        const aacIdx = audioEntries.findIndex((e, i) => i > 0 && e.isBrowserSupported);
        if (aacIdx > 0) {
          swapWithIdx = aacIdx;
          console.log('[Backend] Auto-promoting browser-compatible audio track (AAC) at index', aacIdx);
        }
      }
    }

    if (swapWithIdx > 0 && swapWithIdx < audioEntries.length) {
      const first = audioEntries[0];
      const target = audioEntries[swapWithIdx];
      return Buffer.concat([
        headerBuf.slice(0, first.start),
        target.slice,
        headerBuf.slice(first.end, target.start),
        first.slice,
        headerBuf.slice(target.end)
      ]);
    }
  }
  return headerBuf;
}

export async function streamMediaResponse(chatId, messageId, req, res) {
  const cleanChat = String(chatId).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanMsg = String(messageId).replace(/[^a-zA-Z0-9_-]/g, '');
  const diskBinPath = path.join(MEDIA_CACHE_DIR, `${cleanChat}_${cleanMsg}.bin`);
  const diskMetaPath = path.join(MEDIA_CACHE_DIR, `${cleanChat}_${cleanMsg}.json`);

  const targetAudioTrack = req.url.includes('audioTrack=')
    ? parseInt(req.url.split('audioTrack=')[1], 10)
    : 0;

  const isTranscodeParam = req.url.includes('transcode=1') || req.url.includes('compat=1');
  const startSec = parseFloat(req.url.match(/[?&](?:ss|start|t)=(\d+(?:\.\d+)?)/)?.[1] || '0');

  // 1. Fetch message metadata from Telegram MTProto
  const client = await getClient();
  const targetPeer = await resolveInputPeer(chatId);

  const messages = await client.getMessages(targetPeer, { ids: [parseInt(messageId, 10)] });
  const msg = messages?.[0];
  if (!msg || !msg.media) {
    res.statusCode = 404;
    return res.end('Media not found');
  }

  const media = msg.media;
  const cls = media.className || media._ || '';
  const isDoc = cls.includes('Document') && media.document;

  // If photo or other non-document media, use downloadMessageMedia fallback
  if (!isDoc) {
    const mediaObj = await downloadMessageMedia(chatId, messageId, {});
    if (!mediaObj || !mediaObj.buffer) {
      res.statusCode = 404;
      return res.end('Media not found');
    }
    res.statusCode = 200;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', mediaObj.buffer.length);
    res.setHeader('Content-Type', mediaObj.mimeType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(mediaObj.buffer);
  }

  const doc = media.document;
  cacheDocument(doc);
  const total = Number(doc.size || 0);

  const fileNameAttr = doc.attributes?.find(a => a._ === 'documentAttributeFilename' || a.className === 'DocumentAttributeFilename');
  const fileName = (fileNameAttr?.fileName || '').toLowerCase();
  const rawMime = (doc.mimeType || '').toLowerCase();

  // Detect if this document is a sticker
  const isSticker = (doc.attributes || []).some(
    (a) => a._ === 'documentAttributeSticker' || a.className === 'DocumentAttributeSticker'
  ) || rawMime === 'image/webp' || rawMime === 'application/x-tgsticker';

  // Detect if this document is a video (excluding stickers)
  const hasVideoAttr = doc.attributes?.some(a => a._ === 'documentAttributeVideo' || a.className === 'DocumentAttributeVideo');
  const isVideoMime = rawMime.startsWith('video/');
  const isVideoExt = /\.(mp4|mkv|avi|mov|m4v|webm|flv|wmv|ts|3gp|ogv)$/.test(fileName);
  const isVideo = !isSticker && (hasVideoAttr || isVideoMime || isVideoExt);

  // If this document is NOT a video (e.g. Sticker, Image, Audio, Document):
  // serve via downloadMessageMedia so it has the correct Content-Type (image/webp, image/jpeg, etc.) and Status 200!
  if (!isVideo) {
    const mediaObj = await downloadMessageMedia(chatId, messageId, {});
    if (!mediaObj || !mediaObj.buffer) {
      res.statusCode = 404;
      return res.end('Media not found');
    }
    res.statusCode = 200;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', mediaObj.buffer.length);
    res.setHeader('Content-Type', mediaObj.mimeType || rawMime || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(mediaObj.buffer);
  }

  const isMkv = rawMime.includes('matroska') || fileName.endsWith('.mkv');
  const isNonMp4 = isMkv || rawMime.includes('avi') || rawMime.includes('flv') || rawMime.includes('wmv') || fileName.endsWith('.avi') || fileName.endsWith('.flv') || fileName.endsWith('.wmv') || fileName.endsWith('.ts');

  // MKV and non-MP4 formats, or explicit transcode/track selection go through FFmpeg.
  // Standard MP4 files go to direct HTTP 206 progressive Range streaming for instant 0ms playback!
  const needsFfmpeg = isNonMp4 || isTranscodeParam || targetAudioTrack > 0;

  // 2. Transmux / Transcode via FFmpeg so MKV and non-MP4 play 100% inside TeleForge
  if (needsFfmpeg && ffmpegPath) {
    // Kill any existing FFmpeg process for this exact file so concurrent requests do not fight for MTProto bandwidth
    const streamKey = `${cleanChat}_${cleanMsg}`;
    if (activeFFmpegStreams.has(streamKey)) {
      try {
        const oldProc = activeFFmpegStreams.get(streamKey);
        oldProc.kill('SIGKILL');
      } catch (e) {}
      activeFFmpegStreams.delete(streamKey);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Fast probe size (1MB / 1s) so FFmpeg starts outputting in under 1 second
    const ffmpegArgs = [
      '-loglevel', 'warning',
      '-probesize', '1000000',       // 1 MB max probe (instant start)
      '-analyzeduration', '1000000', // 1s max analysis
    ];
    if (startSec > 0) {
      ffmpegArgs.push('-ss', String(startSec));
    }

    const inputArg = fs.existsSync(diskBinPath) ? diskBinPath : 'pipe:0';
    let isHevc = /hevc|h\.?265|x265|10bit|10-bit|hdr/i.test(fileName);
    let firstChunk = null;

    if (inputArg === 'pipe:0' && !isHevc) {
      const loc = new Api.InputDocumentFileLocation({
        id: doc.id,
        accessHash: doc.accessHash,
        fileReference: doc.fileReference,
        thumbSize: '',
      });
      try {
        for await (const chunk of client.iterDownload({
          file: loc,
          dcId: doc.dcId,
          offset: bigInt(0),
          requestSize: 512 * 1024,
          limit: 1,
        })) {
          firstChunk = chunk;
          const chunkStr = chunk.toString('binary');
          if (chunkStr.includes('V_MPEGH/ISO/HEVC') || chunkStr.includes('hev1') || chunkStr.includes('hvc1')) {
            isHevc = true;
          }
          break;
        }
      } catch (e) {
        console.warn('[Backend] Error checking initial chunk for codec:', e.message);
      }
    } else if (inputArg !== 'pipe:0') {
      try {
        const fd = fs.openSync(diskBinPath, 'r');
        const b = Buffer.alloc(64 * 1024);
        const bytesRead = fs.readSync(fd, b, 0, b.length, 0);
        fs.closeSync(fd);
        const headerStr = b.subarray(0, bytesRead).toString('binary');
        if (headerStr.includes('V_MPEGH/ISO/HEVC') || headerStr.includes('hev1') || headerStr.includes('hvc1')) {
          isHevc = true;
        }
      } catch (e) {}
    }

    if (res.writableEnded) return;

    const shouldTranscodeVideo = isTranscodeParam || isHevc;

    ffmpegArgs.push('-i', inputArg);
    // Use 0:V:0? (Capital V) to map only pure video streams, excluding attached cover pictures/posters!
    ffmpegArgs.push('-map', '0:V:0?', '-map', `0:a:${targetAudioTrack || 0}?`);

    if (shouldTranscodeVideo) {
      // Universal H.264 playback for 100% of browsers (fixes HEVC audio playing with only thumbnail visible)
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '24',
        '-pix_fmt', 'yuv420p'
      );
    } else {
      // Direct stream copy (0% CPU for compatible H.264 codecs)
      ffmpegArgs.push('-c:v', 'copy');
    }

    // Always convert audio to AAC for universal browser support (fixes Dolby EAC3/AC3 silence)
    ffmpegArgs.push(
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-flush_packets', '1',
      '-f', 'mp4',
      'pipe:1'
    );

    console.log(`[FFmpeg] Streaming: ${fileName || rawMime} (${(total / 1048576).toFixed(1)} MB) transcodeVideo=${shouldTranscodeVideo} (isHevc=${isHevc}) audioTrack=${targetAudioTrack} input=${inputArg === 'pipe:0' ? 'MTProto' : 'disk'}`);

    const proc = spawn(ffmpegPath, ffmpegArgs);
    activeFFmpegStreams.set(streamKey, proc);

    // Pipe FFmpeg stdout to HTTP response
    proc.stdout.pipe(res);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try { proc.kill('SIGKILL'); } catch (e) {}
      if (activeFFmpegStreams.get(streamKey) === proc) {
        activeFFmpegStreams.delete(streamKey);
      }
    };

    req.on('close', cleanup);
    res.on('finish', cleanup);
    proc.on('error', (err) => {
      console.warn('[FFmpeg] Process error:', err.message);
      cleanup();
    });
    proc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.warn('[FFmpeg]', msg);
    });
    proc.stdin.on('error', () => {});

    // If reading from disk file, ffmpeg reads on its own — no need to pipe stdin
    if (inputArg !== 'pipe:0') {
      return;
    }

    const loc = new Api.InputDocumentFileLocation({
      id: doc.id,
      accessHash: doc.accessHash,
      fileReference: doc.fileReference,
      thumbSize: '',
    });

    try {
      if (firstChunk) {
        const canWrite = proc.stdin.write(firstChunk);
        if (!canWrite) {
          await new Promise((resolve) => proc.stdin.once('drain', resolve));
        }
      }
      for await (const chunk of client.iterDownload({
        file: loc,
        dcId: doc.dcId,
        offset: firstChunk ? bigInt(firstChunk.length) : bigInt(0),
        requestSize: 512 * 1024,
      })) {
        if (cleanedUp || res.writableEnded || proc.killed) break;
        const canWrite = proc.stdin.write(chunk);
        if (!canWrite) {
          await new Promise((resolve) => proc.stdin.once('drain', resolve));
        }
      }
      if (!proc.killed) {
        proc.stdin.end();
      }
    } catch (err) {
      console.warn('[Backend] streamWithFfmpeg iterDownload error:', err?.message || err);
      cleanup();
    }
    return;
  }

  // 3. Direct HTTP 206 progressive Range streaming for native MP4
  if (fs.existsSync(diskBinPath)) {
    try {
      const stat = fs.statSync(diskBinPath);
      const totalDisk = stat.size;
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        let end = parts[1] ? parseInt(parts[1], 10) : totalDisk - 1;
        const MAX_STREAM_WINDOW = 16 * 1024 * 1024;
        if (!parts[1] && end - start + 1 > MAX_STREAM_WINDOW) {
          end = Math.min(start + MAX_STREAM_WINDOW - 1, totalDisk - 1);
        }
        const chunkSize = end - start + 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalDisk}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunkSize);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const stream = fs.createReadStream(diskBinPath, { start, end });
        return stream.pipe(res);
      } else {
        res.statusCode = 200;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', totalDisk);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const stream = fs.createReadStream(diskBinPath);
        return stream.pipe(res);
      }
    } catch (e) {
      console.warn('[Backend] Error reading disk media cache:', e.message);
    }
  }

  // Live MTProto progressive 206 streaming for native MP4
  const range = req.headers.range;
  let start = 0;
  let end = total > 0 ? total - 1 : 0;
  let hasExplicitEnd = false;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10) || 0;
    if (parts[1]) {
      end = parseInt(parts[1], 10);
      hasExplicitEnd = true;
    }
  }
  if (end >= total && total > 0) {
    end = total - 1;
  }

  const MAX_STREAM_WINDOW = 16 * 1024 * 1024; // 16 MB
  if (!hasExplicitEnd && (end - start + 1 > MAX_STREAM_WINDOW)) {
    end = Math.min(start + MAX_STREAM_WINDOW - 1, total - 1);
  }
  const chunkSize = end - start + 1;

  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', chunkSize);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const loc = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: '',
  });

  const CHUNK_SIZE = 512 * 1024;
  const limit = Math.ceil(chunkSize / CHUNK_SIZE);

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let bytesWritten = 0;
  try {
    for await (const chunk of client.iterDownload({
      file: loc,
      dcId: doc.dcId,
      offset: bigInt(start),
      requestSize: CHUNK_SIZE,
      limit,
    })) {
      if (aborted || res.writableEnded) {
        break;
      }
      const needed = chunkSize - bytesWritten;
      if (needed <= 0) break;
      let toSend = chunk.length > needed ? chunk.slice(0, needed) : chunk;
      res.write(toSend);
      bytesWritten += toSend.length;
      if (bytesWritten >= chunkSize) break;
    }
    if (!res.writableEnded) {
      res.end();
    }
  } catch (err) {
    console.warn('[Backend] streamMediaResponse iterDownload error:', err?.message || err);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

const LANGUAGE_NAMES_MAP = {
  en: 'English', eng: 'English',
  hi: 'Hindi', hin: 'Hindi',
  tam: 'Tamil', ta: 'Tamil',
  tel: 'Telugu', te: 'Telugu',
  mal: 'Malayalam', ml: 'Malayalam',
  kan: 'Kannada', kn: 'Kannada',
  es: 'Spanish', spa: 'Spanish',
  fr: 'French', fra: 'French', fre: 'French',
  de: 'German', deu: 'German', ger: 'German',
  ru: 'Russian', rus: 'Russian',
  ar: 'Arabic', ara: 'Arabic',
  zh: 'Chinese', zho: 'Chinese',
  ja: 'Japanese', jpn: 'Japanese',
  ko: 'Korean', kor: 'Korean',
  it: 'Italian', ita: 'Italian',
  pt: 'Portuguese', por: 'Portuguese',
  ur: 'Urdu', urd: 'Urdu',
};

function parseAudioTracksFromBuffer(buf) {
  const tracks = [];
  if (!buf || buf.length < 16) return tracks;

  // 1. MKV / WebM EBML check
  if (buf.length > 4 && buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) {
    const str = buf.toString('binary');
    const audioCodecRegex = /A_(AAC|AC3|EAC3|DTS|VORBIS|OPUS|FLAC|MPEG\/L3|PCM)/g;
    let match;
    let trackIndex = 0;

    while ((match = audioCodecRegex.exec(str)) !== null) {
      const pos = match.index;
      const codec = match[0].replace('A_', '').replace('MPEG/L3', 'MP3');
      const nearby = str.slice(Math.max(0, pos - 150), Math.min(str.length, pos + 150));

      const langMatch = nearby.match(/\x22\xB5\x9C.([a-z]{3})/);
      const lang = langMatch ? langMatch[1].toLowerCase() : '';

      const nameMatch = nearby.match(/\x53\x6E.([^\x00-\x1F\x7F-\xFF]{2,30})/);
      let trackName = nameMatch ? nameMatch[1].trim() : '';
      if (trackName.startsWith('@')) trackName = ''; // filter watermark

      const langName = LANGUAGE_NAMES_MAP[lang] || (lang ? lang.toUpperCase() : '');
      let label = '';
      if (langName && codec) {
        label = `${langName} • ${codec} (Track ${trackIndex + 1})`;
      } else if (langName) {
        label = `${langName} (Track ${trackIndex + 1})`;
      } else if (trackName) {
        label = `${trackName} (Track ${trackIndex + 1})`;
      } else {
        label = `${codec || 'Audio'} Track ${trackIndex + 1}`;
      }

      tracks.push({
        id: `track-${trackIndex}`,
        index: trackIndex,
        label,
        language: lang,
        codec,
        enabled: trackIndex === 0,
      });
      trackIndex++;
    }
  }

  // 2. MP4 check
  if (tracks.length === 0) {
    const str = buf.toString('binary', 0, Math.min(buf.length, 65536));
    if (str.includes('ftyp') || str.includes('moov')) {
      const audioMarkers = ['soun', 'mp4a', 'ac-3', 'ec-3'];
      const foundOffsets = [];
      for (const marker of audioMarkers) {
        let idx = -1;
        let from = 0;
        while ((idx = str.indexOf(marker, from)) !== -1) {
          if (!foundOffsets.some((o) => Math.abs(o - idx) < 40)) {
            foundOffsets.push(idx);
          }
          from = idx + 4;
          if (foundOffsets.length >= 8) break;
        }
      }
      foundOffsets.sort((a, b) => a - b);
      for (let i = 0; i < foundOffsets.length; i++) {
        tracks.push({
          id: `track-${i}`,
          index: i,
          label: `Audio Track ${i + 1}`,
          language: '',
          codec: 'AAC',
          enabled: i === 0,
        });
      }
    }
  }

  return tracks;
}

export async function getMediaAudioTracks(chatId, messageId) {
  const cleanChat = String(chatId).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanMsg = String(messageId).replace(/[^a-zA-Z0-9_-]/g, '');
  const cacheKey = `${cleanChat}_${cleanMsg}`;

  if (mediaTracksCache.has(cacheKey)) {
    return mediaTracksCache.get(cacheKey);
  }

  const diskBinPath = path.join(MEDIA_CACHE_DIR, `${cleanChat}_${cleanMsg}.bin`);
  let headerBuf = null;

  if (fs.existsSync(diskBinPath)) {
    try {
      const fd = fs.openSync(diskBinPath, 'r');
      const b = Buffer.alloc(256 * 1024);
      const bytesRead = fs.readSync(fd, b, 0, b.length, 0);
      fs.closeSync(fd);
      headerBuf = b.subarray(0, bytesRead);
    } catch (e) {}
  }

  if (!headerBuf) {
    try {
      const client = await getClient();
      const targetPeer = await resolveInputPeer(chatId);
      const messages = await client.getMessages(targetPeer, { ids: [parseInt(messageId, 10)] });
      const msg = messages?.[0];
      const doc = msg?.media?.document;
      if (doc) {
        const loc = new Api.InputDocumentFileLocation({
          id: doc.id,
          accessHash: doc.accessHash,
          fileReference: doc.fileReference,
          thumbSize: '',
        });
        for await (const chunk of client.iterDownload({
          file: loc,
          dcId: doc.dcId,
          offset: bigInt(0),
          requestSize: 256 * 1024,
          limit: 1,
        })) {
          headerBuf = chunk;
          break;
        }
      }
    } catch (e) {
      console.warn('[Backend] getMediaAudioTracks MTProto probe error:', e?.message || e);
    }
  }

  const tracks = headerBuf ? parseAudioTracksFromBuffer(headerBuf) : [];
  const result = { tracks };
  mediaTracksCache.set(cacheKey, result);
  return result;
}
