import React, { useState } from 'react';
import {
  Search,
  Menu,
  Moon,
  Sun,
  Settings,
  Bookmark,
  Users,
  Megaphone,
  Bot,
  Plus,
  ShieldCheck,
  Check,
  CheckCheck,
  Pin,
  VolumeX,
  LogOut,
  Radio,
  Folder,
  SlidersHorizontal,
  Palette,
  Wrench,
  Volume2,
  Cpu,
  Globe,
  Loader2,
  X,
} from 'lucide-react';
import { Chat, ChatFolder, UserProfile, TeleForgeDialogFilter } from '../types';
import { Avatar } from './Avatar';
import { TeleForgeLogo } from './TeleForgeLogo';
import { filterChatsForFolder, countUnreadForFolder } from '../utils/folderFilter';
import { TeleForgeGestureSettings, getGlobalTimestampFormat } from '../services/teleforgePowerTools';
import { telegramApi, TelegramDialog, resolveApiUrl } from '../services/telegramApi';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onSelectGlobalChat?: (dialog: TelegramDialog) => void;
  onOpenSettings: () => void;
  onOpenNewChat: () => void;
  onSelectSavedMessages: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: UserProfile;
  onLogout?: () => void;
  isMtProtoLive?: boolean;
  folders?: TeleForgeDialogFilter[];
  activeFolderId?: string;
  onSelectFolder?: (folderId: string) => void;
  onOpenFolderManager?: () => void;
  contactIds?: Set<string>;
  isSyncing?: boolean;
  onOpenThemeStudio?: () => void;
  onOpenPowerTools?: () => void;
  onOpenCommandCenter?: () => void;
  onTogglePinChat?: (chatId: string) => void;
  onToggleMuteChat?: (chatId: string) => void;
  onMarkChatRead?: (chatId: string) => void;
  gestureSettings?: TeleForgeGestureSettings;
}

function formatCount(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
  return num.toString();
}

function formatSidebarTime(timeStr?: string, rawDate?: number | string): string {
  const fmt = getGlobalTimestampFormat();
  if (fmt === 'hidden') return '';

  let h: number | null = null;
  let min: string | null = null;

  // 1. If rawDate is available as numeric/epoch timestamp or ISO datetime, extract hour & min with 100% precision
  if (typeof rawDate === 'number' && !isNaN(rawDate) && rawDate > 0) {
    const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      h = d.getHours();
      min = d.getMinutes().toString().padStart(2, '0');
    }
  } else if (typeof rawDate === 'string' && (rawDate.includes('T') || rawDate.includes(':') || /^\d{10,13}$/.test(rawDate))) {
    const ms = /^\d{10,13}$/.test(rawDate) ? parseInt(rawDate, 10) : rawDate;
    const finalMs = typeof ms === 'number' && ms < 10000000000 ? ms * 1000 : ms;
    const d = new Date(finalMs);
    if (!isNaN(d.getTime())) {
      h = d.getHours();
      min = d.getMinutes().toString().padStart(2, '0');
    }
  }

  // 2. Parse from timeStr fallback
  if (h === null || min === null) {
    if (!timeStr) return '';
    const m = timeStr.match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
    if (!m) return timeStr;
    let parsedH = parseInt(m[1], 10);
    min = m[2];
    const ampmMarker = m[3]?.toLowerCase();
    if (ampmMarker) {
      if (ampmMarker.startsWith('p') && parsedH < 12) parsedH += 12;
      if (ampmMarker.startsWith('a') && parsedH === 12) parsedH = 0;
    }
    h = parsedH;
  }

  if (fmt === '24h') {
    return `${h.toString().padStart(2, '0')}:${min}`;
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  onSelectChat,
  onSelectGlobalChat,
  onOpenSettings,
  onOpenNewChat,
  onSelectSavedMessages,
  darkMode,
  onToggleDarkMode,
  user,
  onLogout,
  isMtProtoLive = true,
  folders = [],
  activeFolderId = 'all',
  onSelectFolder,
  onOpenFolderManager,
  onOpenThemeStudio,
  onOpenPowerTools,
  onOpenCommandCenter,
  onTogglePinChat,
  onToggleMuteChat,
  onMarkChatRead,
  gestureSettings,
  contactIds,
  isSyncing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<TelegramDialog[]>([]);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [internalFolderId, setInternalFolderId] = useState('all');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [, setForceUpdate] = useState(0);

  // Listen for global Power Tools settings changes to update timestamp formats dynamically
  React.useEffect(() => {
    const onPowerToolsChanged = () => setForceUpdate((n) => n + 1);
    window.addEventListener('teleforge:powertools-changed', onPowerToolsChanged);
    return () => window.removeEventListener('teleforge:powertools-changed', onPowerToolsChanged);
  }, []);

  // Debounced global MTProto search across Telegram for public channels, groups, and users
  React.useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setGlobalResults([]);
      setIsSearchingGlobal(false);
      return;
    }

    setIsSearchingGlobal(true);
    const timer = setTimeout(async () => {
      try {
        const res = await telegramApi.searchGlobal(q, 15);
        // Exclude items already in local chats to avoid duplicate rendering
        const notLocal = (res.globalResults || []).filter(
          (gr) => !chats.some((c) => c.id === gr.id)
        );
        setGlobalResults(notLocal);
      } catch (err) {
        console.warn('[GlobalSearch] Error:', err);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, chats]);

  const currentFolderId = activeFolderId || internalFolderId;

  const handleFolderClick = (id: string) => {
    setInternalFolderId(id);
    onSelectFolder?.(id);
  };

  // Compile list of folders, guaranteeing 'All' is at the top
  const effectiveFolders: TeleForgeDialogFilter[] = React.useMemo(() => {
    const hasAll = folders.some((f) => f.id === 'all' || f.isDefault);
    if (!hasAll) {
      return [{ id: 'all', title: 'All', emoticon: '', isDefault: true }, ...folders];
    }
    return folders;
  }, [folders]);

  const activeFilter =
    effectiveFolders.find((f) => f.id === currentFolderId) || effectiveFolders[0];

  // Filter chats by the active TeleForge / Telegram folder filter
  const folderFilteredChats = React.useMemo(() => {
    return filterChatsForFolder(chats, activeFilter, contactIds);
  }, [chats, activeFilter, contactIds]);

  // Then apply search query filter if user typed anything
  const sortedChats = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return folderFilteredChats;
    }
    const q = searchQuery.toLowerCase().trim();
    return folderFilteredChats.filter((chat) => {
      const matchName = chat.name.toLowerCase().includes(q);
      const matchUsername = chat.username?.toLowerCase().includes(q);
      const matchMsg = chat.messages.some((m) => m.text.toLowerCase().includes(q));
      return matchName || matchUsername || matchMsg;
    });
  }, [folderFilteredChats, searchQuery]);

  const touchStartRef = React.useRef<{ x: number; y: number; chatId: string } | null>(null);

  const handleTouchStart = (e: React.TouchEvent, chatId: string) => {
    if (gestureSettings?.enableSwipeGestures === false) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, chatId };
  };

  const handleTouchEnd = (e: React.TouchEvent, chatId: string) => {
    if (!touchStartRef.current || touchStartRef.current.chatId !== chatId) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) > 55 && Math.abs(deltaY) < 50) {
      const action = deltaX < 0 ? gestureSettings?.swipeLeftAction : gestureSettings?.swipeRightAction;
      if (action === 'read') onMarkChatRead?.(chatId);
      else if (action === 'mute') onToggleMuteChat?.(chatId);
      else if (action === 'pin') onTogglePinChat?.(chatId);
    }
  };

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-white dark:bg-teleforge-surface border-r border-gray-200 dark:border-gray-800 z-10 select-none">
      {/* Brand & Menu Top Bar */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-800/80">
        <div className="flex items-center gap-2">
          {/* Menu Hamburger */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors"
              title="Menu"
            >
              <Menu size={20} />
            </button>

            {/* Menu Dropdown */}
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute left-0 top-11 w-64 bg-white dark:bg-[#17212b] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                  {/* User quick card */}
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
                    <Avatar src={user.avatar} name={user.name} size="sm" peerId="me" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name}</div>
                      <div className="text-xs text-gray-400 truncate">{user.phone || user.username}</div>
                    </div>
                  </div>

                  {/* MTProto Status indicator in menu */}
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between text-[11px] text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>MTProto 2.0 Live</span>
                    </div>
                    <span className="text-gray-400 font-mono">Layer 198</span>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onSelectSavedMessages();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Bookmark size={18} className="text-telegram-primary" />
                      <span>Saved Messages</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenNewChat();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Plus size={18} className="text-teleforge-primary dark:text-rose-300" />
                      <span>New Channel / Group</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenFolderManager?.();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Folder size={18} className="text-teleforge-primary dark:text-rose-300" />
                      <span>Folders</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenCommandCenter?.();
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Cpu size={18} className="text-[#8B1E22] dark:text-rose-400" />
                        <span>Command Center</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-900/30 text-rose-300 border border-red-800/40">
                        HUB
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenThemeStudio?.();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Palette size={18} className="text-teleforge-primary dark:text-rose-400" />
                      <span>Theme Studio</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenPowerTools?.();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Wrench size={18} className="text-amber-500" />
                      <span>Power Tools</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenSettings();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <Settings size={18} className="text-gray-500 dark:text-gray-400" />
                      <span>Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        onToggleDarkMode();
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {darkMode ? <Moon size={18} className="text-sky-400" /> : <Sun size={18} className="text-amber-500" />}
                        <span>Night Mode</span>
                      </div>
                      <div
                        className={`w-9 h-5 rounded-full relative transition-colors ${
                          darkMode ? 'bg-telegram-primary' : 'bg-gray-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                            darkMode ? 'translate-x-4.5' : 'translate-x-0.5'
                          } top-0.5 absolute`}
                        />
                      </div>
                    </button>

                    {onLogout && (
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors border-t border-gray-100 dark:border-gray-800/60 mt-1"
                      >
                        <LogOut size={18} />
                        <span>Log Out Session</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <TeleForgeLogo size="xs" withShadow={false} />
            <span className="font-bold text-base text-gray-900 dark:text-teleforge-cream tracking-tight">TeleForge</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onOpenCommandCenter}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-[#8B1E22] dark:hover:text-rose-400 transition-colors"
            title="TeleForge Command Center"
          >
            <Cpu size={18} />
          </button>
          <button
            onClick={onToggleDarkMode}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            title="Toggle Night Mode"
          >
            {darkMode ? <Moon size={18} className="text-sky-400" /> : <Sun size={18} className="text-amber-500" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="p-3 pb-2 flex items-center gap-2">
        <div className="flex-1 relative flex items-center">
          <Search size={16} className="absolute left-3 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search chats, channels, people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800/90 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-telegram-primary/50 transition-all"
          />
          {isSearchingGlobal ? (
            <Loader2 size={14} className="absolute right-3 text-teleforge-primary dark:text-teleforge-cream animate-spin pointer-events-none" />
          ) : searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setGlobalResults([]);
              }}
              className="absolute right-2.5 p-0.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Folders Navigation Bar (hidden during active search for maximum results space) */}
      {!searchQuery.trim() && (
        <div className="flex items-center px-1 border-b border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-teleforge-darkCanvas/30">
          <div className="flex-1 flex overflow-x-auto no-scrollbar scroll-smooth">
            {effectiveFolders.map((folderTab) => {
              const isActive = currentFolderId === folderTab.id;
              const unreadCount = countUnreadForFolder(chats, folderTab, contactIds);
              const tabTitle = typeof folderTab.title === 'string' ? folderTab.title : ((folderTab.title as any)?.text || 'Folder');
              const tabEmoticon = typeof folderTab.emoticon === 'string' ? folderTab.emoticon : ((folderTab.emoticon as any)?.text || '');

              return (
                <button
                  key={folderTab.id}
                  onClick={() => handleFolderClick(folderTab.id)}
                  className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 shrink-0 select-none ${
                    isActive
                      ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {tabEmoticon && <span>{tabEmoticon}</span>}
                  <span>{tabTitle}</span>
                  {unreadCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? 'bg-teleforge-primary text-teleforge-cream'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Manage Folders shortcut button */}
          {onOpenFolderManager && (
            <button
              type="button"
              onClick={onOpenFolderManager}
              title="Manage Folders"
              className="p-1.5 mx-1 rounded-lg text-gray-400 hover:text-teleforge-primary dark:hover:text-teleforge-cream hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <SlidersHorizontal size={14} />
            </button>
          )}
        </div>
      )}

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/40">
        {/* Section Header if Searching */}
        {searchQuery.trim() && sortedChats.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/70 dark:bg-[#131b26]/70 backdrop-blur-xs flex items-center justify-between">
            <span>Chats and Contacts</span>
            <span className="text-[10px] font-normal text-gray-400">{sortedChats.length}</span>
          </div>
        )}

        {sortedChats.length > 0 ? (
          sortedChats.map((chat) => {
            const isActive = activeChatId === chat.id;
            const lastMsg = chat.messages[chat.messages.length - 1];

            return (
              <div
                key={chat.id}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '0 64px' }}
                onClick={() => onSelectChat(chat.id)}
                onTouchStart={(e) => handleTouchStart(e, chat.id)}
                onTouchEnd={(e) => handleTouchEnd(e, chat.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors relative select-none ${
                  isActive
                    ? 'bg-teleforge-primary text-teleforge-cream'
                    : 'hover:bg-gray-100/80 dark:hover:bg-gray-800/60'
                }`}
              >
                {/* Avatar with status indicator */}
                <div className="relative shrink-0">
                  <Avatar
                    src={chat.avatar}
                    previewSrc={chat.thumbUrl}
                    name={chat.name}
                    color={chat.avatarColor}
                    size="md"
                    peerId={chat.id}
                  />
                  {chat.online && chat.type === 'direct' && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-[#17212b] rounded-full" />
                  )}
                  {chat.type === 'bot' && (
                    <div className="absolute bottom-0 right-0 bg-blue-600 text-white rounded-full p-0.5 ring-1 ring-white dark:ring-gray-800">
                      <Bot size={10} />
                    </div>
                  )}
                </div>

                {/* Info and Preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className={`text-sm font-semibold truncate ${
                          isActive ? 'text-teleforge-cream font-bold' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {chat.name}
                      </span>
                      {chat.verified && (
                        <ShieldCheck size={14} className="text-teleforge-cream fill-teleforge-primary shrink-0" />
                      )}
                    </div>
                    {lastMsg && (
                      <span
                        className={`text-xs shrink-0 ${
                          isActive ? 'text-teleforge-cream/80' : 'text-gray-400'
                        }`}
                      >
                        {formatSidebarTime(lastMsg.timestamp, lastMsg.rawDate)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`text-xs truncate flex items-center gap-1 min-w-0 ${
                        isActive ? 'text-teleforge-cream/90' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {lastMsg?.senderName && chat.type !== 'direct' && (
                        <span className="font-semibold shrink-0">
                          {lastMsg.isOutgoing ? 'You: ' : `${lastMsg.senderName}: `}
                        </span>
                      )}
                      {lastMsg?.isOutgoing && chat.type === 'direct' && (
                        <span className="shrink-0">
                          {lastMsg.status === 'read' ? (
                            <CheckCheck size={13} className={isActive ? 'text-teleforge-cream' : 'text-teleforge-primary dark:text-teleforge-cream'} />
                          ) : (
                            <Check size={13} className="text-gray-400" />
                          )}
                        </span>
                      )}
                      <span className="truncate">
                        {lastMsg ? lastMsg.text : chat.description || (chat.username ? `@${chat.username}` : 'No messages yet')}
                      </span>
                    </div>

                    {/* Unread badge & pinned status */}
                    <div className="flex items-center gap-1 shrink-0">
                      {chat.isPinned && (
                        <Pin
                          size={13}
                          className={`rotate-45 ${
                            isActive ? 'text-teleforge-cream' : 'text-teleforge-primary dark:text-teleforge-cream'
                          }`}
                        />
                      )}
                      {chat.isMuted && (
                        <VolumeX
                          size={13}
                          className={isActive ? 'text-teleforge-cream/70' : 'text-gray-400'}
                        />
                      )}
                      {chat.unreadCount > 0 && (
                        <span
                          className={`min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold ${
                            isActive
                              ? 'bg-teleforge-cream text-teleforge-primary'
                              : chat.isMuted
                              ? 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              : 'bg-teleforge-primary text-teleforge-cream shadow-xs shadow-red-950/20'
                          }`}
                        >
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Hover Quick Actions */}
                <div className="hidden group-hover:flex items-center gap-1 pl-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePinChat?.(chat.id);
                    }}
                    title={chat.isPinned ? "Unpin chat" : "Pin chat"}
                    className={`p-1 rounded transition-colors ${
                      chat.isPinned
                        ? 'text-teleforge-primary dark:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        : 'text-gray-500 hover:text-teleforge-primary dark:text-gray-400 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Pin size={13} className={chat.isPinned ? 'rotate-45' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMuteChat?.(chat.id);
                    }}
                    title={chat.isMuted ? "Unmute chat" : "Mute chat"}
                    className={`p-1 rounded transition-colors ${
                      chat.isMuted
                        ? 'text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                        : 'text-gray-500 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {chat.isMuted ? <Volume2 size={13} /> : <VolumeX size={13} />}
                  </button>
                </div>
              </div>
            );
          })
        ) : isSyncing && !searchQuery.trim() ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div key={idx} className="flex items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded-sm w-3/5" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800/60 rounded-sm w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Global Search Results from MTProto */}
        {searchQuery.trim().length >= 2 && (
          <div className="mt-1 border-t border-gray-100 dark:border-gray-800/60">
            <div className="px-3 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/70 dark:bg-[#131b26]/70 backdrop-blur-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Globe size={12} className="text-teleforge-primary dark:text-teleforge-cream" />
                <span>Global Search</span>
              </div>
              {isSearchingGlobal && (
                <div className="flex items-center gap-1 text-[10px] font-normal text-teleforge-primary dark:text-teleforge-cream">
                  <Loader2 size={10} className="animate-spin" />
                  <span>Searching...</span>
                </div>
              )}
            </div>

            {globalResults.length > 0 ? (
              globalResults.map((item) => {
                const typeLabel = item.isChannel ? 'Channel' : item.isGroup ? 'Group' : item.isUser ? 'User' : 'Chat';
                const typeColor = item.isChannel
                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                  : item.isGroup
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300';

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (onSelectGlobalChat) {
                        onSelectGlobalChat(item);
                      } else {
                        onSelectChat(item.id);
                      }
                    }}
                    className="group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors relative hover:bg-gray-100/80 dark:hover:bg-gray-800/60 select-none"
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        src={resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(item.id)}`)}
                        previewSrc={item.thumbUrl}
                        name={item.title}
                        color={item.isChannel ? '#E17076' : item.isGroup ? '#65AADD' : '#6C5CE7'}
                        size="md"
                        peerId={item.id}
                      />
                      {item.isChannel && (
                        <div className="absolute bottom-0 right-0 bg-purple-600 text-white rounded-full p-0.5 ring-1 ring-white dark:ring-gray-800">
                          <Megaphone size={9} />
                        </div>
                      )}
                      {item.isGroup && (
                        <div className="absolute bottom-0 right-0 bg-emerald-600 text-white rounded-full p-0.5 ring-1 ring-white dark:ring-gray-800">
                          <Users size={9} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                            {item.title}
                          </span>
                          {item.isVerified && (
                            <ShieldCheck size={14} className="text-teleforge-cream fill-teleforge-primary shrink-0" />
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 ${typeColor}`}>
                          {typeLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.username && (
                          <span className="text-teleforge-primary dark:text-teleforge-cream font-medium">
                            @{item.username}
                          </span>
                        )}
                        {typeof item.memberCount === 'number' && item.memberCount > 0 && (
                          <span>
                            {item.username ? '• ' : ''}
                            {formatCount(item.memberCount)} {item.isChannel ? 'subscribers' : 'members'}
                          </span>
                        )}
                        {!item.username && (!item.memberCount || item.memberCount === 0) && (
                          <span>{item.isChannel ? 'Public Channel' : item.isGroup ? 'Public Group' : 'Telegram User'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : isSearchingGlobal ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((idx) => (
                  <div key={idx} className="flex items-center gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                    <div className="flex-1 space-y-1.5 py-1">
                      <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-sm w-2/5" />
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-800/60 rounded-sm w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-gray-400">
                No public channels or groups found
              </div>
            )}
          </div>
        )}

        {/* Empty state when nothing matched either locally or globally */}
        {sortedChats.length === 0 && (!searchQuery.trim() || (searchQuery.trim().length >= 2 && globalResults.length === 0 && !isSearchingGlobal)) && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400 text-xs">
            <Search size={28} className="mb-2 opacity-40" />
            <span>{searchQuery.trim() ? 'No chats, channels, or people found' : 'No chats found'}</span>
          </div>
        )}
      </div>

      {/* Floating Action Button: New Chat */}
      <div className="p-3 flex justify-end">
        <button
          onClick={onOpenNewChat}
          className="p-3.5 rounded-full bg-teleforge-primary text-teleforge-cream hover:bg-teleforge-hover active:bg-teleforge-active shadow-lg shadow-red-950/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center"
          title="New Message"
        >
          <Plus size={20} />
        </button>
      </div>
    </aside>
  );
};
