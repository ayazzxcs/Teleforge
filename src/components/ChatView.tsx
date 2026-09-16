import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  Phone,
  Search,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  ShieldCheck,
  CornerUpLeft,
  X,
  FileText,
  Image as ImageIcon,
  Pin,
  Sparkles,
  Bot,
  Info,
  Sliders,
  Palette,
  Copy,
  Edit2,
  Trash2,
  Bookmark,
  Languages,
  Share2,
  Flame,
  Volume2,
  VolumeX,
  Plus,
  UserPlus,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Chat, Message, Reaction, Attachment } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { Avatar } from './Avatar';
import { getAvatarColor } from '../utils/telegramAdapter';
import {
  ChatCustomizationConfig,
  MessageFontSize,
  getChatCustomization,
  getGlobalTimestampFormat,
  getFontSizeClass,
  getCornerRadiusClass,
  DEFAULT_QUICK_REACTIONS,
} from '../services/teleforgePowerTools';
import { ChatCustomizationModal } from './ChatCustomizationModal';
import { ReactionDetailsModal } from './ReactionDetailsModal';
import { showToast } from './Toast';
import { telegramApi, resolveApiUrl } from '../services/telegramApi';

interface ChatViewProps {
  chat: Chat | null;
  onSendMessage: (text: string, replyTo?: Message, attachment?: Attachment) => void;
  onToggleInfoDrawer: () => void;
  onBackToSidebar: () => void;
  onOpenMediaModal: (attachment: Attachment) => void;
  onToggleReaction: (chatId: string, messageId: string, emoji: string) => void;
  isBotTyping?: boolean;
  globalFontSize?: MessageFontSize;
  globalCompactMode?: boolean;
  quickReactions?: string[];
  onDeleteMessage?: (chatId: string, messageId: string) => void;
  onPinMessage?: (chatId: string, messageId: string) => void;
  onEditMessage?: (chatId: string, messageId: string, newText: string) => void;
  onSaveToSavedMessages?: (message: Message) => void;
  onChatJoined?: (chatId: string) => void;
  onLoadOlderMessages?: (chatId: string) => Promise<boolean>;
  isLoadingOlderMessages?: boolean;
  hasMoreOlderMessages?: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  chat,
  onSendMessage,
  onToggleInfoDrawer,
  onBackToSidebar,
  onOpenMediaModal,
  onToggleReaction,
  isBotTyping = false,
  globalFontSize = 'default',
  globalCompactMode = false,
  quickReactions = DEFAULT_QUICK_REACTIONS,
  onDeleteMessage,
  onPinMessage,
  onEditMessage,
  onSaveToSavedMessages,
  onChatJoined,
  onLoadOlderMessages,
  isLoadingOlderMessages = false,
  hasMoreOlderMessages,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinChat = async () => {
    if (!chat) return;
    setIsJoining(true);
    try {
      await telegramApi.joinChat(chat.id);
      onChatJoined?.(chat.id);
      showToast(`Successfully joined ${chat.name}!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to join chat', 'error');
    } finally {
      setIsJoining(false);
    }
  };

  // Power Tools Chat States
  const [chatConfig, setChatConfig] = useState<ChatCustomizationConfig>(() =>
    chat ? getChatCustomization(chat.id) : {}
  );
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [reactionDetailsData, setReactionDetailsData] = useState<{ messageId: string; reactions: Reaction[]; text?: string } | null>(null);

  // In-Chat Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<'all' | 'photo' | 'video' | 'file' | 'audio' | 'link'>('all');

  // Inline Message Translation State
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});

  // Editing Message State
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependingOlderRef = useRef<boolean>(false);
  const currentChatIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Trigger loading older messages from Telegram MTProto
  const triggerLoadOlder = async () => {
    if (!onLoadOlderMessages || !chat || isLoadingOlderMessages || hasMoreOlderMessages === false) {
      return;
    }
    const container = scrollContainerRef.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
      prevScrollTopRef.current = container.scrollTop;
      isPrependingOlderRef.current = true;
    }
    await onLoadOlderMessages(chat.id);
  };

  // Preserve scroll position seamlessly when older messages are prepended to the top
  useLayoutEffect(() => {
    if (isPrependingOlderRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        container.scrollTop = prevScrollTopRef.current + heightDiff;
      }
      isPrependingOlderRef.current = false;
    }
  }, [chat?.messages?.length]);

  // Refresh per-chat customization & reset scroll on chat switch
  useEffect(() => {
    if (chat) {
      setChatConfig(getChatCustomization(chat.id));
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchCategory('all');
      setReplyingTo(null);
      setEditingMessage(null);

      if (chat.id !== currentChatIdRef.current) {
        currentChatIdRef.current = chat.id;
        prevMessagesLengthRef.current = chat.messages.length;
        setShowScrollBottom(false);
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      }
    }
  }, [chat?.id]);

  // Listen for global Power Tools & Chat Customization changes to dynamically re-render
  useEffect(() => {
    const handlePowerToolsChanged = (e: any) => {
      if (chat) {
        const updated = getChatCustomization(chat.id);
        if (e.detail?.timestampFormat) {
          updated.timestampFormat = e.detail.timestampFormat;
        }
        setChatConfig({ ...updated });
      }
    };
    const handleChatCustomizationChanged = (e: any) => {
      if (chat && (!e.detail?.chatId || e.detail.chatId === chat.id)) {
        setChatConfig(e.detail?.config || getChatCustomization(chat.id));
      }
    };

    window.addEventListener('teleforge:powertools-changed', handlePowerToolsChanged);
    window.addEventListener('teleforge:chat-customization-changed', handleChatCustomizationChanged);
    return () => {
      window.removeEventListener('teleforge:powertools-changed', handlePowerToolsChanged);
      window.removeEventListener('teleforge:chat-customization-changed', handleChatCustomizationChanged);
    };
  }, [chat?.id]);

  // Auto-scroll to bottom on new incoming/outgoing messages
  useEffect(() => {
    if (!chat || isSearchOpen) return;
    if (isPrependingOlderRef.current) return;

    const prevLen = prevMessagesLengthRef.current;
    const currentLen = chat.messages.length;
    prevMessagesLengthRef.current = currentLen;

    if (currentLen > prevLen) {
      const lastMsg = chat.messages[currentLen - 1];
      const container = scrollContainerRef.current;
      const isNearBottom = container
        ? container.scrollHeight - container.scrollTop - container.clientHeight < 250
        : true;

      if (lastMsg?.isOutgoing || isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [chat?.messages, isBotTyping, isSearchOpen]);

  // Scroll listener for infinite scrolling and scroll-to-bottom button
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBottom(distanceFromBottom > 280);

    // Infinite scroll trigger: when user scrolls near the top (within 120px)
    if (container.scrollTop < 120 && !isLoadingOlderMessages && hasMoreOlderMessages !== false) {
      triggerLoadOlder();
    }
  };

  // Voice recording timer
  useEffect(() => {
    let interval: any;
    if (isRecordingVoice) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingVoice]);

  // Filter messages based on in-chat search query & category filter
  const displayedMessages = useMemo(() => {
    if (!chat) return [];
    let msgs = chat.messages;

    if (isSearchOpen) {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        msgs = msgs.filter(
          (m) =>
            m.text.toLowerCase().includes(q) ||
            m.senderName?.toLowerCase().includes(q) ||
            m.attachment?.name?.toLowerCase().includes(q)
        );
      }

      if (searchCategory !== 'all') {
        msgs = msgs.filter((m) => {
          if (searchCategory === 'photo') return m.attachment?.type === 'image';
          if (searchCategory === 'video') return m.attachment?.type === 'video';
          if (searchCategory === 'audio') return m.attachment?.type === 'audio';
          if (searchCategory === 'file') return m.attachment?.type === 'file';
          if (searchCategory === 'link') return m.text.includes('http://') || m.text.includes('https://') || m.text.includes('t.me/');
          return true;
        });
      }
    }

    return msgs;
  }, [chat?.messages, isSearchOpen, searchQuery, searchCategory]);

  if (!chat) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center telegram-chat-pattern select-none p-6 text-center">
        <div className="max-w-md p-6 rounded-2xl bg-white/70 dark:bg-gray-900/70 backdrop-blur-md shadow-lg border border-white/20 dark:border-gray-800/40">
          <div className="w-16 h-16 rounded-full bg-teleforge-primary/10 text-teleforge-primary flex items-center justify-center mx-auto mb-4">
            <Send size={28} className="translate-x-0.5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Select a chat to start messaging</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enjoy fast, secure synchronization, power customization, verified channels, and intelligent MTProto features.
          </p>
        </div>
      </div>
    );
  }

  const handleSend = () => {
    if (!inputText.trim()) return;

    if (editingMessage) {
      onEditMessage?.(chat.id, editingMessage.id, inputText.trim());
      setEditingMessage(null);
    } else {
      onSendMessage(inputText.trim(), replyingTo || undefined);
    }

    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSendVoiceNote = () => {
    setIsRecordingVoice(false);
    onSendMessage('Voice message', undefined, {
      type: 'audio',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      name: 'Voice message',
      duration: `0:${recordingSeconds.toString().padStart(2, '0') || '05'}`,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    const url = URL.createObjectURL(file);

    onSendMessage('', undefined, {
      type: isImg ? 'image' : isAudio ? 'audio' : 'file',
      url,
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      duration: isAudio ? '0:30' : undefined,
    });

    setShowAttachMenu(false);
    setReplyingTo(null);
  };

  // Format timestamp based on per-chat preference or global Power Tools preference
  const formatTime = (timeStr: string, rawDate?: number | string) => {
    const fmt = chatConfig.timestampFormat || getGlobalTimestampFormat();
    if (fmt === 'hidden') return '';

    let h: number | null = null;
    let min: string | null = null;

    // 1. If rawDate is available as a valid numeric/epoch timestamp or ISO datetime, extract hour & min
    if (typeof rawDate === 'number' && !isNaN(rawDate) && rawDate > 0) {
      // Handle both seconds (e.g. 1726460831) and milliseconds (e.g. 1726460831000)
      const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        h = d.getHours(); // 0..23
        min = d.getMinutes().toString().padStart(2, '0'); // 00..59
      }
    } else if (typeof rawDate === 'string' && (rawDate.includes('T') || rawDate.includes(':') || /^\d{10,13}$/.test(rawDate))) {
      const parsedNum = /^\d{10,13}$/.test(rawDate) ? parseInt(rawDate, 10) : NaN;
      const ms = !isNaN(parsedNum) && parsedNum < 10000000000 ? parsedNum * 1000 : (!isNaN(parsedNum) ? parsedNum : rawDate);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        h = d.getHours();
        min = d.getMinutes().toString().padStart(2, '0');
      }
    }

    // 2. If rawDate was not valid, parse from timeStr (e.g. "14:20", "2:20 PM", "09:05 AM", "2:20pm", "14.20")
    if (h === null || min === null) {
      if (!timeStr) return '';
      const m = timeStr.match(/(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
      if (m) {
        let parsedH = parseInt(m[1], 10);
        min = m[2];
        const ampmMarker = m[3]?.toLowerCase();
        if (ampmMarker) {
          if (ampmMarker.startsWith('p') && parsedH < 12) parsedH += 12;
          if (ampmMarker.startsWith('a') && parsedH === 12) parsedH = 0;
        }
        h = parsedH;
      } else {
        return timeStr;
      }
    }

    // 3. Format according to selected preference
    if (fmt === '24h') {
      return `${h.toString().padStart(2, '0')}:${min}`;
    }

    // fmt === '12h' (default)
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  };

  // Inline Translate Action
  const handleToggleTranslate = (messageId: string, originalText: string) => {
    if (translatedMessages[messageId]) {
      const updated = { ...translatedMessages };
      delete updated[messageId];
      setTranslatedMessages(updated);
    } else {
      // Mock instant English translation
      setTranslatedMessages({
        ...translatedMessages,
        [messageId]: `[EN Translation]: ${originalText}`,
      });
    }
  };

  const isCompact = Boolean(chatConfig.compactSpacing ?? globalCompactMode);
  const fontSizeClass = getFontSizeClass(chatConfig.fontSize || globalFontSize);

  return (
    <main className="flex-1 h-full flex flex-col bg-teleforge-bg dark:bg-teleforge-bg relative overflow-hidden">
      {/* =========================================================================
          CHAT HEADER
         ========================================================================= */}
      <header className="h-14 px-4 bg-white dark:bg-teleforge-surface border-b border-gray-200 dark:border-gray-800 flex items-center justify-between z-10 select-none shadow-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={onToggleInfoDrawer}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBackToSidebar();
            }}
            className="md:hidden p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="relative">
            <Avatar
              src={chat.avatar}
              previewSrc={chat.thumbUrl}
              name={chat.name}
              color={chat.avatarColor}
              size="sm"
              className="w-10 h-10"
            />
            {chat.online && chat.type === 'direct' && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#17212b] rounded-full" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{chat.name}</h1>
              {chat.verified && (
                <ShieldCheck
                  size={14}
                  style={{ color: chatConfig.chatAccent || 'var(--tf-primary)' }}
                  className="shrink-0"
                />
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {chat.type === 'channel'
                ? typeof chat.memberCount === 'number'
                  ? `${chat.memberCount.toLocaleString()} ${chat.memberCount === 1 ? 'subscriber' : 'subscribers'}`
                  : 'channel'
                : chat.type === 'group'
                ? typeof chat.memberCount === 'number'
                  ? `${chat.memberCount.toLocaleString()} ${chat.memberCount === 1 ? 'member' : 'members'}`
                  : 'group'
                : chat.type === 'bot'
                ? 'bot'
                : chat.online
                ? 'online'
                : chat.lastSeen || 'last seen recently'}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
          {/* In-Chat Search Button */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`p-2 rounded-full transition-colors ${
              isSearchOpen ? 'bg-teleforge-primary/10 text-teleforge-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title="Search in Chat"
          >
            <Search size={18} />
          </button>

          <button
            onClick={() => showToast(`Calling ${chat.name}... (Simulated)`, 'info')}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Call"
          >
            <Phone size={18} />
          </button>

          <button
            onClick={onToggleInfoDrawer}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Details"
          >
            <Info size={18} />
          </button>

          {/* Three Dots ⋮ Menu */}
          <div className="relative">
            <button
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="More options"
            >
              <MoreVertical size={18} />
            </button>

            {isHeaderMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsHeaderMenuOpen(false)} />
                <div className="absolute right-0 top-11 w-64 bg-white dark:bg-[#1a2330] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      setIsCustomizationOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors font-medium"
                  >
                    <Palette size={16} className="text-teleforge-primary dark:text-rose-400" />
                    <span>TeleForge Customization</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      setIsSearchOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors font-medium"
                  >
                    <Search size={16} className="text-gray-400" />
                    <span>Search in Chat</span>
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800/60" />

                  <button
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      if (window.confirm(`Clear chat history for "${chat.name}"?`)) {
                        showToast('Chat history cleared locally', 'info');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium"
                  >
                    <Trash2 size={16} />
                    <span>Clear Chat History</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          IN-CHAT SEARCH TOOLBAR WITH CATEGORY FILTER PILLS (PHASE 7)
         ========================================================================= */}
      {isSearchOpen && (
        <div className="px-4 py-2 bg-white/95 dark:bg-[#161d28]/95 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-xs z-10 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 relative flex items-center">
              <Search size={15} className="absolute left-3 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages, links, media in this chat..."
                autoFocus
                className="w-full pl-9 pr-8 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800/90 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden focus:ring-1 focus:ring-teleforge-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchCategory('all');
              }}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* Media Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'photo', label: 'Photos' },
              { id: 'video', label: 'Videos' },
              { id: 'file', label: 'Files' },
              { id: 'audio', label: 'Voice / Audio' },
              { id: 'link', label: 'Links' },
            ].map((cat) => {
              const isActive = searchCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSearchCategory(cat.id as any)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-teleforge-primary text-white shadow-2xs'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          MESSAGES SCROLL AREA
         ========================================================================= */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 telegram-chat-pattern ${
          isCompact ? 'space-y-1' : 'space-y-3'
        }`}
      >
        {/* Older Messages Loading / Top of History Indicator */}
        <div className="flex items-center justify-center py-2 min-h-[36px]">
          {isLoadingOlderMessages ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10 text-xs text-gray-500 dark:text-gray-300 font-medium animate-pulse shadow-2xs">
              <Loader2 size={15} className="animate-spin text-teleforge-primary" />
              <span>Loading older messages...</span>
            </div>
          ) : hasMoreOlderMessages === false ? (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 font-medium select-none bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full">
              Beginning of chat history
            </div>
          ) : (
            <button
              onClick={triggerLoadOlder}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs text-teleforge-primary dark:text-rose-400 font-medium transition-colors cursor-pointer border border-black/10 dark:border-white/10 shadow-2xs"
            >
              <ChevronUp size={14} />
              <span>Load older messages</span>
            </button>
          )}
        </div>

        {displayedMessages.map((message, index) => {
          const isOut = message.isOutgoing;
          const isHovered = hoveredMessageId === message.id;
          const isGroupChat = chat.type === 'group';

          // Group consecutive messages by sender
          const prevMsg = displayedMessages[index - 1];
          const nextMsg = displayedMessages[index + 1];

          const isFirstInGroup =
            !prevMsg ||
            prevMsg.isOutgoing !== isOut ||
            prevMsg.senderId !== message.senderId;

          const isLastInGroup =
            !nextMsg ||
            nextMsg.isOutgoing !== isOut ||
            nextMsg.senderId !== message.senderId;

          const senderDisplayName = message.senderName || (isOut ? 'You' : chat.name);
          const avatarSrc =
            message.senderAvatar ||
            (message.senderId && message.senderId !== 'peer'
              ? resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(message.senderId)}`)
              : undefined);
          const senderColor = getAvatarColor(senderDisplayName || message.senderId || 'Telegram');

          // Per-chat bubble overrides
          const bubbleBg = isOut
            ? chatConfig.bubbleOutColor || 'var(--tf-bubble-out)'
            : chatConfig.bubbleInColor || 'var(--tf-bubble-in)';
          const bubbleColor = isOut
            ? chatConfig.bubbleOutTextColor || 'var(--tf-bubble-out-text)'
            : chatConfig.bubbleInTextColor || 'var(--tf-bubble-in-text)';

          const cornerClass = getCornerRadiusClass(chatConfig.cornerRounding, isOut);

          return (
            <div
              key={message.id}
              onMouseEnter={() => setHoveredMessageId(message.id)}
              onMouseLeave={() => {
                setHoveredMessageId(null);
                if (activeReactionPickerId === message.id) setActiveReactionPickerId(null);
              }}
              className={`flex items-end gap-2 relative ${isOut ? 'justify-end' : 'justify-start'}`}
            >
              {/* Incoming Avatar (Left side of incoming message) - Only in Group Chats */}
              {isGroupChat && !isOut && (
                <div className="shrink-0 mb-0.5 w-8 h-8">
                  {isLastInGroup ? (
                    <Avatar
                      src={avatarSrc}
                      previewSrc={message.senderThumbUrl}
                      name={senderDisplayName}
                      color={senderColor}
                      size="sm"
                      className="w-8 h-8 text-[11px] shadow-xs cursor-pointer hover:opacity-90 transition-opacity"
                    />
                  ) : (
                    <div className="w-8" />
                  )}
                </div>
              )}

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] md:max-w-[70%] ${
                  isCompact ? 'py-1.5 px-2.5' : 'p-3'
                } shadow-xs relative transition-all group ${cornerClass} border`}
                style={{
                  backgroundColor: bubbleBg,
                  color: bubbleColor,
                  borderColor: 'var(--tf-border)',
                }}
              >
                {/* Sender Name in Groups (Only on first message of cluster) */}
                {isGroupChat && !isOut && isFirstInGroup && (
                  <div
                    style={{ color: chatConfig.chatAccent || senderColor }}
                    className="text-xs font-semibold mb-1 cursor-pointer hover:underline"
                  >
                    {senderDisplayName}
                  </div>
                )}

                {/* Replying Quote Banner */}
                {message.replyTo && (
                  <div
                    className="mb-2 pl-2.5 py-1 border-l-2 text-xs rounded-r-md cursor-pointer bg-black/5 dark:bg-white/10"
                    style={{ borderColor: chatConfig.chatAccent || 'var(--tf-reply-accent)' }}
                  >
                    <div
                      className="font-semibold text-[11px]"
                      style={{ color: chatConfig.chatAccent || 'var(--tf-primary)' }}
                    >
                      {message.replyTo.senderName}
                    </div>
                    <div className="truncate opacity-80 text-[11px]">{message.replyTo.text}</div>
                  </div>
                )}

                {/* Attachment: Image */}
                {message.attachment?.type === 'image' && (
                  <div
                    onClick={() => onOpenMediaModal(message.attachment!)}
                    className="mb-2 cursor-pointer rounded-xl overflow-hidden shadow-xs hover:opacity-95 transition-opacity"
                  >
                    <img
                      src={message.attachment.url}
                      alt={message.attachment.name || 'Photo'}
                      className="max-h-72 w-full object-cover"
                    />
                  </div>
                )}

                {/* Attachment: Voice Audio */}
                {message.attachment?.type === 'audio' && (
                  <div className="mb-1">
                    <AudioPlayer duration={message.attachment.duration} isOutgoing={isOut} />
                  </div>
                )}

                {/* Attachment: File */}
                {message.attachment?.type === 'file' && (
                  <div
                    className={`flex items-center gap-3 p-2.5 mb-2 rounded-xl border ${
                      isOut ? 'bg-white/20 border-white/20' : 'bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div
                      className="p-2 rounded-lg text-white"
                      style={{ backgroundColor: chatConfig.chatAccent || 'var(--tf-primary)' }}
                    >
                      <FileText size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{message.attachment.name}</div>
                      <div className="text-[10px] opacity-70">{message.attachment.size}</div>
                    </div>
                  </div>
                )}

                {/* Message Text */}
                <div className={`whitespace-pre-wrap break-words leading-relaxed ${fontSizeClass}`}>
                  {message.text}
                </div>

                {/* Inline Translation Display */}
                {translatedMessages[message.id] && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/10 text-xs italic opacity-90">
                    {translatedMessages[message.id]}
                  </div>
                )}

                {/* Footer: Timestamp & Checkmarks */}
                <div className="flex items-center justify-end gap-1 mt-1 text-[11px] opacity-70 select-none">
                  <span>{formatTime(message.timestamp, message.rawDate)}</span>
                  {isOut && (
                    <span>
                      {message.status === 'read' ? (
                        <CheckCheck
                          size={14}
                          style={{ color: chatConfig.chatAccent || 'var(--tf-primary)' }}
                        />
                      ) : (
                        <Check size={14} />
                      )}
                    </span>
                  )}
                </div>

                {/* =====================================================================
                    REACTIONS PILL DISPLAY (CLICK TO OPEN REACTION DETAILS)
                   ===================================================================== */}
                {message.reactions && message.reactions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {message.reactions.map((r, idx) => (
                      <button
                        key={idx}
                        onClick={() =>
                          setReactionDetailsData({
                            messageId: message.id,
                            reactions: message.reactions || [],
                            text: message.text,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shadow-2xs border transition-transform hover:scale-105 cursor-pointer ${
                          r.userReacted
                            ? 'bg-teleforge-primary/20 border-teleforge-primary/50 text-teleforge-primary dark:text-rose-300'
                            : 'bg-black/5 dark:bg-white/10 border-black/10 dark:border-white/10'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span className="text-[11px] font-bold">{r.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* =====================================================================
                  FLOATING ACTION BAR ON HOVER (PHASE 2 & PHASE 3)
                 ===================================================================== */}
              {isHovered && (
                <div
                  className={`absolute top-0 transform -translate-y-1/2 flex items-center gap-1 bg-white dark:bg-[#1a2430] border border-gray-200 dark:border-gray-700 rounded-full py-1 px-2 shadow-xl z-20 animate-in fade-in zoom-in-95 duration-100 ${
                    isOut ? 'right-2' : 'left-10'
                  }`}
                >
                  {/* Quick Reactions Bar */}
                  <div className="flex items-center gap-0.5">
                    {quickReactions.slice(0, 5).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onToggleReaction(chat.id, message.id, emoji)}
                        className="hover:scale-125 transition-transform px-1 text-sm cursor-pointer"
                        title={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <div className="w-[1px] h-3 bg-gray-200 dark:bg-gray-700 mx-1" />

                  {/* Reply Action */}
                  <button
                    onClick={() => setReplyingTo(message)}
                    className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                    title="Reply"
                  >
                    <CornerUpLeft size={14} />
                  </button>

                  {/* Copy Action */}
                  <button
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(message.text);
                        showToast('Message copied to clipboard', 'success');
                      }
                    }}
                    className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                    title="Copy Text"
                  >
                    <Copy size={13} />
                  </button>

                  {/* Edit Action (if own outgoing text message) */}
                  {isOut && (
                    <button
                      onClick={() => {
                        setEditingMessage(message);
                        setInputText(message.text);
                      }}
                      className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                      title="Edit Message"
                    >
                      <Edit2 size={13} />
                    </button>
                  )}

                  {/* Save to Saved Messages */}
                  {onSaveToSavedMessages && (
                    <button
                      onClick={() => onSaveToSavedMessages(message)}
                      className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                      title="Save to Saved Messages"
                    >
                      <Bookmark size={13} />
                    </button>
                  )}

                  {/* Inline Translate Action */}
                  <button
                    onClick={() => handleToggleTranslate(message.id, message.text)}
                    className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                    title="Translate Message"
                  >
                    <Languages size={13} />
                  </button>

                  {/* Pin Action */}
                  {onPinMessage && (
                    <button
                      onClick={() => onPinMessage(chat.id, message.id)}
                      className="p-1 text-gray-500 hover:text-teleforge-primary transition-colors cursor-pointer"
                      title="Pin Message"
                    >
                      <Pin size={13} />
                    </button>
                  )}

                  {/* Delete Action */}
                  {onDeleteMessage && (
                    <button
                      onClick={() => {
                        if (window.confirm('Delete this message?')) {
                          onDeleteMessage(chat.id, message.id);
                        }
                      }}
                      className="p-1 text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Bot Typing Indicator */}
        {isBotTyping && (
          <div className="flex items-center gap-2 text-xs text-teleforge-primary font-medium pl-2">
            <Bot size={16} className="animate-pulse" />
            <span>Bot is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* =========================================================================
          REPLY / EDIT BANNER
         ========================================================================= */}
      {(replyingTo || editingMessage) && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-[#141b24] border-t border-gray-200 dark:border-gray-800 flex items-center justify-between z-10 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center gap-3 min-w-0">
            {replyingTo ? (
              <CornerUpLeft size={16} className="text-teleforge-primary shrink-0" />
            ) : (
              <Edit2 size={16} className="text-teleforge-primary shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-teleforge-primary">
                {replyingTo ? `Replying to ${replyingTo.senderName}` : 'Editing Message'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {replyingTo ? replyingTo.text : editingMessage?.text}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setReplyingTo(null);
              setEditingMessage(null);
              if (editingMessage) setInputText('');
            }}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          INPUT TOOLBAR OR PREVIEW/JOIN BAR
         ========================================================================= */}
      {chat.isJoined === false && (chat.type === 'channel' || chat.type === 'group') ? (
        <footer className="p-3 bg-white dark:bg-teleforge-surface border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-6 z-10 shrink-0">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Previewing {chat.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {chat.type === 'channel'
                ? 'Join this public channel to receive new posts and updates'
                : 'Join this public group to participate in discussions'}
            </span>
          </div>
          <button
            onClick={handleJoinChat}
            disabled={isJoining}
            className="px-6 py-2.5 rounded-xl bg-teleforge-primary text-teleforge-cream font-semibold text-sm hover:brightness-110 shadow-md shadow-red-950/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isJoining ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            <span>{chat.type === 'channel' ? 'Join Channel' : 'Join Group'}</span>
          </button>
        </footer>
      ) : (
        <footer className="p-2 md:p-3 bg-white dark:bg-teleforge-surface border-t border-gray-200 dark:border-gray-800 flex items-end gap-2 relative z-10 shrink-0">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,audio/*,.pdf,.doc,.docx,.txt,.json"
        />

        {/* Attachment menu popover */}
        {showAttachMenu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowAttachMenu(false)} />
            <div className="absolute bottom-16 left-3 bg-white dark:bg-[#1f2d3d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-2 z-30 flex flex-col gap-1 w-48 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <ImageIcon size={16} />
                </div>
                <span>Photo or Video</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <span>File Document</span>
              </button>
            </div>
          </>
        )}

        {/* Emoji picker popover */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-16 left-12 bg-white dark:bg-[#1f2d3d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-3 z-30 w-72 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Emojis & Reactions</div>
              <div className="grid grid-cols-6 gap-2 text-xl">
                {[
                  '😀', '😂', '🔥', '❤️', '👍', '👏', '🎉', '⚡', '🚀', '✨', '😍', '🤔',
                  '🙌', '💯', '👌', '😎', '🥳', '💡', '💎', '🌟', '💪', '🎯', '👑', '🌈',
                ].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setInputText((prev) => prev + emoji);
                    }}
                    className="hover:scale-125 transition-transform p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-center"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Attachment Button */}
        <button
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors cursor-pointer"
          title="Attach"
        >
          <Paperclip size={20} />
        </button>

        {/* Voice recording bar or Text Input */}
        {isRecordingVoice ? (
          <div className="flex-1 flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-950/40 rounded-2xl border border-red-200 dark:border-red-900/60">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-semibold">
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              <span>Recording... 0:{recordingSeconds.toString().padStart(2, '0')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsRecordingVoice(false)}
                className="text-xs text-gray-500 hover:text-red-500 px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSendVoiceNote}
                className="px-3 py-1 rounded-xl bg-teleforge-primary text-teleforge-cream text-xs font-medium hover:bg-teleforge-hover"
              >
                Send Voice
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative flex items-center bg-gray-100 dark:bg-gray-800/90 rounded-2xl px-3 py-1">
            <textarea
              rows={1}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                editingMessage
                  ? 'Edit your message...'
                  : chat.type === 'channel'
                  ? 'Broadcast a message...'
                  : 'Write a message...'
              }
              className="w-full max-h-32 py-1.5 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-hidden resize-none"
            />
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-1 cursor-pointer"
              title="Emoji"
            >
              <Smile size={20} />
            </button>
          </div>
        )}

        {/* Send or Voice Record Button */}
        {!isRecordingVoice && (
          <button
            onClick={inputText.trim() ? handleSend : () => setIsRecordingVoice(true)}
            className="p-2.5 rounded-full bg-teleforge-primary text-teleforge-cream hover:bg-teleforge-hover active:bg-teleforge-active shadow-md shadow-red-950/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title={inputText.trim() ? (editingMessage ? 'Save edit' : 'Send message') : 'Record voice message'}
          >
            {inputText.trim() ? <Send size={18} className="translate-x-0.5" /> : <Mic size={18} />}
          </button>
        )}
      </footer>
      )}

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="absolute bottom-20 right-6 p-2.5 rounded-full bg-white dark:bg-[#1a2430] border border-gray-200 dark:border-gray-700 shadow-xl hover:shadow-2xl text-gray-600 dark:text-gray-300 hover:text-teleforge-primary dark:hover:text-teleforge-cream transition-all hover:scale-110 z-20 cursor-pointer animate-in fade-in zoom-in-95 duration-150"
          title="Scroll to bottom"
        >
          <ChevronDown size={20} />
        </button>
      )}

      {/* =========================================================================
          MODALS
         ========================================================================= */}
      {/* Per-Chat Customization Modal */}
      <ChatCustomizationModal
        isOpen={isCustomizationOpen}
        onClose={() => setIsCustomizationOpen(false)}
        chat={chat}
        onSaved={(newCfg) => setChatConfig(newCfg)}
      />

      {/* Reaction Details Modal */}
      {reactionDetailsData && (
        <ReactionDetailsModal
          isOpen={Boolean(reactionDetailsData)}
          onClose={() => setReactionDetailsData(null)}
          reactions={reactionDetailsData.reactions}
          messageText={reactionDetailsData.text}
          onSelectReaction={(emoji) => onToggleReaction(chat.id, reactionDetailsData.messageId, emoji)}
        />
      )}
    </main>
  );
};
