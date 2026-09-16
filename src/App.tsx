import React, { useState, useEffect, useCallback } from 'react';
import { initialChats, currentUser } from './data/mockData';
import { Chat, Message, UserProfile, Attachment, TeleForgeDialogFilter } from './types';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { SettingsModal } from './components/SettingsModal';
import { NewChatModal } from './components/NewChatModal';
import { MediaModal } from './components/MediaModal';
import { FolderManagerModal } from './components/FolderManagerModal';
import { ThemeStudioModal } from './components/ThemeStudioModal';
import { PowerToolsModal } from './components/PowerToolsModal';
import { CommandCenterModal } from './components/CommandCenterModal';
import { TelegramAuthView } from './components/TelegramAuthView';
import { TeleForgeLogo } from './components/TeleForgeLogo';
import { telegramApi, TelegramUser, AuthStatusResponse, TelegramDialog } from './services/telegramApi';
import { mapDialogToChat, mapTelegramMessage, mapTelegramUserToProfile } from './utils/telegramAdapter';
import { TeleForgeTheme, getInitialTheme, applyTheme, BUILTIN_PRESETS } from './theme/teleforgeTheme';
import {
  getPowerToolsSettings,
  savePowerToolsSettings,
  TeleForgePowerToolsSettings,
} from './services/teleforgePowerTools';
import { runTeleForgeSettingsMigration } from './services/teleforgeSettingsMigration';
import { showToast, ToastContainer } from './components/Toast';
import { RefreshCw } from 'lucide-react';

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [mediaModalAttachment, setMediaModalAttachment] = useState<Attachment | null>(null);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState<Record<string, boolean>>({});

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

  // Apply theme tokens and sync dark mode class
  useEffect(() => {
    applyTheme(activeTheme);
  }, [activeTheme]);

  const handleToggleDarkMode = useCallback(() => {
    const nextMode = !darkMode;
    setDarkMode(nextMode);
    const matchingPreset = nextMode ? BUILTIN_PRESETS[0] : BUILTIN_PRESETS[3];
    setActiveTheme(matchingPreset);
    applyTheme(matchingPreset);
  }, [darkMode]);

  // Load real dialogs from Telegram MTProto
  const loadTelegramDialogs = useCallback(async () => {
    setIsSyncingDialogs(true);
    try {
      const realDialogs = await telegramApi.getDialogs(50);
      const mapped = realDialogs.map(mapDialogToChat);

      const finalChats = mapped;
      // Preserve existing messages when refreshing — prevents race condition
      // where loadTelegramDialogs overwrites messages loaded by loadMessagesForChat
      setChats((prev) => {
        if (prev.length === 0) return finalChats;
        return finalChats.map((newChat) => {
          const existing = prev.find((c) => c.id === newChat.id);
          if (existing && existing.messages.length > 0) {
            return {
              ...newChat,
              messages: existing.messages,
              memberCount: existing.memberCount ?? newChat.memberCount,
              description: existing.description || newChat.description,
              // Preserve unreadCount: 0 if user already read this chat client-side
              unreadCount: existing.unreadCount === 0 ? 0 : newChat.unreadCount,
            };
          }
          return newChat;
        });
      });
      try {
        localStorage.setItem('teleforge_cached_chats', JSON.stringify(finalChats.slice(0, 30)));
      } catch (e) {}

      if (finalChats.length > 0 && !activeChatId) {
        setActiveChatId(finalChats[0].id);
      }
    } catch (err: any) {
      console.error('[MTProto] Error loading dialogs:', err.message);
    } finally {
      setIsSyncingDialogs(false);
    }
  }, [activeChatId]);

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
    let retryTimer: any = null;

    const checkAuth = async (isRetry = false) => {
      setIsLoadingAuth(true);
      try {
        const status = await telegramApi.getAuthStatus();
        if (isMounted) {
          setAuthStatus(status);
          if (status.authorized && status.user) {
            setUser(mapTelegramUserToProfile(status.user));
          }
          // Immediately unblock auth loading so chats render
          setIsLoadingAuth(false);

          if (status.authorized && status.user) {
            // Progressive non-blocking loading
            loadTelegramDialogs();
            loadTelegramFolders();
            loadTelegramContacts();
          }
        }
      } catch (e: any) {
        console.warn('[MTProto] Auth check error:', e.message);
        // If initial check failed, retry once after a short delay in case backend is warming up
        if (!isRetry && isMounted) {
          retryTimer = setTimeout(() => {
            if (isMounted) {
              checkAuth(true);
            }
          }, 1500);
          return;
        }
      } finally {
        if (isMounted && (!retryTimer || isRetry)) {
          setIsLoadingAuth(false);
        }
      }
    };

    checkAuth();
    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [loadTelegramDialogs, loadTelegramFolders, loadTelegramContacts]);

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

  // Load real messages when a chat is selected
  const loadMessagesForChat = async (chatId: string) => {
    if (!authStatus.authorized || chatId === 'saved-messages') {
      return;
    }

    try {
      const realMsgs = await telegramApi.getMessages(chatId, 50);

      setChats((prev) => {
        const targetChat = prev.find((c) => c.id === chatId);
        const mapped = realMsgs.map((m) => mapTelegramMessage(m, chatId, targetChat?.name || 'Telegram'));
        return prev.map((c) => (c.id === chatId ? { ...c, messages: mapped } : c));
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
      const olderMsgs = await telegramApi.getMessages(chatId, 50, oldestId);

      if (!olderMsgs || olderMsgs.length === 0) {
        setHasMoreOlderMessages((prev) => ({ ...prev, [chatId]: false }));
        return false;
      }

      const mapped = olderMsgs.map((m) =>
        mapTelegramMessage(m, chatId, chat.name || 'Telegram')
      );

      setChats((prev) =>
        prev.map((c) => {
          if (c.id === chatId) {
            const existingIds = new Set(c.messages.map((m) => m.id));
            const newBatch = mapped.filter((m) => !existingIds.has(m.id));
            if (newBatch.length === 0) {
              return c;
            }
            return {
              ...c,
              messages: [...newBatch, ...c.messages],
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

    // Fetch messages from Telegram MTProto
    loadMessagesForChat(chatId);
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

  const handleChatJoined = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, isJoined: true } : c))
    );
  };

  const handleSendMessage = async (text: string, replyTo?: Message, attachment?: Attachment) => {
    if (!activeChatId) return;

    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const localMsg: Message = {
      id: tempId,
      chatId: activeChatId,
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
        if (c.id === activeChatId) {
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
        const replyToId = replyTo ? parseInt(replyTo.id, 10) : undefined;
        const sentTelegramMsg = await telegramApi.sendMessage(activeChatId, text, replyToId);

        // Update with real Telegram message ID and mark sent
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === activeChatId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId
                    ? {
                        ...m,
                        id: String(sentTelegramMsg.id),
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
            if (c.id === activeChatId) {
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

  const handleToggleMute = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, isMuted: !c.isMuted } : c))
    );
  };

  const handleCreateChat = (newChat: Chat) => {
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setMobileShowChat(true);
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
    await Promise.allSettled([
      loadTelegramDialogs(),
      loadTelegramFolders(),
      loadTelegramContacts(),
    ]);
  };

  const contactIdsSet = React.useMemo(() => {
    return new Set(contactsList.map((c) => c.id));
  }, [contactsList]);

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

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
        />
      </div>

      {/* Right Drawer: Profile / Channel Info */}
      {isInfoDrawerOpen && activeChat && (
        <div className="hidden lg:block h-full shrink-0">
          <ChatInfoDrawer
            chat={activeChat}
            isOpen={isInfoDrawerOpen}
            onClose={() => setIsInfoDrawerOpen(false)}
            onToggleMute={handleToggleMute}
          />
        </div>
      )}

      {/* Modals */}
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
          if (updated.avatar !== undefined) {
            setChats((prev) =>
              prev.map((c) => (c.id === 'saved-messages' ? { ...c, avatar: updated.avatar } : c))
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

      <ToastContainer />
    </div>
  );
};
