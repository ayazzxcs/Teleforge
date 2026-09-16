import fs from 'fs';
import path from 'path';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { strippedPhotoToJpg } from 'telegram/Utils.js';
import { CustomFile } from 'telegram/client/uploads.js';

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
try {
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
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
const inflightAvatarPromises = new Map(); // peerId -> Promise<Buffer|null>

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
        if (buf && buf.length > 1000) return buf;
      }
      const diskPath = path.join(AVATARS_DIR, `${vKey}.jpg`);
      if (fs.existsSync(diskPath)) {
        try {
          const fileBuf = fs.readFileSync(diskPath);
          if (fileBuf && fileBuf.length > 1000) {
            avatarMemoryCache.set(vKey, fileBuf);
            return fileBuf;
          }
        } catch (e) {}
      }
    }
    // Specific version requested but not found in cache - bypass generic cache
    return null;
  }

  // 1. In-memory cache (only high-res photos)
  for (const v of variations) {
    if (avatarMemoryCache.has(v)) {
      const buf = avatarMemoryCache.get(v);
      if (buf && buf.length > 1000) return buf;
    }
  }

  // 2. Persistent disk cache (only high-res photos > 1000 bytes)
  for (const v of variations) {
    const diskPath = path.join(AVATARS_DIR, `${v}.jpg`);
    if (fs.existsSync(diskPath)) {
      try {
        const fileBuf = fs.readFileSync(diskPath);
        if (fileBuf && fileBuf.length > 1000) {
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

export async function getClient() {
  if (!cachedApiId || !cachedApiHash) {
    throw new Error('Telegram API ID and API Hash are required to initialize MTProto client');
  }

  if (!clientInstance) {
    const session = new StringSession(currentSessionString);
    clientInstance = new TelegramClient(session, cachedApiId, cachedApiHash, {
      connectionRetries: 3,
      timeout: 15,
      useWSS: false, // direct native TCP transport in Node
    });

    console.log('[MTProto] Connecting to Telegram production servers...');
    await clientInstance.connect();
    console.log('[MTProto] Connected to Telegram production servers.');
  } else if (!clientInstance.connected) {
    await clientInstance.connect();
  }

  return clientInstance;
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
    clientInstance = null;
  }
}

// Temporary storage for pending phone code verification requests
const pendingLogins = new Map();

export async function handleSendCode(phoneNumber) {
  const client = await getClient();
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
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
    return {
      success: true,
      user: sUser,
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
  return {
    success: true,
    user: sUser,
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
    return {
      authorized: true,
      configured: true,
      user: sUser,
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
    const peerIdStr = d.id?.toString();

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

export async function getMessagesForPeer(peerId, limit = 50, offsetId = 0) {
  const client = await getClient();
  const isAuth = await client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('Not authorized with Telegram MTProto');
  }

  // Parse peer ID (channels/supergroups or users)
  // Check cached entity first to skip redundant getInputEntity RPC
  let targetPeer = peerEntityCache.get(peerId?.toString());
  if (!targetPeer && /^-?\d+$/.test(peerId)) {
    try {
      targetPeer = await client.getInputEntity(peerId);
      if (targetPeer) {
        peerEntityCache.set(peerId.toString(), targetPeer);
      }
    } catch (e) {
      targetPeer = peerId;
    }
  }
  if (!targetPeer) targetPeer = peerId;

  const fetchOptions = { limit: Math.min(limit, 100) };
  if (offsetId && parseInt(offsetId, 10) > 0) {
    fetchOptions.offsetId = parseInt(offsetId, 10);
  }

  const messages = await client.getMessages(targetPeer, fetchOptions);

  // Pre-cache all entities returned in the messages batch for instant 0ms lookups
  for (const m of messages) {
    if (m._entities && m._entities instanceof Map) {
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
  
  return messages.map((m) => {
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
    let fileName = null;
    let fileSize = null;

    if (m.media) {
      const cls = m.media.className || m.media._ || '';
      if (cls.includes('Photo')) {
        mediaType = 'photo';
      } else if (cls.includes('Document')) {
        const isVoice = m.media.document?.attributes?.some((a) => a._ === 'documentAttributeAudio' && a.voice);
        const isAudio = m.media.document?.attributes?.some((a) => a._ === 'documentAttributeAudio');
        const filenameAttr = m.media.document?.attributes?.find((a) => a._ === 'documentAttributeFilename');
        
        if (isVoice) mediaType = 'voice';
        else if (isAudio) mediaType = 'audio';
        else mediaType = 'document';

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
      fileName,
      fileSize,
      replyToMsgId: m.replyTo?.replyToMsgId,
      reactions,
    };
  }).reverse(); // return in chronological order
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


export async function downloadMessageMedia(chatId, messageId) {
  const client = await getClient();
  let targetPeer = chatId;
  try {
    targetPeer = await client.getInputEntity(chatId);
  } catch (e) {
    targetPeer = chatId;
  }

  const messages = await client.getMessages(targetPeer, { ids: [parseInt(messageId, 10)] });
  if (!messages || !messages[0] || !messages[0].media) {
    return null;
  }

  const msg = messages[0];
  const buffer = await client.downloadMedia(msg.media, {});
  
  let mimeType = 'application/octet-stream';
  const cls = msg.media.className || msg.media._ || '';
  if (cls.includes('Photo')) {
    mimeType = 'image/jpeg';
  } else if (cls.includes('Document')) {
    mimeType = msg.media.document?.mimeType || 'application/octet-stream';
  }

  return {
    buffer,
    mimeType,
  };
}

export async function downloadPeerAvatar(peerId, version = '') {
  if (!peerId) return null;
  const cleanId = peerId.toString().trim();
  const cacheKey = version ? `${cleanId}_${version}` : cleanId;

  // 1. Instant 0ms check for high-res photo already on disk/memory
  const highRes = getCachedHighResAvatar(cleanId, version);
  if (highRes && highRes.length > 1000) {
    return highRes;
  }

  // 2. Negative cache check (with TTL, only when no specific version is requested)
  if (!version && isNegativeCached(cleanId)) {
    return getCachedThumbBuffer(cleanId);
  }

  // 3. In-flight request deduplication
  if (inflightAvatarPromises.has(cacheKey)) {
    return inflightAvatarPromises.get(cacheKey);
  }

  let targetPeer = peerEntityCache.get(cleanId);
  if (!targetPeer && /^-?\d+$/.test(cleanId)) {
    if (cleanId.startsWith('-100')) {
      targetPeer = peerEntityCache.get(cleanId.slice(4));
    } else if (cleanId.startsWith('-')) {
      targetPeer = peerEntityCache.get(cleanId.slice(1));
    }
  }

  // 4. Queued download for high-res profile photo (10s timeout)
  const downloadPromise = scheduleAvatarDownload(async () => {
    try {
      const client = await getClient();
      let me = null;
      try {
        me = await client.getMe();
      } catch (e) {}
      const isMe = cleanId === 'me' || (me && me.id && cleanId === me.id.toString());

      if (!isMe && !targetPeer) {
        targetPeer = peerEntityCache.get(cleanId);
      }

      if (!isMe && !targetPeer) {
        try {
          if (/^-?\d+$/.test(cleanId)) {
            try {
              targetPeer = await client.getInputEntity(BigInt(cleanId));
            } catch (e1) {
              targetPeer = await resolveInputPeer(client, cleanId);
            }
          } else {
            targetPeer = await client.getInputEntity(cleanId);
          }
        } catch (e) {
          targetPeer = await resolveInputPeer(client, cleanId);
        }
      }

      if (!isMe && !targetPeer) {
        targetPeer = cleanId;
      }

      // Download real high-res profile photo (isBig: true ensures full quality, 'me' ensures live active user photo)
      const downloadTarget = isMe ? 'me' : targetPeer;
      const buffer = await withTimeout(
        client.downloadProfilePhoto(downloadTarget, { isBig: true }),
        10000
      );

      if (buffer && buffer.length > 1000) {
        if (avatarMemoryCache.size > 300) {
          const firstKey = avatarMemoryCache.keys().next().value;
          avatarMemoryCache.delete(firstKey);
        }
        avatarMemoryCache.set(cleanId, buffer);
        if (version) {
          avatarMemoryCache.set(cacheKey, buffer);
        }

        try {
          const diskPath = path.join(AVATARS_DIR, `${cleanId}.jpg`);
          fs.writeFileSync(diskPath, buffer);
          if (version) {
            const verPath = path.join(AVATARS_DIR, `${cacheKey}.jpg`);
            fs.writeFileSync(verPath, buffer);
          }
        } catch (e) {}

        return buffer;
      } else {
        const thumb = getCachedThumbBuffer(cleanId);
        if (thumb) return thumb;
        if (!version) setNegativeCached(cleanId);
        return null;
      }
    } catch (err) {
      const thumb = getCachedThumbBuffer(cleanId);
      if (thumb) return thumb;
      if (!version) setNegativeCached(cleanId);
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
async function resolveInputPeer(client, id) {
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
    const peer = await resolveInputPeer(client, id);
    if (peer) pinnedPeers.push(peer);
  }

  const includePeers = [];
  for (const id of filterData.includeChatIds || []) {
    const peer = await resolveInputPeer(client, id);
    if (peer) includePeers.push(peer);
  }

  const excludePeers = [];
  for (const id of filterData.excludeChatIds || []) {
    const peer = await resolveInputPeer(client, id);
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
    const cleanBase64 = fileBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer || buffer.length < 100) {
      throw new Error('Uploaded file is empty or invalid image');
    }
  } else {
    throw new Error('Either fileBase64 or url must be provided');
  }

  const customFile = new CustomFile(name, buffer.length, '', buffer);
  const uploadedFile = await client.uploadFile({
    file: customFile,
    workers: 1,
  });

  await client.invoke(
    new Api.photos.UploadProfilePhoto({
      file: uploadedFile,
    })
  );

  console.log('[MTProto] Successfully uploaded profile photo to Telegram cloud');

  const me = await client.getMe();
  const myId = String(me.id);
  const photoId = me.photo?.photoId ? me.photo.photoId.toString() : (me.photo?.id ? me.photo.id.toString() : String(Date.now()));

  // Invalidate local memory and disk caches
  avatarMemoryCache.delete(myId);
  avatarMemoryCache.delete(`${myId}_${photoId}`);
  negativeAvatarCache.delete(myId);
  thumbMemoryCache.delete(myId);
  cachedDialogsResult = null;
  peerEntityCache.set(myId, me);

  try {
    const diskPath = path.join(AVATARS_DIR, `${myId}.jpg`);
    const versionPath = path.join(AVATARS_DIR, `${myId}_${photoId}.jpg`);
    fs.writeFileSync(diskPath, buffer);
    fs.writeFileSync(versionPath, buffer);
    avatarMemoryCache.set(myId, buffer);
    avatarMemoryCache.set(`${myId}_${photoId}`, buffer);
  } catch (e) {
    console.error('[MTProto] Error writing avatar to disk cache:', e.message);
  }

  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {}

  const sUser = serializeUser(me);
  const avatarUrl = `/api/telegram/avatar?id=${encodeURIComponent(myId)}&v=${photoId}&t=${Date.now()}`;
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

  avatarMemoryCache.delete(myId);
  negativeAvatarCache.delete(myId);
  thumbMemoryCache.delete(myId);
  cachedDialogsResult = null;

  try {
    const files = fs.readdirSync(AVATARS_DIR);
    for (const f of files) {
      if (f.startsWith(myId)) {
        fs.unlinkSync(path.join(AVATARS_DIR, f));
      }
    }
  } catch (e) {}

  const updatedMe = await client.getMe();
  let bio = '';
  try {
    const full = await client.invoke(new Api.users.GetFullUser({ id: 'me' }));
    bio = full?.fullUser?.about || full?.about || '';
  } catch (e) {}

  const sUser = serializeUser(updatedMe);
  if (sUser) {
    sUser.bio = bio;
    sUser.hasAvatar = false;
  }

  return {
    success: true,
    user: sUser,
  };
}


