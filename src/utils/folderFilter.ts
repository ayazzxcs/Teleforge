import { Chat, TeleForgeDialogFilter } from '../types';

/**
 * Checks whether a chat matches a TeleForge / Telegram Dialog Filter.
 * Strictly adheres to Telegram MTProto DialogFilter logic.
 *
 * @param chat The Chat object to test
 * @param filter The TeleForgeDialogFilter criteria
 * @param contactIds Optional set or array of user IDs who are contacts
 */
export function chatMatchesFolder(
  chat: Chat,
  filter: TeleForgeDialogFilter,
  contactIds?: Set<string> | string[]
): boolean {
  // 1. Default 'All Chats' filter matches everything
  if (filter.id === 'all' || filter.isDefault) {
    return true;
  }

  // 2. Explicitly excluded chats are never included
  if (filter.excludeChatIds && filter.excludeChatIds.includes(chat.id)) {
    return false;
  }

  // 3. Exclude muted chats
  if (filter.excludeMuted && chat.isMuted) {
    return false;
  }

  // 4. Exclude read chats / Unread only
  if ((filter.unreadOnly || filter.excludeRead) && chat.unreadCount === 0) {
    return false;
  }

  // 5. Explicitly included or pinned chats always match (unless excluded above)
  if (
    (filter.pinnedChatIds && filter.pinnedChatIds.includes(chat.id)) ||
    (filter.includeChatIds && filter.includeChatIds.includes(chat.id))
  ) {
    return true;
  }

  // 6. Check chat type flags
  const hasTypeFilters = Boolean(
    filter.contacts ||
    filter.nonContacts ||
    filter.groups ||
    filter.channels ||
    filter.bots
  );

  if (hasTypeFilters) {
    if (filter.groups && chat.type === 'group') {
      return true;
    }
    if (filter.channels && chat.type === 'channel') {
      return true;
    }
    if (filter.bots && chat.type === 'bot') {
      return true;
    }

    if (chat.type === 'direct') {
      const contactsSet = contactIds instanceof Set ? contactIds : new Set(contactIds || []);
      const isContact = contactsSet.has(chat.id);

      if (filter.contacts && isContact) {
        return true;
      }
      if (filter.nonContacts && !isContact) {
        return true;
      }
      // If neither contacts nor nonContacts is specified or matched
      return false;
    }

    // Chat did not match any of the enabled type filters
    return false;
  }

  // 7. If no chat type filters are active, and includeChatIds has items,
  // then only explicitly included chats match (handled in step 5)
  if (filter.includeChatIds && filter.includeChatIds.length > 0) {
    return false;
  }

  // 8. If no type filters and no include filters, but message state filters are set
  // (e.g. "Unread only" or "Exclude muted" across all chats)
  if (filter.unreadOnly || filter.excludeRead || filter.excludeMuted) {
    return true;
  }

  return false;
}

/**
 * Filter and sort chats according to a TeleForgeDialogFilter.
 * Pinned chats in the filter are ordered first.
 */
export function filterChatsForFolder(
  chats: Chat[],
  filter: TeleForgeDialogFilter,
  contactIds?: Set<string> | string[]
): Chat[] {
  if (filter.id === 'all' || filter.isDefault) {
    return chats;
  }

  const matching = chats.filter((c) => chatMatchesFolder(c, filter, contactIds));

  // Sort pinned chats to top according to pinnedChatIds order
  const pinnedIds = filter.pinnedChatIds || [];
  if (pinnedIds.length === 0) {
    return matching;
  }

  const pinnedSet = new Set(pinnedIds);
  const pinnedList: Chat[] = [];
  const unpinnedList: Chat[] = [];

  for (const c of matching) {
    if (pinnedSet.has(c.id)) {
      pinnedList.push(c);
    } else {
      unpinnedList.push(c);
    }
  }

  // Sort pinned list by the index in pinnedIds
  pinnedList.sort((a, b) => {
    return pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id);
  });

  return [...pinnedList, ...unpinnedList];
}

/**
 * Calculate the total unread messages across chats matching a filter.
 */
export function countUnreadForFolder(
  chats: Chat[],
  filter: TeleForgeDialogFilter,
  contactIds?: Set<string> | string[]
): number {
  return chats.reduce((sum, chat) => {
    if (chatMatchesFolder(chat, filter, contactIds)) {
      return sum + (chat.unreadCount || 0);
    }
    return sum;
  }, 0);
}
