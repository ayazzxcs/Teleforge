import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initialChats, currentUser } from './data/mockData';
import { Chat, Message, UserProfile, Attachment, TeleForgeDialogFilter } from './types';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { SettingsModal } from './components/SettingsModal';
import { NewChatModal } from './components/NewChatModal';
import { AddBotToChatModal } from './components/AddBotToChatModal';
import { JoinPreviewModal } from './components/JoinPreviewModal';
import { parseTelegramUrl } from './utils/telegramLinks';
import { MediaModal } from './components/MediaModal';
import { ManageChatModal } from './components/ManageChatModal';
import { FolderManagerModal } from './components/FolderManagerModal';
import { ThemeStudioModal } from './components/ThemeStudioModal';
import { PowerToolsModal } from './components/PowerToolsModal';
import { CommandCenterModal } from './components/CommandCenterModal';
import { TelegramAuthView } from './components/TelegramAuthView';
import { TeleForgeLogo } from './components/TeleForgeLogo';
import { telegramApi, TelegramUser, AuthStatusResponse, TelegramDialog, isAndroidApp } from './services/telegramApi';
import { avatarService } from './services/avatarService';
import { mediaService } from './services/mediaService';
import { mapDialogToChat, mapTelegramMessage, mapTelegramUserToProfile, formatMessageTime, getAvatarColor } from './utils/telegramAdapter';
import { TeleForgeTheme, getInitialTheme, applyTheme, BUILTIN_PRESETS } from './theme/teleforgeTheme';
import {
  getPowerToolsSettings,
  savePowerToolsSettings,
  TeleForgePowerToolsSettings,
} from './services/teleforgePowerTools';
import { runTeleForgeSettingsMigration } from './services/teleforgeSettingsMigration';
import { showToast, ToastContainer } from './components/Toast';
import { RefreshCw } from 'lucide-react';
import { notificationService, InAppToast } from './services/notificationService';

export const App: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse>({
    authorized: false,
    configured: false,
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSyncingDialogs, setIsSyncingDialogs] = useState(false);

  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const cached = localStorage.getItem('teleforge_cached_chats');
      if (cached) {
        return JSON.parse(cached).filter((c: Chat) => c.id !== 'gemini-bot');
      }
    } catch (e) {}
    return [];
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    try {
      const cached = localStorage.getItem('teleforge_cached_chats');
      if (cached) {
        const parsed = JSON.parse(cached).filter((c: Chat) => c.id !== 'gemini-bot');
        if (parsed && parsed.length > 0) return parsed[0].id;
      }
    } catch (e) {}
    return null;
  });
  const [user, setUser] = useState<UserProfile>(currentUser);
  const [activeTheme, setActiveTheme] = useState<TeleForgeTheme>(() => getInitialTheme());
  const [isThemeStudioOpen, setIsThemeStudioOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return activeTheme.mode === 'dark';
  });
  const [isInfoDrawerOpen, setIsInfoDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    try {
      return sessionStorage.getItem('teleforge_settings_open') === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isSettingsOpen) {
        sessionStorage.setItem('teleforge_settings_open', 'true');
      } else {
        sessionStorage.removeItem('teleforge_settings_open');
      }
    } catch (e) {}
  }, [isSettingsOpen]);

  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [addBotModalData, setAddBotModalData] = useState<{ botUsername: string; startParam?: string } | null>(null);
  const [joinPreviewData, setJoinPreviewData] = useState<{
    title: string;
    about?: string;
    participantsCount?: number;
    photo?: string;
    isChannel?: boolean;
    isGroup?: boolean;
    alreadyJoined?: boolean;
    chatId?: string;
    joinHash: string; // original hash/username to pass to joinChat
  } | null>(null);
  const [isJoiningFromPreview, setIsJoiningFromPreview] = useState(false);
  const [mediaModalAttachment, setMediaModalAttachment] = useState<Attachment | null>(null);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState<Record<string, boolean>>({});
  const [manageModalChat, setManageModalChat] = useState<Chat | null>(null);
  const directChatsRef = useRef<Map<string, Chat>>(new Map());
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const activeTopicIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    const currentChat = chats.find((c) => c.id === activeChatId);
    activeTopicIdRef.current = currentChat?.activeTopicId;
  }, [activeChatId, chats]);

  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const [inAppToast, setInAppToast] = useState<InAppToast | null>(null);

  useEffect(() => {
    return notificationService.onInAppToast((toast) => {
      setInAppToast(toast);
    });
  }, []);

  useEffect(() => {
    if (!inAppToast) return;
    const timer = setTimeout(() => {
      setInAppToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [inAppToast]);

  // Sync document title unread counter
  useEffect(() => {
    const totalUnread = chats.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    notificationService.updateDocumentTitle(totalUnread);
  }, [chats]);

  // Handle open chat event triggered by notifications or toasts
  useEffect(() => {
    const handleOpenChat = (e: any) => {
      if (e.detail?.chatId) {
        setActiveChatId(e.detail.chatId);
        setMobileShowChat(true);
      }
    };
    window.addEventListener('teleforge:openChat', handleOpenChat as EventListener);
    return () => {
      window.removeEventListener('teleforge:openChat', handleOpenChat as EventListener);
    };
  }, []);

  // TeleForge Power Tools State
  const [powerToolsSettings, setPowerToolsSettings] = useState<TeleForgePowerToolsSettings>(() =>
    getPowerToolsSettings()
  );
  const [isPowerToolsOpen, setIsPowerToolsOpen] = useState(false);

  // TeleForge Command Center State
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'profile' | 'appearance' | 'teleforge' | 'notifications' | 'privacy' | 'about'
  >('profile');

  const handleOpenSettingsWithTab = (
    tab: 'profile' | 'appearance' | 'teleforge' | 'notifications' | 'privacy' | 'about'
  ) => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // Run TeleForge Schema Migration on App Boot
  useEffect(() => {
    runTeleForgeSettingsMigration();
  }, []);

  // Update theme on mode change or custom theme change
  useEffect(() => {
    const isDark = activeTheme.mode === 'dark';
    setDarkMode(isDark);
    applyTheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'teleforge_theme' && e.newValue) {
        try {
          const newTheme = JSON.parse(e.newValue);
          setActiveTheme(newTheme);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleToggleDarkMode = useCallback(() => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    const matchingPreset = nextMode ? BUILTIN_PRESETS[0] : BUILTIN_PRESETS[3];
    setActiveTheme(matchingPreset);
    applyTheme(matchingPreset);
  }, [darkMode]);

  // TeleForge Power Folders State
  const [folders, setFolders] = useState<TeleForgeDialogFilter[]>([
    { id: 'all', title: 'All', emoticon: '', isDefault: true, enabled: true },
    { id: 'filter-personal', title: 'Personal', emoticon: '💬', contacts: true, nonContacts: true, enabled: true },
    { id: 'filter-channels', title: 'Channels', emoticon: '📣', channels: true, enabled: true },
    { id: 'filter-groups', title: 'Groups', emoticon: '👥', groups: true, enabled: true },
    { id: 'filter-bots', title: 'Bots', emoticon: '🤖', bots: true, enabled: true },
  ]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [contactsList, setContactsList] = useState<TelegramUser[]>([]);

  // Load real dialogs from Telegram MTProto
  const loadTelegramDialogs = useCallback(async () => {
    setIsSyncingDialogs(true);
    try {
      const realDialogs = await telegramApi.getDialogs(400);
      avatarService.preloadAvatars(realDialogs.filter((d) => d.hasAvatar).map((d) => d.id));
      const mapped = realDialogs.map(mapDialogToChat);

      const finalChats = mapped;
      const currentActiveId = activeChatIdRef.current;
      // Preserve existing messages when refreshing — prevents race condition
      // where loadTelegramDialogs overwrites messages loaded by loadMessagesForChat
      setChats((prev) => {
        const finalChatIds = new Set(finalChats.map((c) => c.id));
        // Preserve client-created direct chats, active chat, or chats with messages
        const preservedChats = prev.filter(
          (c) => !finalChatIds.has(c.id) && (c.id === currentActiveId || directChatsRef.current.has(c.id) || c.messages.length > 0)
        );
        const updatedFinalChats = finalChats.map((newChat) => {
          const existing = prev.find((c) => c.id === newChat.id);
          if (existing) {
            return {
              ...newChat,
              messages: existing.messages.length > 0 ? existing.messages : newChat.messages,
              memberCount: existing.memberCount ?? newChat.memberCount,
              description: existing.description || newChat.description,
              topics: existing.topics && existing.topics.length > 0 ? existing.topics : newChat.topics,
              activeTopicId: existing.activeTopicId,
              isForum: Boolean(newChat.isForum || existing.isForum),
              isOwner: Boolean(newChat.isOwner ?? existing.isOwner),
              isAdmin: Boolean(newChat.isAdmin ?? existing.isAdmin),
              isCreator: Boolean(newChat.isCreator ?? existing.isCreator),
              // Preserve unreadCount: 0 if user already read this chat client-side
              unreadCount: existing.unreadCount === 0 ? 0 : newChat.unreadCount,
            };
          }
          return newChat;
        });
        return [...preservedChats, ...updatedFinalChats];
      });
      try {
        localStorage.setItem('teleforge_cached_chats', JSON.stringify(finalChats.slice(0, 30)));
      } catch (e) {}

      if (finalChats.length > 0 && !activeChatIdRef.current) {
        activeChatIdRef.current = finalChats[0].id;
        setActiveChatId(finalChats[0].id);
      }
    } catch (err: any) {
      console.error('[MTProto] Error loading dialogs:', err.message);
    } finally {
      setIsSyncingDialogs(false);
    }
  }, []);

  // Load real dialog filters (folders) from Telegram MTProto
  const loadTelegramFolders = useCallback(async () => {
    try {
      const serverFolders = await telegramApi.getDialogFilters();
      if (serverFolders && serverFolders.length > 0) {
        const hasAll = serverFolders.some((f) => f.id === 'all' || f.isDefault);
        const finalList = hasAll
          ? serverFolders
          : [{ id: 'all', title: 'All', emoticon: '', isDefault: true, enabled: true }, ...serverFolders];
        setFolders(finalList);
      }
    } catch (err: any) {
      console.error('[MTProto] Error loading dialog filters:', err.message);
    }
  }, []);

  // Load real contacts from Telegram MTProto
  const loadTelegramContacts = useCallback(async () => {
    try {
      const contacts = await telegramApi.getContacts();
      setContactsList(contacts);
    } catch (err: any) {
      console.error('[MTProto] Error loading contacts:', err.message);
    }
  }, []);

  // Initial Auth Status Check
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      setIsLoadingAuth(true);
      try {
        const status = await telegramApi.getAuthStatus();
        if (isMounted) {
          setAuthStatus(status);
          if (status.authorized && status.user) {
            setUser(mapTelegramUserToProfile(status.user));
            avatarService.loadAvatar('me', true).then((url) => {
              if (url && isMounted) {
                setUser((prev) => ({ ...prev, avatar: url }));
              }
            });
            loadTelegramDialogs();
            loadTelegramFolders();
            loadTelegramContacts();
          }
        }
      } catch (e: any) {
        console.warn('[MTProto] Auth check error:', e.message);
        if (isMounted) {
          // If we have a saved session in localStorage, preserve authorized state!
          const hasSession = Boolean(localStorage.getItem('teleforge_session'));
          if (hasSession) {
            const cached = localStorage.getItem('teleforge_cached_user');
            let userObj: TelegramUser = {
              id: 'me',
              firstName: 'Telegram',
              lastName: 'User',
              name: 'Telegram User',
              username: '',
              phone: '',
              isBot: false,
              isSelf: true,
              isVerified: false,
            };
            if (cached) {
              try {
                userObj = JSON.parse(cached);
              } catch (err) {}
            }
            setAuthStatus({ authorized: true, configured: true, user: userObj });
            setUser(mapTelegramUserToProfile(userObj));
            loadTelegramDialogs();
            loadTelegramFolders();
          } else {
            setAuthStatus({ authorized: false, configured: true });
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    };

    checkAuth();
    return () => {
      isMounted = false;
    };
  }, [loadTelegramDialogs, loadTelegramFolders, loadTelegramContacts]);

  // Listen for native Android photo selection to ensure Settings modal remains open
  useEffect(() => {
    const handleNativePhoto = () => {
      setIsSettingsOpen(true);
    };
    window.addEventListener('teleforge:photoSelected', handleNativePhoto);
    return () => window.removeEventListener('teleforge:photoSelected', handleNativePhoto);
  }, []);

  // Folder Actions: Save, Delete, Reorder with real Telegram sync
  const handleSaveFilter = async (filter: TeleForgeDialogFilter) => {
    await telegramApi.saveDialogFilter(filter);
    await loadTelegramFolders();
  };

  const handleDeleteFilter = async (id: string) => {
    await telegramApi.deleteDialogFilter(id);
    if (activeFolderId === id) {
      setActiveFolderId('all');
    }
    await loadTelegramFolders();
  };

  const handleReorderFilters = async (orderIds: string[]) => {
    setFolders((prev) => {
      const allTab = prev.find((f) => f.id === 'all' || f.isDefault);
      const reorderedCustom = orderIds
        .map((id) => prev.find((f) => f.id === id))
        .filter(Boolean) as TeleForgeDialogFilter[];
      return allTab ? [allTab, ...reorderedCustom] : reorderedCustom;
    });
    await telegramApi.reorderDialogFilters(orderIds);
    await loadTelegramFolders();
  };

  const [isLoadingTopics, setIsLoadingTopics] = useState(false);

  // Load forum topics for supergroups
  const loadForumTopicsForChat = useCallback(async (chatId: string) => {
    if (!chatId || chatId === 'saved-messages') return;
    setIsLoadingTopics(true);
    try {
      const res = await telegramApi.getForumTopics(chatId);
      const fetchedTopics = res && Array.isArray(res.topics) ? res.topics : [];
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                isForum: fetchedTopics.length > 0 ? true : c.isForum,
                topics: fetchedTopics,
              }
            : c
        )
      );
    } catch (err: any) {
      console.warn('[Forum] Failed to load topics for chat:', chatId, err.message);
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, topics: [] } : c))
      );
    } finally {
      setIsLoadingTopics(false);
    }
  }, []);

  // Auto-fetch forum topics when an active chat is selected and topics haven't been loaded yet
  useEffect(() => {
    if (!authStatus.authorized || !activeChatId || activeChatId === 'saved-messages') return;
    const currChat = chats.find((c) => c.id === activeChatId);
    if (currChat && (currChat.isForum || currChat.type === 'group' || currChat.type === 'channel')) {
      if (currChat.topics === undefined) {
        loadForumTopicsForChat(activeChatId);
      }
    }
  }, [activeChatId, authStatus.authorized, chats, loadForumTopicsForChat]);

  // Load real messages when a chat is selected
  const loadMessagesForChat = async (chatId: string, topicId?: number) => {
    if (!authStatus.authorized || chatId === 'saved-messages') {
      return;
    }

    try {
      const realMsgs = await telegramApi.getMessages(
        chatId,
        50,
        undefined,
        topicId ? { replyTo: topicId } : undefined
      );

      const incomingSenders = realMsgs.filter((m) => !m.out && m.senderId).map((m) => m.senderId!);
      if (incomingSenders.length > 0 && !isAndroidApp()) {
        avatarService.preloadAvatars(incomingSenders);
      }

      const mediaItems = realMsgs.filter((m) => m.hasMedia && m.id && m.mediaType === 'photo').map((m) => ({ chatId, messageId: m.id }));
      if (mediaItems.length > 0 && !isAndroidApp()) {
        mediaService.preloadMedia(mediaItems.slice(0, 5));
      }

      setChats((prev) => {
        const targetChat = prev.find((c) => c.id === chatId);
        const mapped = realMsgs.map((m) => mapTelegramMessage(m, chatId, targetChat?.name || 'Telegram'));
        const sorted = mapped.sort((a, b) => (a.rawDate || 0) - (b.rawDate || 0));
        return prev.map((c) => (c.id === chatId ? { ...c, messages: sorted, activeTopicId: topicId } : c));
      });

      // Update hasMore state for this chat
      setHasMoreOlderMessages((prev) => ({
        ...prev,
        [chatId]: realMsgs.length >= 50,
      }));

      // Refresh chat full info (real member count & bio) from Telegram MTProto
      telegramApi.getChatFullInfo(chatId).then((info) => {
        if (info && (typeof info.memberCount === 'number' || info.about)) {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    memberCount: typeof info.memberCount === 'number' ? info.memberCount : c.memberCount,
                    description: info.about || c.description,
                  }
                : c
            )
          );
        }
      }).catch(() => {});
    } catch (err: any) {
      console.error('[MTProto] Failed to load messages for chat:', chatId, err.message);
    }
  };

  // Listen for real-time MTProto updates from Telegram servers
  useEffect(() => {
    if (!authStatus.authorized) return;

    const unsubscribe = telegramApi.onNewMessage(({ chatId, message: newMsg }) => {
      const isCurrentActive = activeChatIdRef.current === chatId;

      setChats((prevChats) => {
        const chatIdx = prevChats.findIndex((c) => c.id === chatId);
        const mappedMsg = mapTelegramMessage(newMsg, chatId, chatIdx >= 0 ? prevChats[chatIdx].name : 'Telegram');

        if (chatIdx >= 0) {
          const chat = prevChats[chatIdx];
          const exists = chat.messages.some((m) => String(m.id) === String(newMsg.id));
          const updatedMessages = exists
            ? chat.messages.map((m) => (String(m.id) === String(newMsg.id) ? mappedMsg : m))
            : [...chat.messages, mappedMsg];

          const updatedChat: Chat = {
            ...chat,
            messages: updatedMessages,
            unreadCount: isCurrentActive ? 0 : (chat.unreadCount || 0) + (newMsg.out ? 0 : 1),
            lastMessage: {
              text: newMsg.text || (newMsg.hasMedia ? (newMsg.mediaType === 'photo' ? '📷 Photo' : '📎 Media') : ''),
              timestamp: formatMessageTime(newMsg.date),
              rawDate: newMsg.date,
              isOutgoing: newMsg.out,
            },
          };

          const otherChats = prevChats.filter((_, idx) => idx !== chatIdx);
          return [updatedChat, ...otherChats];
        }

        return prevChats;
      });

      // Trigger notification alerts and audio chime
      if (!newMsg.out) {
        const existingChat = chatsRef.current.find((c) => c.id === chatId);
        const chatTitle = existingChat ? existingChat.name : (newMsg.senderName || 'Telegram');
        const chatType = existingChat
          ? (existingChat.type === 'channel' ? 'channel' : (existingChat.type === 'group' ? 'group' : 'private'))
          : 'private';

        notificationService.notifyIncomingMessage({
          chatId,
          chatTitle,
          chatType,
          chatAvatar: existingChat?.avatar || newMsg.senderAvatar,
          messageText: newMsg.text || (newMsg.hasMedia ? (newMsg.mediaType === 'photo' ? '📷 Photo' : '📎 Media') : ''),
          isOutgoing: Boolean(newMsg.out),
          isMuted: existingChat?.isMuted,
          isChatActive: isCurrentActive,
        });
      }

      if (!newMsg.out && newMsg.senderId) {
        avatarService.loadAvatar(newMsg.senderId, false).catch(() => {});
      }
    });

    const unsubReactions = telegramApi.onReactionUpdate(({ chatId, messageId, reactions }) => {
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (String(m.id) !== String(messageId)) return m;
              return { ...m, reactions };
            }),
          };
        })
      );
    });

    return () => {
      unsubscribe();
      unsubReactions();
    };
  }, [authStatus.authorized]);

  // Active chat polling (paused in background, relaxed on mobile where MTProto pushes live updates)
  useEffect(() => {
    if (!authStatus.authorized || !activeChatId || activeChatId === 'saved-messages') return;

    let isCancelled = false;
    const pollMs = isAndroidApp() ? 25000 : 8000;
    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const latestMsgs = await telegramApi.getMessages(
          activeChatId,
          15,
          undefined,
          activeTopicIdRef.current ? { replyTo: activeTopicIdRef.current } : undefined
        );
        if (isCancelled || !latestMsgs || latestMsgs.length === 0) return;

        setChats((prevChats) => {
          const targetChat = prevChats.find((c) => c.id === activeChatId);
          if (!targetChat) return prevChats;

          const existingIds = new Set(targetChat.messages.map((m) => String(m.id)));
          const newBatch = latestMsgs.filter((m) => !existingIds.has(String(m.id)));

          if (newBatch.length === 0) return prevChats;

          const mappedBatch = newBatch.map((m) =>
            mapTelegramMessage(m, activeChatId, targetChat.name || 'Telegram')
          );

          const merged = [...targetChat.messages, ...mappedBatch].sort((a, b) => {
            const timeA = a.rawDate || (a.id.startsWith('temp-') ? Date.now() : 0);
            const timeB = b.rawDate || (b.id.startsWith('temp-') ? Date.now() : 0);
            return timeA - timeB;
          });

          return prevChats.map((c) => (c.id === activeChatId ? { ...c, messages: merged } : c));
        });
      } catch (err) {}
    }, pollMs);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [authStatus.authorized, activeChatId]);

  // Periodic dialogs sync (relaxed on mobile to avoid constant re-rendering)
  useEffect(() => {
    if (!authStatus.authorized) return;

    const dialogPollMs = isAndroidApp() ? 45000 : 20000;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadTelegramDialogs();
    }, dialogPollMs);

    return () => clearInterval(interval);
  }, [authStatus.authorized, loadTelegramDialogs]);

  // Instant refresh when returning from background
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (!document.hidden && authStatus.authorized) {
        loadTelegramDialogs();
        if (activeChatId && activeChatId !== 'saved-messages') {
          telegramApi.getMessages(activeChatId, 20).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [authStatus.authorized, activeChatId, loadTelegramDialogs]);

  // Load older messages for pagination / infinite scroll
  const handleLoadOlderMessages = async (chatId: string): Promise<boolean> => {
    if (!authStatus.authorized || chatId === 'saved-messages') return false;
    if (isLoadingOlderMessages) return false;
    if (hasMoreOlderMessages[chatId] === false) return false;

    const chat = chats.find((c) => c.id === chatId);
    if (!chat || chat.messages.length === 0) return false;

    // Find the smallest numeric message ID (the oldest loaded message)
    const numericIds = chat.messages
      .map((m) => parseInt(m.id, 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (numericIds.length === 0) return false;

    const oldestId = Math.min(...numericIds);

    setIsLoadingOlderMessages(true);
    try {
      const olderMsgs = await telegramApi.getMessages(
        chatId,
        50,
        oldestId,
        chat.activeTopicId ? { replyTo: chat.activeTopicId } : undefined
      );

      if (!olderMsgs || olderMsgs.length === 0) {
        setHasMoreOlderMessages((prev) => ({ ...prev, [chatId]: false }));
        return false;
      }

      const mapped = olderMsgs.map((m) =>
        mapTelegramMessage(m, chatId, chat.name || 'Telegram')
      );

      const mediaItems = olderMsgs.filter((m) => m.hasMedia && m.id && m.mediaType === 'photo').map((m) => ({ chatId, messageId: m.id }));
      if (mediaItems.length > 0) {
        mediaService.preloadMedia(mediaItems.slice(0, 5));
      }

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === chatId) {
            const existingIds = new Set(c.messages.map((m) => m.id));
            const newBatch = mapped.filter((m) => !existingIds.has(m.id));
            if (newBatch.length === 0) {
              return c;
            }
            const combined = [...newBatch, ...c.messages].sort((a, b) => (a.rawDate || 0) - (b.rawDate || 0));
            return {
              ...c,
              messages: combined,
            };
          }
          return c;
        })
      );

      if (olderMsgs.length < 50) {
        setHasMoreOlderMessages((prev) => ({ ...prev, [chatId]: false }));
      }
      return true;
    } catch (err: any) {
      console.error('[MTProto] Failed to load older messages:', err.message);
      return false;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  // Jump to a specific message by ID — loads surrounding context if not in memory
  const handleJumpToMessage = async (chatId: string, messageId: string): Promise<boolean> => {
    const chat = chatsRef.current.find((c) => c.id === chatId);
    if (!chat) return false;

    // Check if message already exists in loaded messages
    const exists = chat.messages.some((m) => m.id === messageId);
    if (exists) return true;

    try {
      const numericId = parseInt(messageId, 10);
      if (!numericId) return false;

      const surrounding = await telegramApi.getMessagesAround(chatId, numericId, 50);
      if (!surrounding || surrounding.length === 0) return false;

      const mapped = surrounding.map((m) =>
        mapTelegramMessage(m, chatId, chat.name || 'Telegram')
      );

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === chatId) {
            const existingIds = new Set(c.messages.map((m) => m.id));
            const newBatch = mapped.filter((m) => !existingIds.has(m.id));
            if (newBatch.length === 0) return c;
            const combined = [...newBatch, ...c.messages].sort(
              (a, b) => (a.rawDate || 0) - (b.rawDate || 0)
            );
            return { ...c, messages: combined };
          }
          return c;
        })
      );

      return true;
    } catch (err: any) {
      console.error('[JumpToMessage] Failed:', err.message);
      return false;
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setMobileShowChat(true);

    // Clear unread count locally and on Telegram server
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
    );

    // Tell Telegram server we've read this chat (fire-and-forget)
    if (authStatus.authorized && chatId !== 'saved-messages') {
      telegramApi.markAsRead(chatId);
    }

    const targetChat = chats.find((c) => c.id === chatId);
    activeTopicIdRef.current = targetChat?.activeTopicId;

    // Fetch messages from Telegram MTProto
    loadMessagesForChat(chatId, targetChat?.activeTopicId);

    if (targetChat?.isForum || targetChat?.type === 'group' || targetChat?.type === 'channel') {
      loadForumTopicsForChat(chatId);
    }
  };

  const handleSelectGlobalChat = (dialog: TelegramDialog) => {
    // Check if already in chats
    const existing = chats.find((c) => c.id === dialog.id);
    if (!existing) {
      const newChat = mapDialogToChat({ ...dialog, isJoined: false });
      setChats((prev) => [newChat, ...prev]);
    }
    handleSelectChat(dialog.id);
  };

  const handleOpenDirectChat = (userId: string, userName: string, userAvatar?: string, userThumbUrl?: string) => {
    let target = chats.find((c) => c.id === userId) || directChatsRef.current.get(userId);
    if (!target) {
      target = {
        id: userId,
        name: userName || 'Telegram User',
        avatar: userAvatar || '',
        thumbUrl: userThumbUrl,
        avatarColor: getAvatarColor(userName || userId),
        type: 'direct',
        messages: [],
        unreadCount: 0,
        online: false,
      };
    }
    directChatsRef.current.set(userId, target);
    setChats((prev) => {
      const exists = prev.some((c) => c.id === userId);
      return exists ? prev : [target!, ...prev];
    });
    activeChatIdRef.current = userId;
    handleSelectChat(userId);
  };

  const handleOpenTelegramLink = async (url: string) => {
    const parsed = parseTelegramUrl(url);
    if (!parsed.isTelegramUrl) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    // 1. Bot startgroup links -> Open in-app group selector
    if (parsed.type === 'startgroup' && parsed.username) {
      setAddBotModalData({
        botUsername: parsed.username,
        startParam: parsed.startGroupParam,
      });
      return;
    }

    // 2. Open chat or start command
    if ((parsed.type === 'open_chat' || parsed.type === 'start') && parsed.username) {
      const clean = parsed.username.toLowerCase().replace(/^@+/, '');
      
      // Check local dialogs first — if found here, user is already a member
      let targetChat = chats.find(
        (c) => c.username && c.username.toLowerCase().replace(/^@+/, '') === clean
      );

      if (targetChat) {
        const targetChatId = targetChat.id;
        setChats((prev) => {
          const exists = prev.some((c) => c.id === targetChatId);
          return exists ? prev : [targetChat!, ...prev];
        });
        activeChatIdRef.current = targetChatId;
        setActiveChatId(targetChatId);
        setMobileShowChat(true);
        loadMessagesForChat(targetChatId);

        if (parsed.type === 'start' && parsed.startParam) {
          setTimeout(() => {
            handleSendMessage(`/start ${parsed.startParam}`, undefined, undefined, targetChatId);
          }, 400);
        }
        return;
      }

      // Not in local dialogs — check invite/entity to show preview for channels/groups
      // For 'start' commands (bot DMs), always navigate directly
      if (parsed.type === 'start') {
        // Bot DM — search and navigate
        try {
          const searchRes = await telegramApi.searchGlobal(clean, 5);
          const match = (searchRes.globalResults || [])
            .concat(searchRes.myResults || [])
            .find((r) => r.username && r.username.toLowerCase().replace(/^@+/, '') === clean);
          if (match) {
            targetChat = mapDialogToChat({ ...match, isJoined: true });
            const targetChatId = targetChat.id;
            setChats((prev) => {
              const exists = prev.some((c) => c.id === targetChatId);
              return exists ? prev : [targetChat!, ...prev];
            });
            activeChatIdRef.current = targetChatId;
            setActiveChatId(targetChatId);
            setMobileShowChat(true);
            loadMessagesForChat(targetChatId);
            if (parsed.startParam) {
              setTimeout(() => {
                handleSendMessage(`/start ${parsed.startParam}`, undefined, undefined, targetChatId);
              }, 400);
            }
            return;
          }
        } catch (e) {
          console.warn('[handleOpenTelegramLink] Failed to search username:', e);
        }
        showToast(`Could not find bot @${parsed.username}`, 'info');
        return;
      }

      // open_chat type — preview unjoined channel/group or open DM
      try {
        showToast('Loading preview...', 'info');
        const preview = await telegramApi.checkInvite(`@${clean}`);
        if (preview.success) {
          // If it's a channel or group, open the channel in preview mode (stalk mode)
          if (preview.isChannel || preview.isGroup) {
            const rawId = preview.chatId ? preview.chatId.toString() : clean;
            const fullId = rawId.startsWith('-100') || rawId.startsWith('-') ? rawId : `-100${rawId}`;

            const previewChat: Chat = {
              id: fullId,
              name: preview.title || clean,
              username: clean.startsWith('@') ? clean : `@${clean}`,
              avatar: preview.photo || '',
              avatarColor: 'bg-teleforge-primary',
              type: preview.isChannel ? 'channel' : 'group',
              isJoined: preview.alreadyJoined === true,
              memberCount: preview.participantsCount,
              unreadCount: 0,
              description: preview.about || '',
              messages: [],
            };

            setChats((prev) => {
              const exists = prev.some((c) => c.id === fullId || (c.username && c.username.toLowerCase().replace(/^@+/, '') === clean.toLowerCase()));
              if (exists) {
                return prev.map((c) => (c.id === fullId || (c.username && c.username.toLowerCase().replace(/^@+/, '') === clean.toLowerCase()))
                  ? { ...c, ...previewChat, isJoined: preview.alreadyJoined !== undefined ? preview.alreadyJoined : c.isJoined }
                  : c
                );
              }
              return [previewChat, ...prev];
            });

            activeChatIdRef.current = fullId;
            setActiveChatId(fullId);
            setMobileShowChat(true);
            loadMessagesForChat(fullId);
            return;
          }
          // It's a user or bot DM — navigate directly
          if (preview.chatId) {
            try {
              const searchRes = await telegramApi.searchGlobal(clean, 5);
              const match = (searchRes.globalResults || [])
                .concat(searchRes.myResults || [])
                .find((r) => r.username && r.username.toLowerCase().replace(/^@+/, '') === clean);
              if (match) {
                targetChat = mapDialogToChat({ ...match, isJoined: true });
                const targetChatId = targetChat.id;
                setChats((prev) => {
                  const exists = prev.some((c) => c.id === targetChatId);
                  return exists ? prev : [targetChat!, ...prev];
                });
                activeChatIdRef.current = targetChatId;
                setActiveChatId(targetChatId);
                setMobileShowChat(true);
                loadMessagesForChat(targetChatId);
                return;
              }
            } catch {}
          }
        } else if (preview.error) {
          showToast(preview.error, 'error');
          return;
        }
      } catch (err: any) {
        console.warn('[handleOpenTelegramLink] preview error:', err);
      }
      showToast(`Could not find Telegram user or channel @${parsed.username}`, 'info');
      return;
    }

    // 3. Join chat links — open in chat preview mode
    if (parsed.type === 'join' && parsed.joinHash) {
      try {
        showToast('Loading preview...', 'info');
        const preview = await telegramApi.checkInvite(parsed.joinHash);
        if (preview.success) {
          const rawId = preview.chatId ? preview.chatId.toString() : parsed.joinHash;
          const fullId = rawId.startsWith('-100') || rawId.startsWith('-') ? rawId : `-100${rawId}`;

          const previewChat: Chat = {
            id: fullId,
            name: preview.title || 'Telegram Group',
            username: parsed.joinHash, // stored so handleJoinChat can invoke joinChat with it
            avatar: preview.photo || '',
            avatarColor: 'bg-teleforge-primary',
            type: preview.isChannel ? 'channel' : 'group',
            isJoined: preview.alreadyJoined === true,
            memberCount: preview.participantsCount,
            unreadCount: 0,
            description: preview.about || '',
            messages: [],
          };

          setChats((prev) => {
            const exists = prev.some((c) => c.id === fullId);
            if (exists) {
              return prev.map((c) => (c.id === fullId ? { ...c, ...previewChat, isJoined: preview.alreadyJoined || c.isJoined } : c));
            }
            return [previewChat, ...prev];
          });

          activeChatIdRef.current = fullId;
          setActiveChatId(fullId);
          setMobileShowChat(true);
          loadMessagesForChat(fullId);
          return;
        } else {
          showToast(preview.error || 'Failed to load invite preview', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to load invite preview', 'error');
      }
      return;
    }

    // 4. Message jump links
    if (parsed.type === 'message') {
      if (parsed.chatId && parsed.messageId) {
        handleJumpToMessage(parsed.chatId, parsed.messageId);
        return;
      }
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleChatJoined = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, isJoined: true } : c))
    );
  };

  const handleJoinFromPreview = async () => {
    if (!joinPreviewData) return;
    setIsJoiningFromPreview(true);
    try {
      const res = await telegramApi.joinChat(joinPreviewData.joinHash);
      if (res.success) {
        showToast(res.message || (res.alreadyJoined ? 'Already joined this chat' : 'Joined successfully!'), 'success');
        setJoinPreviewData(null);
        await loadTelegramDialogs();
        if (res.chat?.id) {
          const rawId = res.chat.id.toString();
          const fullId = rawId.startsWith('-100') || rawId.startsWith('-') ? rawId : `-100${rawId}`;
          handleSelectChat(fullId);
        }
      } else {
        showToast(res.error || 'Failed to join', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to join', 'error');
    } finally {
      setIsJoiningFromPreview(false);
    }
  };

  const handleOpenChatFromPreview = () => {
    if (!joinPreviewData?.chatId) return;
    const rawId = joinPreviewData.chatId;
    const fullId = rawId.startsWith('-100') || rawId.startsWith('-') ? rawId : `-100${rawId}`;
    setJoinPreviewData(null);
    handleSelectChat(fullId);
  };

  const handleSelectTopic = (topicId?: number) => {
    if (!activeChatId) return;
    activeTopicIdRef.current = topicId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId ? { ...c, activeTopicId: topicId } : c
      )
    );
    loadMessagesForChat(activeChatId, topicId);
  };

  const handleLeaveChat = async (chatId: string) => {
    const targetChat = chats.find((c) => c.id === chatId);
    const chatName = targetChat?.name || 'Chat';
    try {
      await telegramApi.leaveChat(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMobileShowChat(false);
      }
      setIsInfoDrawerOpen(false);
      showToast(`Left "${chatName}" successfully`, 'info');
      await loadTelegramDialogs();
    } catch (err: any) {
      console.error('[MTProto] Error leaving chat:', err);
      showToast(err.message || 'Failed to leave chat', 'error');
    }
  };

  const handleClearChatHistory = async (chatId: string, revoke: boolean) => {
    const targetChat = chats.find((c) => c.id === chatId);
    const chatName = targetChat?.name || 'Chat';
    try {
      await telegramApi.clearChatHistory(chatId, revoke);
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, messages: [], lastMessage: undefined } : c
        )
      );
      showToast(
        revoke
          ? `Chat history for "${chatName}" deleted for everyone from Telegram cloud`
          : `Chat history for "${chatName}" cleared locally`,
        'info'
      );
    } catch (err: any) {
      console.error('[MTProto] Error clearing chat history:', err);
      showToast(err.message || 'Failed to clear chat history', 'error');
    }
  };

  const handleDeleteChatPermanently = async (chatId: string) => {
    const targetChat = chats.find((c) => c.id === chatId);
    const chatName = targetChat?.name || 'Chat';
    try {
      await telegramApi.deleteChannelOrGroup(chatId);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMobileShowChat(false);
      }
      setIsInfoDrawerOpen(false);
      setManageModalChat(null);
      showToast(`"${chatName}" permanently deleted.`, 'info');
      await loadTelegramDialogs();
    } catch (err: any) {
      console.error('[MTProto] Error deleting chat:', err);
      showToast(err.message || 'Failed to delete chat', 'error');
      throw err;
    }
  };

  const handleUpdateChatInfo = async (chatId: string, details: { title?: string; about?: string }) => {
    try {
      await telegramApi.editChatDetails(chatId, details);
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                name: details.title ? details.title : c.name,
                description: details.about !== undefined ? details.about : c.description,
              }
            : c
        )
      );
      showToast('Chat details updated successfully!', 'success');
    } catch (err: any) {
      console.error('[MTProto] Error updating chat details:', err);
      showToast(err.message || 'Failed to update chat details', 'error');
      throw err;
    }
  };

  const handleSendMessage = async (text: string, replyTo?: Message, attachment?: Attachment, targetChatId?: string) => {
    const destChatId = targetChatId || activeChatIdRef.current || activeChatId;
    if (!destChatId) return;

    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const localMsg: Message = {
      id: tempId,
      chatId: destChatId,
      senderId: 'user-me',
      senderName: user.name,
      text,
      timestamp,
      date: 'Today',
      rawDate: Date.now(),
      isOutgoing: true,
      status: 'sending',
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderName: replyTo.senderName,
            text: replyTo.text,
          }
        : undefined,
      attachment,
    };

    // Optimistically update UI
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === destChatId) {
          return {
            ...c,
            messages: [...c.messages, localMsg],
            lastMessage: {
              text: attachment ? (attachment.type === 'audio' ? 'Voice message' : 'Photo attachment') : text,
              timestamp,
              isOutgoing: true,
            },
          };
        }
        return c;
      })
    );

    // REAL TELEGRAM MTPROTO SEND
    if (authStatus.authorized) {
      try {
        const targetChat = chats.find((c) => c.id === destChatId);
        const replyToId = replyTo
          ? parseInt(replyTo.id, 10)
          : (targetChat?.activeTopicId ? targetChat.activeTopicId : undefined);
        let sentTelegramId: number | undefined;

        if (attachment?.type === 'gif' && attachment.inlineResult) {
          const res = await telegramApi.sendInlineBotResult(
            destChatId,
            attachment.inlineResult.queryId,
            attachment.inlineResult.id,
            replyToId
          );
          sentTelegramId = res.messageId;
        } else if (attachment?.type === 'sticker' && attachment.documentId && attachment.accessHash) {
          const res = await telegramApi.sendStickerDocument(
            destChatId,
            {
              documentId: attachment.documentId,
              accessHash: attachment.accessHash,
              fileReference: attachment.fileReference,
            },
            replyToId
          );
          sentTelegramId = res.id;
        } else {
          const sentTelegramMsg = await telegramApi.sendMessage(destChatId, text, replyToId);
          sentTelegramId = sentTelegramMsg.id;
        }

        // Update with real Telegram message ID and mark sent
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === destChatId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId
                    ? {
                        ...m,
                        id: sentTelegramId ? String(sentTelegramId) : m.id,
                        status: 'sent',
                      }
                    : m
                ),
              };
            }
            return c;
          })
        );
      } catch (err: any) {
        console.error('[MTProto] Error sending real message:', err.message);
        // Mark failed or keep sent
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === destChatId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? { ...m, status: 'sent' } : m
                ),
              };
            }
            return c;
          })
        );
      }
    }
  };

  const handleToggleReaction = async (chatId: string, messageId: string, emoji: string) => {
    // Optimistic UI state update
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;

        return {
          ...chat,
          messages: chat.messages.map((msg) => {
            if (msg.id !== messageId) return msg;

            const existingReactions = msg.reactions ? [...msg.reactions] : [];
            const foundIdx = existingReactions.findIndex((r) => r.emoji === emoji);

            if (foundIdx > -1) {
              const current = existingReactions[foundIdx];
              if (current.userReacted) {
                if (current.count <= 1) {
                  existingReactions.splice(foundIdx, 1);
                } else {
                  existingReactions[foundIdx] = {
                    ...current,
                    count: current.count - 1,
                    userReacted: false,
                  };
                }
              } else {
                existingReactions[foundIdx] = {
                  ...current,
                  count: current.count + 1,
                  userReacted: true,
                };
              }
            } else {
              existingReactions.push({ emoji, count: 1, userReacted: true });
            }

            return {
              ...msg,
              reactions: existingReactions,
            };
          }),
        };
      })
    );

    // Real Telegram MTProto reaction sync
    if (authStatus.authorized && chatId !== 'saved-messages') {
      try {
        await telegramApi.sendReaction(chatId, messageId, emoji);
      } catch (err: any) {
        console.error('[MTProto] Failed to sync reaction to Telegram:', err.message);
      }
    }
  };

  const handleTogglePinChat = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  const handleToggleMuteChat = (chatId: string) => {
    handleToggleMute(chatId);
  };

  const handleMarkChatRead = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: c.unreadCount > 0 ? 0 : 1 } : c))
    );
  };

  const handleDeleteMessage = async (chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) }
          : c
      )
    );
    showToast('Message deleted', 'info');

    if (authStatus.authorized && chatId !== 'saved-messages') {
      try {
        await telegramApi.deleteMessage(chatId, messageId);
      } catch (err: any) {
        console.error('[MTProto] Error deleting message on Telegram:', err.message);
      }
    }
  };

  const handlePinMessage = async (chatId: string, messageId: string) => {
    showToast('Message pinned in chat', 'success');

    if (authStatus.authorized && chatId !== 'saved-messages') {
      try {
        await telegramApi.pinMessage(chatId, messageId);
      } catch (err: any) {
        console.error('[MTProto] Error pinning message on Telegram:', err.message);
      }
    }
  };

  const handleEditMessage = async (chatId: string, messageId: string, newText: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, text: newText } : m
              ),
            }
          : c
      )
    );
    showToast('Message edited', 'success');

    if (authStatus.authorized && chatId !== 'saved-messages') {
      try {
        await telegramApi.editMessage(chatId, messageId, newText);
      } catch (err: any) {
        console.error('[MTProto] Error editing message on Telegram:', err.message);
      }
    }
  };

  const handleSaveToSavedMessages = (message: Message) => {
    handleSelectSavedMessages();
    setTimeout(() => {
      handleSendMessage(`[Forwarded from ${message.senderName}]: ${message.text}`);
      showToast('Saved to Saved Messages', 'success');
    }, 120);
  };

  const handleForwardMessage = async (message: Message, targetChatIds: string[]) => {
    if (!activeChat || targetChatIds.length === 0) return;
    const sourceChatId = activeChat.id;

    for (const targetChatId of targetChatIds) {
      try {
        await telegramApi.forwardMessages(sourceChatId, targetChatId, [message.id]);
      } catch (err: any) {
        console.warn('[Forward] MTProto forward error, falling back locally:', err?.message || err);
      }

      const targetChat = chats.find((c) => c.id === targetChatId);
      const isSelfForward = targetChatId === 'saved_messages' || targetChat?.isSelf;

      const fwdMsg: Message = {
        id: `fwd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        chatId: targetChatId,
        senderId: 'self',
        senderName: 'You',
        text: message.text || '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toISOString(),
        rawDate: Math.floor(Date.now() / 1000),
        isOutgoing: true,
        status: 'sent',
        attachment: message.attachment,
        forwardFrom: {
          id: message.forwardFrom?.id || (message.isOutgoing ? undefined : activeChat.id),
          name: message.forwardFrom?.name || message.senderName || activeChat.name || 'Forwarded message',
          avatar: message.forwardFrom?.avatar || activeChat.avatar,
          thumbUrl: message.forwardFrom?.thumbUrl || activeChat.thumbUrl,
          isChannel: activeChat.type === 'channel',
        },
      };

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === targetChatId) {
            return {
              ...c,
              lastMessage: {
                text: fwdMsg.text || (fwdMsg.attachment ? `[${fwdMsg.attachment.type}]` : 'Forwarded message'),
                timestamp: fwdMsg.timestamp,
                isOutgoing: true,
              },
              messages: [...c.messages, fwdMsg],
            };
          }
          return c;
        })
      );

      const targetName = targetChat?.name || (isSelfForward ? 'Saved Messages' : 'Chat');
      showToast(`Forwarded to ${targetName}`, 'success');
    }
  };

  const handleToggleMute = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, isMuted: !c.isMuted } : c))
    );
  };

  const handleCreateChat = (newChat: Chat) => {
    setChats((prev) => [newChat, ...prev.filter((c) => c.id !== newChat.id)]);
    setActiveChatId(newChat.id);
    setMobileShowChat(true);
    setTimeout(() => {
      loadTelegramDialogs();
    }, 1200);
  };

  const handleSelectSavedMessages = () => {
    let savedChat = chats.find((c) => c.id === 'saved-messages');
    if (!savedChat) {
      savedChat = {
        id: 'saved-messages',
        name: 'Saved Messages',
        avatar: '',
        avatarColor: '#2AABEE',
        type: 'direct',
        unreadCount: 0,
        isPinned: true,
        description: 'Your personal cloud storage. Forward messages here, send media or store links.',
        messages: [
          {
            id: 'saved-1',
            chatId: 'saved-messages',
            senderId: 'user-me',
            senderName: user.name,
            text: 'Welcome to Saved Messages! Forward messages here to save them, or send quick notes and links.',
            timestamp: '12:00',
            rawDate: Date.now() - 3600000 * 2,
            date: 'Today',
            isOutgoing: true,
            status: 'read',
          },
        ],
      };
      setChats((prev) => [savedChat!, ...prev]);
    }
    setActiveChatId('saved-messages');
    setMobileShowChat(true);
  };

  const handleLogout = async () => {
    try {
      await telegramApi.logout();
    } catch (e) {}
    setAuthStatus({ authorized: false, configured: true });
    setChats([]);
    setActiveChatId(null);
  };

  const handleAuthSuccess = async (telegramUser: TelegramUser) => {
    setAuthStatus({ authorized: true, configured: true, user: telegramUser });
    setUser(mapTelegramUserToProfile(telegramUser));
    avatarService.loadAvatar('me', true).then((url) => {
      if (url) {
        setUser((prev) => ({ ...prev, avatar: url }));
      }
    });
    await Promise.allSettled([
      loadTelegramDialogs(),
      loadTelegramFolders(),
      loadTelegramContacts(),
    ]);
  };

  const contactIdsSet = React.useMemo(() => {
    return new Set(contactsList.map((c) => c.id));
  }, [contactsList]);

  const activeChat = chats.find((c) => c.id === activeChatId) || (activeChatId ? directChatsRef.current.get(activeChatId) : null) || null;

  // Loading screen while verifying initial MTProto connection
  if (isLoadingAuth) {
    return (
      <div className="w-full h-full min-h-[100dvh] flex flex-col items-center justify-center bg-teleforge-secondary/20 dark:bg-teleforge-darkCanvas select-none">
        <TeleForgeLogo size="lg" className="mb-4 animate-pulse" />
        <p className="text-base font-bold text-gray-900 dark:text-teleforge-cream">Connecting to TeleForge...</p>
        <p className="text-xs text-gray-400 mt-1">Establishing secure Telegram MTProto connection</p>
      </div>
    );
  }

  const handleExploreDemo = () => {
    setAuthStatus({ authorized: true, configured: true });
    setChats(initialChats);
    if (initialChats.length > 0) {
      setActiveChatId(initialChats[0].id);
    }
  };

  // If not authorized with Telegram MTProto, display the official Telegram login flow
  if (!authStatus.authorized) {
    return (
      <TelegramAuthView
        onSuccess={handleAuthSuccess}
        isConfigured={authStatus.configured}
        onExploreDemo={handleExploreDemo}
      />
    );
  }

  return (
    <div className="w-full h-full min-h-[100dvh] md:min-h-full flex overflow-hidden font-sans bg-gray-100 dark:bg-[#0e1621] relative">
      {/* Sidebar Column */}
      <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full shrink-0`}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onSelectGlobalChat={handleSelectGlobalChat}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onSelectSavedMessages={handleSelectSavedMessages}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onOpenThemeStudio={() => setIsThemeStudioOpen(true)}
          onOpenPowerTools={() => setIsPowerToolsOpen(true)}
          onOpenCommandCenter={() => setIsCommandCenterOpen(true)}
          onTogglePinChat={handleTogglePinChat}
          onToggleMuteChat={handleToggleMuteChat}
          onMarkChatRead={handleMarkChatRead}
          gestureSettings={powerToolsSettings.gestures}
          user={user}
          onLogout={handleLogout}
          isMtProtoLive={true}
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={(fId) => setActiveFolderId(fId)}
          onOpenFolderManager={() => setIsFolderManagerOpen(true)}
          contactIds={contactIdsSet}
          isSyncing={isSyncingDialogs}
        />
      </div>

      {/* Main Chat Column */}
      <div className={`${!mobileShowChat ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0`}>
        <ChatView
          chat={activeChat}
          onSendMessage={handleSendMessage}
          onToggleInfoDrawer={() => setIsInfoDrawerOpen(!isInfoDrawerOpen)}
          onBackToSidebar={() => setMobileShowChat(false)}
          onOpenMediaModal={(att) => setMediaModalAttachment(att)}
          onToggleReaction={handleToggleReaction}
          isBotTyping={isBotTyping}
          globalFontSize={powerToolsSettings.messageFontSize}
          globalCompactMode={powerToolsSettings.compactMode}
          quickReactions={powerToolsSettings.reactions.quickReactions}
          onDeleteMessage={handleDeleteMessage}
          onPinMessage={handlePinMessage}
          onEditMessage={handleEditMessage}
          onSaveToSavedMessages={handleSaveToSavedMessages}
          onChatJoined={handleChatJoined}
          onLoadOlderMessages={handleLoadOlderMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
          hasMoreOlderMessages={activeChatId ? hasMoreOlderMessages[activeChatId] : undefined}
          onSelectChat={handleSelectChat}
          onOpenDirectChat={handleOpenDirectChat}
          onJumpToMessage={handleJumpToMessage}
          onOpenTelegramLink={handleOpenTelegramLink}
          availableChats={chats}
          onForwardMessage={handleForwardMessage}
          onClearHistory={handleClearChatHistory}
          onLeaveChat={handleLeaveChat}
          onSelectTopic={handleSelectTopic}
          onRefreshTopics={() => activeChatId && loadForumTopicsForChat(activeChatId)}
          isLoadingTopics={isLoadingTopics}
          onUpdateChatInfo={handleUpdateChatInfo}
          onDeleteChatPermanently={handleDeleteChatPermanently}
        />
      </div>

      {/* Right Drawer: Profile / Channel Info */}
      {isInfoDrawerOpen && activeChat && (
        <>
          {/* Desktop inline panel */}
          <div className="hidden lg:block w-80 md:w-96 h-full shrink-0">
            <ChatInfoDrawer
              chat={activeChat}
              isOpen={isInfoDrawerOpen}
              onClose={() => setIsInfoDrawerOpen(false)}
              onToggleMute={handleToggleMute}
              onOpenMediaModal={(att) => setMediaModalAttachment(att)}
              onClearHistory={handleClearChatHistory}
              onLeaveChat={handleLeaveChat}
              onOpenManageChat={() => setManageModalChat(activeChat)}
            />
          </div>

          {/* Mobile slide-over drawer modal */}
          <div className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              className="fixed inset-0"
              onClick={() => setIsInfoDrawerOpen(false)}
            />
            <div className="relative w-full max-w-md h-full bg-white dark:bg-teleforge-surface shadow-2xl z-10 animate-in slide-in-from-right duration-200">
              <ChatInfoDrawer
                chat={activeChat}
                isOpen={isInfoDrawerOpen}
                onClose={() => setIsInfoDrawerOpen(false)}
                onToggleMute={handleToggleMute}
                onOpenMediaModal={(att) => setMediaModalAttachment(att)}
                onClearHistory={handleClearChatHistory}
                onLeaveChat={handleLeaveChat}
                onOpenManageChat={() => setManageModalChat(activeChat)}
              />
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {manageModalChat && (
        <ManageChatModal
          isOpen={Boolean(manageModalChat)}
          chat={manageModalChat}
          onClose={() => setManageModalChat(null)}
          onUpdateChatInfo={handleUpdateChatInfo}
          onDeleteChat={handleDeleteChatPermanently}
        />
      )}

      <CommandCenterModal
        isOpen={isCommandCenterOpen}
        onClose={() => setIsCommandCenterOpen(false)}
        onOpenThemeStudio={() => setIsThemeStudioOpen(true)}
        onOpenFolderManager={() => setIsFolderManagerOpen(true)}
        onOpenPowerTools={() => setIsPowerToolsOpen(true)}
        onOpenSettingsTab={handleOpenSettingsWithTab}
        activeTheme={activeTheme}
        foldersCount={folders.length}
        activeFolderName={
          typeof folders.find((f) => f.id === activeFolderId)?.title === 'string'
            ? (folders.find((f) => f.id === activeFolderId)?.title as string)
            : 'All'
        }
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        powerToolsSettings={powerToolsSettings}
        onUpdatePowerToolsSettings={(updated: TeleForgePowerToolsSettings) => {
          setPowerToolsSettings(updated);
          savePowerToolsSettings(updated);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
        onUpdateUser={async (updated) => {
          setUser(updated);
          try {
            localStorage.setItem('teleforge_cached_user', JSON.stringify(updated));
          } catch (e) {}
          if (updated.avatar !== undefined) {
            setChats((prev) =>
              prev.map((c) => {
                if (c.id === 'saved-messages' || c.id === updated.id || c.id === 'me') {
                  return { ...c, avatar: updated.avatar };
                }
                return c;
              })
            );
          }
          const nameChanged = updated.name !== user.name;
          const bioChanged = updated.bio !== user.bio;
          const userChanged = updated.username !== user.username;
          if (nameChanged || bioChanged || userChanged) {
            try {
              const res = await telegramApi.updateProfile({
                name: updated.name,
                bio: updated.bio,
                username: updated.username ? updated.username.replace(/^@/, '') : '',
              });
              if (res.user) {
                const mapped = mapTelegramUserToProfile(res.user);
                if (updated.avatar !== undefined) {
                  mapped.avatar = updated.avatar;
                }
                setUser(mapped);
              }
            } catch (err: any) {
              console.warn('[Profile] Failed to update cloud text fields:', err.message);
              throw err;
            }
          }
        }}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onOpenThemeStudio={() => setIsThemeStudioOpen(true)}
        onOpenPowerTools={() => setIsPowerToolsOpen(true)}
        onOpenCommandCenter={() => setIsCommandCenterOpen(true)}
        activeTheme={activeTheme}
        initialTab={settingsInitialTab}
        onSelectTheme={(theme) => {
          setActiveTheme(theme);
          setDarkMode(theme.mode === 'dark');
        }}
      />

      <ThemeStudioModal
        isOpen={isThemeStudioOpen}
        onClose={() => setIsThemeStudioOpen(false)}
        activeTheme={activeTheme}
        onThemeApplied={(theme) => {
          setActiveTheme(theme);
          setDarkMode(theme.mode === 'dark');
        }}
      />

      <PowerToolsModal
        isOpen={isPowerToolsOpen}
        onClose={() => setIsPowerToolsOpen(false)}
        settings={powerToolsSettings}
        onUpdateSettings={(updated: TeleForgePowerToolsSettings) => {
          setPowerToolsSettings(updated);
          savePowerToolsSettings(updated);
        }}
      />

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onCreateChat={handleCreateChat}
      />

      {addBotModalData && (
        <AddBotToChatModal
          isOpen={Boolean(addBotModalData)}
          onClose={() => setAddBotModalData(null)}
          botUsername={addBotModalData.botUsername}
          startParam={addBotModalData.startParam}
          groups={chats.filter((c) => c.type === 'group' || c.type === 'channel')}
          onBotAdded={(groupId) => {
            setAddBotModalData(null);
            handleSelectChat(groupId);
          }}
        />
      )}

      <JoinPreviewModal
        isOpen={Boolean(joinPreviewData)}
        onClose={() => { setJoinPreviewData(null); setIsJoiningFromPreview(false); }}
        onJoin={handleJoinFromPreview}
        onOpenChat={handleOpenChatFromPreview}
        title={joinPreviewData?.title || ''}
        about={joinPreviewData?.about}
        participantsCount={joinPreviewData?.participantsCount}
        photo={joinPreviewData?.photo}
        isChannel={joinPreviewData?.isChannel}
        isGroup={joinPreviewData?.isGroup}
        alreadyJoined={joinPreviewData?.alreadyJoined}
        isJoining={isJoiningFromPreview}
      />

      <MediaModal
        attachment={mediaModalAttachment}
        onClose={() => setMediaModalAttachment(null)}
      />

      <FolderManagerModal
        isOpen={isFolderManagerOpen}
        folders={folders}
        chats={chats}
        contactIds={contactIdsSet}
        onClose={() => setIsFolderManagerOpen(false)}
        onSaveFilter={handleSaveFilter}
        onDeleteFilter={handleDeleteFilter}
        onReorderFilters={handleReorderFilters}
        onRefresh={loadTelegramFolders}
      />

      {/* Floating In-App Notification Toast */}
      {inAppToast && (
        <div
          onClick={() => {
            setActiveChatId(inAppToast.chatId);
            setMobileShowChat(true);
            setInAppToast(null);
          }}
          className="fixed top-4 right-4 z-50 flex items-center gap-3 p-3.5 max-w-sm bg-white/95 dark:bg-[#161C26]/95 backdrop-blur-md rounded-2xl shadow-2xl border border-teleforge-primary/30 cursor-pointer animate-in fade-in slide-in-from-top-4 duration-200 hover:scale-[1.02] transition-transform"
        >
          {inAppToast.avatarUrl ? (
            <img
              src={inAppToast.avatarUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/10"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-teleforge-primary text-white flex items-center justify-center font-bold text-sm shrink-0">
              {inAppToast.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
              {inAppToast.title}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-300 truncate mt-0.5">
              {inAppToast.body}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setInAppToast(null);
            }}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            &times;
          </button>
        </div>
      )}

      <ToastContainer />
    </div>
  );
};
