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
  sendPeerReaction,
  editPeerMessage,
  deletePeerMessages,
  pinPeerMessage,
  downloadMessageMedia,
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
  getUserProfile,
  updateUserProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
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
        const result = await joinChatOrChannel(chatId);
        return sendJson(res, 200, result);
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

      // 10. POST /api/telegram/messages/send
      if (req.method === 'POST' && pathname === '/api/telegram/messages/send') {
        const body = await readJsonBody(req);
        if (!body.chatId || !body.message) {
          return sendError(res, 400, 'chatId and message are required');
        }
        const message = await sendPeerMessage(body.chatId, body.message, body.replyToMsgId);
        return sendJson(res, 200, { success: true, message });
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

      // 11. GET /api/telegram/media
      if (req.method === 'GET' && pathname === '/api/telegram/media') {
        const { chatId, messageId } = parsedUrl.query;
        if (!chatId || !messageId) {
          return sendError(res, 400, 'chatId and messageId are required');
        }
        const media = await downloadMessageMedia(chatId, messageId);
        if (!media || !media.buffer) {
          res.statusCode = 404;
          return res.end('Media not found');
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', media.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(media.buffer);
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

      // Route not found in /api/telegram
      return sendError(res, 404, 'API endpoint not found');
    } catch (err) {
      console.error('[MTProto API Error]', pathname, err);
      return sendError(res, 500, err.message || 'Internal Telegram API Error');
    }
  };
}
