import React, { useState, useMemo } from 'react';
import { X, Check, Plus, Folder, Users, Radio, Bot, User, BellOff, EyeOff, Archive, AlertCircle, Sparkles } from 'lucide-react';
import { Chat, TeleForgeDialogFilter } from '../types';
import { ChatPickerModal } from './ChatPickerModal';
import { chatMatchesFolder } from '../utils/folderFilter';
import { Avatar } from './Avatar';

interface FolderEditModalProps {
  isOpen: boolean;
  folder?: TeleForgeDialogFilter | null;
  chats: Chat[];
  contactIds?: Set<string>;
  onSave: (filter: TeleForgeDialogFilter) => Promise<void>;
  onClose: () => void;
}

const EMOJI_PRESETS = ['📁', '💼', '💬', '📣', '👥', '🎮', '🤖', '📚', '⚡️', '🔔', '⭐️', '🎯', '🚀', '🔥', '🛡️', '🌐'];

export const FolderEditModal: React.FC<FolderEditModalProps> = ({
  isOpen,
  folder,
  chats,
  contactIds,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(folder && folder.id !== 'new');

  const getInitialTitle = (f?: TeleForgeDialogFilter | null) => {
    if (!f || !f.title) return '';
    return typeof f.title === 'string' ? f.title : ((f.title as any)?.text || String(f.title || ''));
  };

  const getInitialEmoticon = (f?: TeleForgeDialogFilter | null) => {
    if (!f || !f.emoticon) return '📁';
    return typeof f.emoticon === 'string' ? f.emoticon : ((f.emoticon as any)?.text || '📁');
  };

  const [title, setTitle] = useState(() => getInitialTitle(folder));
  const [emoticon, setEmoticon] = useState(() => getInitialEmoticon(folder));

  // Chat types
  const [contacts, setContacts] = useState(Boolean(folder?.contacts));
  const [nonContacts, setNonContacts] = useState(Boolean(folder?.nonContacts));
  const [groups, setGroups] = useState(Boolean(folder?.groups));
  const [channels, setChannels] = useState(Boolean(folder?.channels));
  const [bots, setBots] = useState(Boolean(folder?.bots));

  // Message state
  const [unreadOnly, setUnreadOnly] = useState(Boolean(folder?.unreadOnly || folder?.excludeRead));
  const [excludeMuted, setExcludeMuted] = useState(Boolean(folder?.excludeMuted));
  const [excludeArchived, setExcludeArchived] = useState(folder?.excludeArchived !== false);

  // Custom chats
  const [includeChatIds, setIncludeChatIds] = useState<string[]>(folder?.includeChatIds || []);
  const [excludeChatIds, setExcludeChatIds] = useState<string[]>(folder?.excludeChatIds || []);

  // Pickers
  const [isIncludePickerOpen, setIsIncludePickerOpen] = useState(false);
  const [isExcludePickerOpen, setIsExcludePickerOpen] = useState(false);

  // Status & errors
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Re-sync on open
  React.useEffect(() => {
    if (isOpen) {
      setTitle(getInitialTitle(folder));
      setEmoticon(getInitialEmoticon(folder));
      setContacts(Boolean(folder?.contacts));
      setNonContacts(Boolean(folder?.nonContacts));
      setGroups(Boolean(folder?.groups));
      setChannels(Boolean(folder?.channels));
      setBots(Boolean(folder?.bots));
      setUnreadOnly(Boolean(folder?.unreadOnly || folder?.excludeRead));
      setExcludeMuted(Boolean(folder?.excludeMuted));
      setExcludeArchived(folder?.excludeArchived !== false);
      setIncludeChatIds(folder?.includeChatIds || []);
      setExcludeChatIds(folder?.excludeChatIds || []);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen, folder]);

  // Universal Escape key listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isIncludePickerOpen) {
          setIsIncludePickerOpen(false);
        } else if (isExcludePickerOpen) {
          setIsExcludePickerOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isIncludePickerOpen, isExcludePickerOpen, onClose]);

  // Construct current filter representation for real-time live preview
  const previewFilter: TeleForgeDialogFilter = useMemo(() => {
    return {
      id: folder?.id || 'preview',
      numericId: folder?.numericId,
      title: title.trim() || 'Preview',
      emoticon,
      contacts,
      nonContacts,
      groups,
      channels,
      bots,
      unreadOnly,
      excludeRead: unreadOnly,
      excludeMuted,
      excludeArchived,
      includeChatIds,
      excludeChatIds,
      pinnedChatIds: folder?.pinnedChatIds || [],
    };
  }, [
    folder,
    title,
    emoticon,
    contacts,
    nonContacts,
    groups,
    channels,
    bots,
    unreadOnly,
    excludeMuted,
    excludeArchived,
    includeChatIds,
    excludeChatIds,
  ]);

  // Matching chats for live preview (Phase 4)
  const matchingChats = useMemo(() => {
    return chats.filter((c) => chatMatchesFolder(c, previewFilter, contactIds));
  }, [chats, previewFilter, contactIds]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMessage('Please enter a folder name.');
      return;
    }

    const hasAnyCriteria =
      contacts ||
      nonContacts ||
      groups ||
      channels ||
      bots ||
      unreadOnly ||
      excludeMuted ||
      includeChatIds.length > 0;

    if (!hasAnyCriteria) {
      setErrorMessage('Please select at least one chat type, message state, or included chat.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: folder?.id && folder.id !== 'new' ? folder.id : `filter-${Date.now()}`,
        numericId: folder?.numericId,
        title: cleanTitle,
        emoticon,
        contacts,
        nonContacts,
        groups,
        channels,
        bots,
        unreadOnly,
        excludeRead: unreadOnly,
        excludeMuted,
        excludeArchived,
        includeChatIds,
        excludeChatIds,
        pinnedChatIds: folder?.pinnedChatIds || [],
        customOrder: folder?.customOrder,
        enabled: true,
      });
      onClose();
    } catch (err: any) {
      console.error('[Folder Save Error]', err);
      setErrorMessage("Couldn't update this folder. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-teleforge-darkSurface rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-gray-200 dark:border-teleforge-darkBorder overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teleforge-primary/10 text-teleforge-primary dark:text-rose-300 flex items-center justify-center">
                <Folder size={18} />
              </div>
              <h3 className="font-bold text-base text-gray-900 dark:text-teleforge-cream">
                {isEditing ? 'Edit Folder' : 'New Power Folder'}
              </h3>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded-full hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Folder Name & Emoticon */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Folder Name & Icon
              </label>
              <div className="flex items-center gap-2.5">
                {/* Emoticon Selector */}
                <div className="relative group">
                  <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-teleforge-darkCanvas border border-gray-200 dark:border-teleforge-darkBorder flex items-center justify-center text-xl cursor-pointer hover:border-teleforge-primary">
                    {emoticon || '📁'}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Work, News, VIPs, Gaming..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={30}
                  className="flex-1 px-3.5 py-2.5 bg-gray-100 dark:bg-teleforge-darkCanvas text-sm font-medium text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-teleforge-primary/30 border border-transparent"
                  autoFocus
                />
              </div>

              {/* Emoji quick presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setEmoticon(emoji)}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${
                      emoticon === emoji
                        ? 'bg-teleforge-primary/20 border border-teleforge-primary scale-110'
                        : 'bg-gray-100 dark:bg-teleforge-darkCanvas/70 hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Types Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Chat Types
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Contacts */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={contacts}
                    onChange={(e) => setContacts(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <User size={15} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Contacts</span>
                </label>

                {/* Non-Contacts */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={nonContacts}
                    onChange={(e) => setNonContacts(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <User size={15} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Non-Contacts</span>
                </label>

                {/* Groups */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={groups}
                    onChange={(e) => setGroups(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <Users size={15} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Groups</span>
                </label>

                {/* Channels */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={channels}
                    onChange={(e) => setChannels(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <Radio size={15} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Channels</span>
                </label>

                {/* Bots */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={bots}
                    onChange={(e) => setBots(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <Bot size={15} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Bots</span>
                </label>
              </div>
            </div>

            {/* Message State */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Message State
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => setUnreadOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <Sparkles size={15} className="text-amber-500" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Unread only</span>
                    <p className="text-[11px] text-gray-400">Show only chats with unread messages</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeMuted}
                    onChange={(e) => setExcludeMuted(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <BellOff size={15} className="text-gray-400" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Exclude muted</span>
                    <p className="text-[11px] text-gray-400">Hide chats with notifications turned off</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-teleforge-darkBorder hover:bg-gray-50 dark:hover:bg-teleforge-darkCanvas/40 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={excludeArchived}
                    onChange={(e) => setExcludeArchived(e.target.checked)}
                    className="w-4 h-4 rounded text-teleforge-primary focus:ring-teleforge-primary"
                  />
                  <Archive size={15} className="text-gray-400" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">Exclude archived</span>
                    <p className="text-[11px] text-gray-400">Keep archived conversations out of this folder</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Custom Chats (Include / Exclude) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Specific Chats
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsIncludePickerOpen(true)}
                  className="flex items-center justify-between p-3 rounded-xl border border-dashed border-gray-300 dark:border-teleforge-darkBorder hover:border-teleforge-primary dark:hover:border-rose-400 bg-gray-50/50 dark:bg-teleforge-darkCanvas/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Plus size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Include Chats</span>
                      <p className="text-[10px] text-gray-400">
                        {includeChatIds.length > 0 ? `${includeChatIds.length} included` : 'None added'}
                      </p>
                    </div>
                  </div>
                  {includeChatIds.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                      {includeChatIds.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsExcludePickerOpen(true)}
                  className="flex items-center justify-between p-3 rounded-xl border border-dashed border-gray-300 dark:border-teleforge-darkBorder hover:border-rose-500 dark:hover:border-rose-400 bg-gray-50/50 dark:bg-teleforge-darkCanvas/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                      <EyeOff size={15} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Exclude Chats</span>
                      <p className="text-[10px] text-gray-400">
                        {excludeChatIds.length > 0 ? `${excludeChatIds.length} excluded` : 'None added'}
                      </p>
                    </div>
                  </div>
                  {excludeChatIds.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                      {excludeChatIds.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* PHASE 4: Live Folder Preview */}
            <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-teleforge-darkBorder">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Chats matching this folder</span>
                  <span className="px-2 py-0.5 rounded-full bg-teleforge-primary/10 text-teleforge-primary dark:text-rose-300 text-[10px] font-bold">
                    {matchingChats.length}
                  </span>
                </label>
                <span className="text-[10px] text-gray-400">Live preview</span>
              </div>

              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40 divide-y divide-gray-100 dark:divide-gray-800/40">
                {matchingChats.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No chats currently match these criteria. Try selecting chat types or including specific chats.
                  </div>
                ) : (
                  matchingChats.slice(0, 12).map((chat) => (
                    <div key={chat.id} className="flex items-center gap-2.5 px-3 py-2">
                      <Avatar
                        src={chat.avatar}
                        previewSrc={chat.thumbUrl}
                        name={chat.name}
                        color={chat.avatarColor}
                        size="sm"
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-teleforge-cream truncate">
                          {chat.name}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate">
                          {chat.type === 'channel'
                            ? 'Channel'
                            : chat.type === 'group'
                            ? 'Group'
                            : chat.type === 'bot'
                            ? 'Bot'
                            : 'Direct'}
                        </p>
                      </div>
                      {chat.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-teleforge-primary text-teleforge-cream text-[10px] font-bold">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  ))
                )}
                {matchingChats.length > 12 && (
                  <div className="p-2 text-center text-[10px] text-gray-400">
                    + {matchingChats.length - 12} more matching chats
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-gray-100 dark:border-teleforge-darkBorder bg-gray-50/50 dark:bg-teleforge-darkCanvas/40">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold bg-teleforge-primary hover:bg-teleforge-primaryHover text-teleforge-cream rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3 h-3 border-2 border-teleforge-cream border-t-transparent rounded-full animate-spin" />
                  <span>Syncing with Telegram...</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Create Folder'}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Included Chats Picker Modal */}
      <ChatPickerModal
        isOpen={isIncludePickerOpen}
        title="Include Chats"
        subtitle="These chats will always appear in this folder"
        chats={chats}
        selectedChatIds={includeChatIds}
        onSave={(ids) => setIncludeChatIds(ids)}
        onClose={() => setIsIncludePickerOpen(false)}
      />

      {/* Excluded Chats Picker Modal */}
      <ChatPickerModal
        isOpen={isExcludePickerOpen}
        title="Exclude Chats"
        subtitle="These chats will never appear in this folder"
        chats={chats}
        selectedChatIds={excludeChatIds}
        onSave={(ids) => setExcludeChatIds(ids)}
        onClose={() => setIsExcludePickerOpen(false)}
      />
    </>
  );
};
