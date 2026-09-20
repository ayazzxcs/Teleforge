/**
 * Telegram Link Parsing & Routing Utilities for TeleForge
 * Intercepts t.me, telegram.me, and tg:// URLs to handle them entirely within TeleForge
 */

export interface ParsedTelegramUrl {
  isTelegramUrl: boolean;
  type: 'startgroup' | 'start' | 'open_chat' | 'join' | 'message' | 'unknown';
  username?: string;
  startGroupParam?: string;
  startParam?: string;
  joinHash?: string;
  chatId?: string;
  messageId?: string;
  rawUrl: string;
}

const TG_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);

/**
 * Checks whether a given string is a Telegram deep-link or t.me URL
 */
export function isTelegramUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('tg://')) return true;

  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    return TG_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Parses any Telegram URL into actionable intent parameters for TeleForge
 */
export function parseTelegramUrl(rawUrl: string): ParsedTelegramUrl {
  if (!rawUrl) {
    return { isTelegramUrl: false, type: 'unknown', rawUrl: '' };
  }

  const trimmed = rawUrl.trim();

  // 1. Handle tg:// schemes
  if (trimmed.startsWith('tg://')) {
    try {
      const pseudoUrl = new URL(trimmed.replace(/^tg:\/\//, 'http://tg/'));
      const action = pseudoUrl.pathname.replace(/^\//, '') || pseudoUrl.host;
      const params = pseudoUrl.searchParams;

      if (action === 'resolve' || pseudoUrl.host === 'resolve') {
        const domain = (params.get('domain') || '').replace(/^@+/, '');
        const startgroup = params.get('startgroup');
        const start = params.get('start');

        if (startgroup !== null) {
          return {
            isTelegramUrl: true,
            type: 'startgroup',
            username: domain,
            startGroupParam: startgroup,
            rawUrl,
          };
        }
        if (start !== null) {
          return {
            isTelegramUrl: true,
            type: 'start',
            username: domain,
            startParam: start,
            rawUrl,
          };
        }
        if (domain) {
          return {
            isTelegramUrl: true,
            type: 'open_chat',
            username: domain,
            rawUrl,
          };
        }
      } else if (action === 'join' || pseudoUrl.host === 'join') {
        const invite = params.get('invite') || '';
        if (invite) {
          return {
            isTelegramUrl: true,
            type: 'join',
            joinHash: invite,
            rawUrl,
          };
        }
      }
    } catch (e) {
      console.warn('[parseTelegramUrl] Failed to parse tg:// URL:', e);
    }
    return { isTelegramUrl: true, type: 'unknown', rawUrl };
  }

  // 2. Handle HTTP/HTTPS t.me / telegram.me / telegram.dog
  try {
    const urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const host = urlObj.hostname.toLowerCase();
    if (!TG_HOSTS.has(host)) {
      return { isTelegramUrl: false, type: 'unknown', rawUrl };
    }

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const params = urlObj.searchParams;

    if (pathParts.length === 0) {
      return { isTelegramUrl: true, type: 'unknown', rawUrl };
    }

    // Join links: https://t.me/joinchat/<hash> or https://t.me/+<hash>
    if (pathParts[0] === 'joinchat' && pathParts[1]) {
      return {
        isTelegramUrl: true,
        type: 'join',
        joinHash: pathParts[1],
        rawUrl,
      };
    }
    if (pathParts[0].startsWith('+')) {
      return {
        isTelegramUrl: true,
        type: 'join',
        joinHash: pathParts[0].substring(1),
        rawUrl,
      };
    }

    // Private channel message links: https://t.me/c/<channelId>/<messageId>
    if (pathParts[0] === 'c' && pathParts[1]) {
      return {
        isTelegramUrl: true,
        type: 'message',
        chatId: `-100${pathParts[1]}`,
        messageId: pathParts[2],
        rawUrl,
      };
    }

    const username = pathParts[0].replace(/^@+/, '');

    // Public message links: https://t.me/<username>/<messageId>
    if (pathParts.length >= 2 && /^\d+$/.test(pathParts[1])) {
      return {
        isTelegramUrl: true,
        type: 'message',
        username,
        messageId: pathParts[1],
        rawUrl,
      };
    }

    // Bot startgroup links: e.g. https://t.me/MissRose_bot?startgroup=botstart
    const startgroup = params.get('startgroup');
    if (startgroup !== null) {
      return {
        isTelegramUrl: true,
        type: 'startgroup',
        username,
        startGroupParam: startgroup,
        rawUrl,
      };
    }

    // Bot start links: e.g. https://t.me/MissRose_bot?start=help
    const start = params.get('start');
    if (start !== null) {
      return {
        isTelegramUrl: true,
        type: 'start',
        username,
        startParam: start,
        rawUrl,
      };
    }

    // Default: Open chat with user/channel/bot
    return {
      isTelegramUrl: true,
      type: 'open_chat',
      username,
      rawUrl,
    };
  } catch {
    return { isTelegramUrl: false, type: 'unknown', rawUrl };
  }
}
