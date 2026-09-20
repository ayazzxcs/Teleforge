import url from 'url';
import crypto from 'crypto';
import {
  getApiCredentials,
  setApiCredentials,
  handleSendCode,
  handleSignIn,
  handle2FA,
  checkAuthStatus,
  clearSession,
  getDialogsList,
  getMessagesForPeer,
  sendPeerMessage,
  sendBotCallbackAnswer,
  sendPeerReaction,
  getMessageReactionsList,
  toggleChatMute,
  editPeerMessage,
  deletePeerMessages,
  pinPeerMessage,
  forwardPeerMessages,
  downloadMessageMedia,
  downloadDocumentMedia,
  downloadPeerAvatar,
  getContactsList,
  getDialogFiltersList,
  saveDialogFilter,
  deleteDialogFilter,
  reorderDialogFilters,
  getFullChatInfo,
  markPeerAsRead,
  searchGlobalPeers,
  joinChatOrChannel,
  checkChatInvitePreview,
  getUserProfile,
  updateUserProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  getUserFull,
  getOnlineGifs,
  getInstalledStickerSets,
  getStickerSet,
  installStickerSet,
  faveSticker,
  sendStickerDocument,
  getSessionsList,
  terminateSessionByHash,
  terminateAllOtherSessions,
  getPrivacySetting,
  setPrivacySetting,
  getChatSharedMediaList,
  streamMediaResponse,
  getMediaAudioTracks,
  addSseClient,
  removeSseClient,
  getClient,
  searchMessagesInPeer,
  getMessagesAroundMessage,
  addBotToChat,
} from './telegramBackend.js';

// Helper to read JSON request body
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const jsonStr = JSON.stringify(data);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(jsonStr);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

export function telegramMiddleware() {
  return async (req, res, next) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (!pathname.startsWith('/api/telegram')) {
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    try {
      // 1. GET /api/telegram/config
      if (req.method === 'GET' && pathname === '/api/telegram/config') {
        const creds = getApiCredentials();
        return sendJson(res, 200, creds);
      }

      // 2. POST /api/telegram/config
      if (req.method === 'POST' && pathname === '/api/telegram/config') {
        const body = await readJsonBody(req);
        setApiCredentials(body.apiId, body.apiHash);
        return sendJson(res, 200, { success: true });
      }

      // 3. GET /api/telegram/auth/status
      if (req.method === 'GET' && pathname === '/api/telegram/auth/status') {
        const status = await checkAuthStatus();
        return sendJson(res, 200, status);
      }

      // 4. POST /api/telegram/auth/sendCode
      if (req.method === 'POST' && pathname === '/api/telegram/auth/sendCode') {
        const body = await readJsonBody(req);
        if (!body.phoneNumber) {
          return sendError(res, 400, 'Phone number is required');
        }
        const result = await handleSendCode(body.phoneNumber);
        return sendJson(res, 200, result);
      }

      // 5. POST /api/telegram/auth/signIn
      if (req.method === 'POST' && pathname === '/api/telegram/auth/signIn') {
        const body = await readJsonBody(req);
        if (!body.phoneNumber || !body.phoneCode) {
          return sendError(res, 400, 'Phone number and verification code are required');
        }
        const result = await handleSignIn(body.phoneNumber, body.phoneCode, body.phoneCodeHash);
        return sendJson(res, 200, result);
      }

      // 6. POST /api/telegram/auth/2fa
      if (req.method === 'POST' && pathname === '/api/telegram/auth/2fa') {
        const body = await readJsonBody(req);
        if (!body.password) {
          return sendError(res, 400, 'Two-step verification password is required');
        }
        const result = await handle2FA(body.password);
        return sendJson(res, 200, result);
      }

      // 7. POST /api/telegram/auth/logout
      if (req.method === 'POST' && pathname === '/api/telegram/auth/logout') {
        await clearSession();
        return sendJson(res, 200, { success: true });
      }

      // 8. GET /api/telegram/dialogs
      if (req.method === 'GET' && pathname === '/api/telegram/dialogs') {
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit, 10) : 40;
        const dialogs = await getDialogsList(limit);
        return sendJson(res, 200, { dialogs });
      }

      // 8b. GET /api/telegram/chat/info
      if (req.method === 'GET' && pathname === '/api/telegram/chat/info') {
        const id = parsedUrl.query.id;
        if (!id) {
          return sendError(res, 400, 'id is required');
        }
        const info = await getFullChatInfo(id);
        return sendJson(res, 200, { info });
      }

      // 8c. POST /api/telegram/read — mark chat as read on Telegram server
      if (req.method === 'POST' && pathname === '/api/telegram/read') {
        const body = await readJsonBody(req);
        const chatId = body.chatId;
        if (!chatId) {
          return sendError(res, 400, 'chatId is required');
        }
        const result = await markPeerAsRead(chatId);
        return sendJson(res, 200, result);
      }

      // 8d. GET /api/telegram/search — global search for channels, groups, and people
      if (req.method === 'GET' && pathname === '/api/telegram/search') {
        const q = parsedUrl.query.q || '';
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit, 10) : 20;
        const results = await searchGlobalPeers(q, limit);
        return sendJson(res, 200, results);
      }

      // 8e. POST /api/telegram/join — join public channel or group
      if (req.method === 'POST' && pathname === '/api/telegram/join') {
        const body = await readJsonBody(req);
        const chatId = body.chatId;
        if (!chatId) {
          return sendError(res, 400, 'chatId is required');
        }
        try {
          const result = await joinChatOrChannel(chatId);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 200, { success: false, error: err.message || 'Failed to join chat' });
        }
      }

      // 8f. GET or POST /api/telegram/check-invite — preview invite or public username
      if (pathname === '/api/telegram/check-invite') {
        let hashOrUsername = parsedUrl.query.hash || parsedUrl.query.username || parsedUrl.query.hashOrUsername || '';
        if (req.method === 'POST') {
          try {
            const body = await readJsonBody(req);
            hashOrUsername = body.hashOrUsername || body.hash || body.chatId || hashOrUsername;
          } catch (e) {}
        }
        if (!hashOrUsername) {
          return sendError(res, 400, 'hash or username is required');
        }
        try {
          const result = await checkChatInvitePreview(hashOrUsername);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 200, { success: false, error: err.message || 'Failed to check invite' });
        }
      }

      // 9. GET /api/telegram/messages
      if (req.method === 'GET' && pathname === '/api/telegram/messages') {
        const chatId = parsedUrl.query.chatId;
        if (!chatId) {
          return sendError(res, 400, 'chatId is required');
        }
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit, 10) : 50;
        const offsetId = parsedUrl.query.offsetId ? parseInt(parsedUrl.query.offsetId, 10) : 0;
        const messages = await getMessagesForPeer(chatId, limit, offsetId);
        return sendJson(res, 200, { messages });
      }

      // 9b. GET /api/telegram/messages/search
      if (req.method === 'GET' && pathname === '/api/telegram/messages/search') {
        const chatId = parsedUrl.query.chatId;
        const q = parsedUrl.query.query || parsedUrl.query.q;
        if (!chatId || !q) {
          return sendError(res, 400, 'chatId and query are required');
        }
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit, 10) : 30;
        const messages = await searchMessagesInPeer(chatId, q, limit);
        return sendJson(res, 200, { messages });
      }

      // 9c. GET /api/telegram/messages/around
      if (req.method === 'GET' && pathname === '/api/telegram/messages/around') {
        const { chatId, messageId } = parsedUrl.query;
        if (!chatId || !messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        const limit = parsedUrl.query.limit ? parseInt(parsedUrl.query.limit, 10) : 50;
        const messages = await getMessagesAroundMessage(chatId, messageId, limit);
        return sendJson(res, 200, { messages });
      }

      // 10. POST /api/telegram/messages/send
      if (req.method === 'POST' && pathname === '/api/telegram/messages/send') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.message) {
          return sendError(res, 400, 'chatId and message are required');
        }
        const message = await sendPeerMessage(body.chatId, body.message, body.replyToMsgId);
        return sendJson(res, 200, { success: true, message });
      }

      // 10a. POST /api/telegram/bot/callback
      if (req.method === 'POST' && pathname === '/api/telegram/bot/callback') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          const result = await sendBotCallbackAnswer(body.chatId, body.messageId, body.data, Boolean(body.game));
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to send callback answer');
        }
      }

      // 10b. POST /api/telegram/bot/add-to-chat
      if (req.method === 'POST' && pathname === '/api/telegram/bot/add-to-chat') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.botUsername) {
          return sendError(res, 400, 'chatId and botUsername are required');
        }
        try {
          const result = await addBotToChat(body.chatId, body.botUsername, body.startParam);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to add bot to chat');
        }
      }

      // 10c. POST /api/telegram/chat/mute
      if (req.method === 'POST' && pathname === '/api/telegram/chat/mute') {
        const body = await readJsonBody(req);
        if (!body.chatId) {
          return sendError(res, 400, 'chatId is required');
        }
        try {
          const result = await toggleChatMute(body.chatId, body.mute !== undefined ? Boolean(body.mute) : true);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to update mute settings');
        }
      }

      // 10b. POST /api/telegram/messages/react
      if (req.method === 'POST' && pathname === '/api/telegram/messages/react') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          await sendPeerReaction(body.chatId, body.messageId, body.emoji);
          return sendJson(res, 200, { success: true });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to send reaction');
        }
      }

      // 10b-2. GET /api/telegram/messages/reactions-list
      if (req.method === 'GET' && pathname === '/api/telegram/messages/reactions-list') {
        const chatId = query.chatId;
        const messageId = query.messageId;
        const limit = query.limit ? parseInt(query.limit, 10) : 50;
        if (!chatId || !messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          const result = await getMessageReactionsList(chatId, messageId, limit);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch reactions list');
        }
      }

      // 10c. POST /api/telegram/messages/edit
      if (req.method === 'POST' && pathname === '/api/telegram/messages/edit') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.messageId || body.text === undefined) {
          return sendError(res, 400, 'chatId, messageId and text are required');
        }
        try {
          const result = await editPeerMessage(body.chatId, body.messageId, body.text);
          return sendJson(res, 200, { success: true, message: result });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to edit message');
        }
      }

      // 10d. POST /api/telegram/messages/delete
      if (req.method === 'POST' && pathname === '/api/telegram/messages/delete') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          const result = await deletePeerMessages(body.chatId, body.messageId, body.revoke !== false);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to delete message');
        }
      }

      // 10e. POST /api/telegram/messages/pin
      if (req.method === 'POST' && pathname === '/api/telegram/messages/pin') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          const result = await pinPeerMessage(body.chatId, body.messageId, Boolean(body.silent));
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to pin message');
        }
      }

      // 10g. POST /api/telegram/messages/forward
      if (req.method === 'POST' && pathname === '/api/telegram/messages/forward') {
        const body = await readJsonBody(req);
        if (!body.fromChatId || !body.toChatId || !body.messageIds) {
          return sendError(res, 400, 'fromChatId, toChatId, and messageIds are required');
        }
        try {
          const result = await forwardPeerMessages(body.fromChatId, body.toChatId, body.messageIds, {
            silent: body.silent,
            dropAuthor: body.dropAuthor,
          });
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to forward messages');
        }
      }

      // 10f. GET /api/telegram/media/tracks — query probed audio tracks for video
      if (req.method === 'GET' && pathname === '/api/telegram/media/tracks') {
        const { chatId, messageId } = parsedUrl.query;
        if (!chatId || !messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        try {
          const result = await getMediaAudioTracks(chatId, messageId);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 200, { tracks: [] });
        }
      }

      // 11. GET /api/telegram/media
      if (req.method === 'GET' && pathname === '/api/telegram/media') {
        const { chatId, messageId, thumb } = parsedUrl.query;
        if (!chatId || !messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        if (thumb) {
          const media = await downloadMessageMedia(chatId, messageId, { thumb: true });
          if (!media || !media.buffer) {
            res.statusCode = 404;
            return res.end('Media not found');
          }
          res.statusCode = 200;
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', media.buffer.length);
          res.setHeader('Content-Type', media.mimeType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.end(media.buffer);
        }

        // Full media / video progressive stream
        return await streamMediaResponse(chatId, messageId, req, res);
      }

      // 11b. GET /api/telegram/document
      if (req.method === 'GET' && pathname === '/api/telegram/document') {
        const { id, thumb, mimeType } = parsedUrl.query;
        if (!id) {
          return sendError(res, 400, 'id is required');
        }
        const media = await downloadDocumentMedia(id, { thumb, mimeType });
        if (!media || !media.buffer) {
          res.statusCode = 404;
          return res.end('Document not found');
        }
        const total = media.buffer.length;
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
          const chunksize = end - start + 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', chunksize);
          res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.end(media.buffer.slice(start, end + 1));
        } else {
          res.statusCode = 200;
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Length', total);
          res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.end(media.buffer);
        }
      }

      // 12. GET/HEAD /api/telegram/avatar
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/api/telegram/avatar') {
        const id = parsedUrl.query.id;
        const version = (parsedUrl.query.v || parsedUrl.query.t || '').toString();
        if (!id) {
          return sendError(res, 400, 'id is required');
        }

        const avatar = await downloadPeerAvatar(id, version);
        if (!avatar || avatar.length === 0) {
          res.statusCode = 404;
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.end('Avatar not found');
        }

        const hash = crypto.createHash('md5').update(avatar).digest('hex').slice(0, 12);
        const etag = `"${id}-${version ? version + '-' : ''}${hash}"`;
        if (req.headers['if-none-match'] === etag) {
          res.statusCode = 304;
          return res.end();
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('ETag', etag);
        if (version) {
          res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        return res.end(avatar);
      }

      // 13. GET /api/telegram/contacts
      if (req.method === 'GET' && pathname === '/api/telegram/contacts') {
        const contacts = await getContactsList();
        return sendJson(res, 200, { contacts });
      }

      // 14. GET /api/telegram/folders
      if (req.method === 'GET' && pathname === '/api/telegram/folders') {
        const folders = await getDialogFiltersList();
        return sendJson(res, 200, { folders });
      }

      // 15. POST /api/telegram/folders (create / update)
      if (req.method === 'POST' && pathname === '/api/telegram/folders') {
        const body = await readJsonBody(req);
        if (!body.title || !body.title.trim()) {
          return sendError(res, 400, 'Folder name is required');
        }
        const result = await saveDialogFilter(body);
        return sendJson(res, 200, result);
      }

      // 16. POST /api/telegram/folders/delete
      if (req.method === 'POST' && pathname === '/api/telegram/folders/delete') {
        const body = await readJsonBody(req);
        if (!body.id) {
          return sendError(res, 400, 'Folder id is required');
        }
        const result = await deleteDialogFilter(body.id);
        return sendJson(res, 200, result);
      }

      // 17. POST /api/telegram/folders/order
      if (req.method === 'POST' && pathname === '/api/telegram/folders/order') {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.order)) {
          return sendError(res, 400, 'Order array is required');
        }
        const result = await reorderDialogFilters(body.order);
        return sendJson(res, 200, result);
      }

      // 18. GET /api/telegram/profile
      if (req.method === 'GET' && pathname === '/api/telegram/profile') {
        const result = await getUserProfile();
        return sendJson(res, 200, result);
      }

      // 19. POST /api/telegram/profile (update profile on Telegram cloud via MTProto)
      if (req.method === 'POST' && pathname === '/api/telegram/profile') {
        const body = await readJsonBody(req);
        const result = await updateUserProfile(body);
        return sendJson(res, 200, result);
      }

      // 20. POST /api/telegram/profile/photo (upload profile photo via MTProto)
      if (req.method === 'POST' && pathname === '/api/telegram/profile/photo') {
        const body = await readJsonBody(req);
        const result = await uploadProfilePhoto(body);
        return sendJson(res, 200, result);
      }

      // 21. DELETE /api/telegram/profile/photo (remove profile photo via MTProto)
      if (req.method === 'DELETE' && pathname === '/api/telegram/profile/photo') {
        const result = await deleteProfilePhoto();
        return sendJson(res, 200, result);
      }

      // 22. GET /api/telegram/user/full
      if (req.method === 'GET' && pathname === '/api/telegram/user/full') {
        const id = parsedUrl.query.id;
        if (!id) return sendError(res, 400, 'id is required');
        const user = await getUserFull(id);
        return sendJson(res, 200, { user });
      }

      // 23. GET /api/telegram/gifs
      if (req.method === 'GET' && pathname === '/api/telegram/gifs') {
        const q = parsedUrl.query.q || '';
        const offset = parsedUrl.query.offset || '';
        const result = await getOnlineGifs(q, offset);
        return sendJson(res, 200, result);
      }

      // 24. GET /api/telegram/stickers/installed
      if (req.method === 'GET' && pathname === '/api/telegram/stickers/installed') {
        const sets = await getInstalledStickerSets();
        return sendJson(res, 200, { sets });
      }

      // 25. GET /api/telegram/stickers/set
      if (req.method === 'GET' && pathname === '/api/telegram/stickers/set') {
        const { id, accessHash, shortName } = parsedUrl.query;
        const set = await getStickerSet({ id, accessHash, shortName });
        return sendJson(res, 200, { set });
      }

      // 26. POST /api/telegram/stickers/install
      if (req.method === 'POST' && pathname === '/api/telegram/stickers/install') {
        const body = await readJsonBody(req);
        const success = await installStickerSet(body.stickerset || body);
        return sendJson(res, 200, { success });
      }

      // 27. POST /api/telegram/stickers/fave
      if (req.method === 'POST' && pathname === '/api/telegram/stickers/fave') {
        const body = await readJsonBody(req);
        const success = await faveSticker(body.documentId, body.accessHash, body.fileReference);
        return sendJson(res, 200, { success });
      }

      // 28. POST /api/telegram/stickers/send
      if (req.method === 'POST' && pathname === '/api/telegram/stickers/send') {
        const body = await readJsonBody(req);
        const message = await sendStickerDocument(body.chatId, body.docOrInput, body.replyToMsgId);
        return sendJson(res, 200, { success: true, message });
      }

      // 29. GET /api/telegram/sessions
      if (req.method === 'GET' && pathname === '/api/telegram/sessions') {
        try {
          const sessions = await getSessionsList();
          return sendJson(res, 200, { sessions });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch sessions');
        }
      }

      // 30. POST /api/telegram/sessions/terminate
      if (req.method === 'POST' && pathname === '/api/telegram/sessions/terminate') {
        try {
          const body = await readJsonBody(req);
          if (!body.hash) {
            return sendError(res, 400, 'hash is required');
          }
          const result = await terminateSessionByHash(body.hash);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to terminate session');
        }
      }

      // 31. POST /api/telegram/sessions/terminate-all
      if (req.method === 'POST' && pathname === '/api/telegram/sessions/terminate-all') {
        try {
          const result = await terminateAllOtherSessions();
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to terminate other sessions');
        }
      }

      // 32. GET /api/telegram/privacy
      if (req.method === 'GET' && pathname === '/api/telegram/privacy') {
        try {
          const type = parsedUrl.query.type || 'lastSeen';
          const rule = await getPrivacySetting(type);
          return sendJson(res, 200, { rule });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch privacy setting');
        }
      }

      // 33. POST /api/telegram/privacy
      if (req.method === 'POST' && pathname === '/api/telegram/privacy') {
        try {
          const body = await readJsonBody(req);
          if (!body.keyType || !body.rule) {
            return sendError(res, 400, 'keyType and rule are required');
          }
          const result = await setPrivacySetting(body.keyType, body.rule);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to update privacy setting');
        }
      }

      // 34. GET /api/telegram/shared-media
      if (req.method === 'GET' && pathname === '/api/telegram/shared-media') {
        try {
          const { chatId, type = 'photos', limit = 50 } = parsedUrl.query;
          if (!chatId) {
            return sendError(res, 400, 'chatId is required');
          }
          const messages = await getChatSharedMediaList(chatId, type, limit);
          return sendJson(res, 200, { messages });
        } catch (err) {
          return sendError(res, 500, err.message || 'Failed to fetch shared media');
        }
      }

      // 35. GET /api/telegram/updates (Server-Sent Events stream for real-time MTProto updates)
      if (req.method === 'GET' && pathname === '/api/telegram/updates') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(':connected\n\n');
        addSseClient(res);
        req.on('close', () => {
          removeSseClient(res);
        });
        // Ensure client connection and event handlers are established
        getClient().catch((err) => console.warn('[MTProto Middleware] getClient for updates failed:', err.message));
        return;
      }

      // Route not found in /api/telegram
      return sendError(res, 404, 'API endpoint not found');
    } catch (err) {
      console.error('[MTProto API Error]', pathname, err);
      return sendError(res, 500, err.message || 'Internal Telegram API Error');
    }
  };
}
