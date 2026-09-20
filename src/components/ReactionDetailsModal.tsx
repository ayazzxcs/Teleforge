import React, { useState, useEffect } from 'react';
import { X, User, Loader2, MessageCircle, Smile, Check } from 'lucide-react';
import { Reaction, Chat } from '../types';
import { telegramApi } from '../services/telegramApi';
import { Avatar } from './Avatar';

export interface ReactionReactor {
  peerId: string | null;
  user: {
    id: string;
    name: string;
    username?: string;
    avatar?: string;
    thumbUrl?: string;
    isSelf?: boolean;
  };
  emoji: string;
  date: number;
  isSelf: boolean;
}

interface ReactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  messageText?: string;
  chatId?: string;
  messageId?: string;
  chat?: Chat | null;
  onSelectReaction?: (emoji: string) => void;
  onOpenDirectChat?: (userId: string, userName: string, userAvatar?: string, userThumbUrl?: string) => void;
}

const COMMON_REACTIONS = [
  '👍', '❤️', '🔥', '👏', '🎉', '🤩', '😱', '💩', '🙏', '👌', '🥰', '😁', '🤔', '🤯', '💯', '🤣',
];

export const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({
  isOpen,
  onClose,
  reactions,
  messageText,
  chatId,
  messageId,
  chat,
  onSelectReaction,
  onOpenDirectChat,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [reactors, setReactors] = useState<ReactionReactor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Universal Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load reactors list from MTProto API
  useEffect(() => {
    if (!isOpen || !chatId || !messageId) {
      setReactors([]);
      return;
    }

    let active = true;
    setIsLoading(true);

    // Initial fallback for 1-on-1 direct chats if API has no reactors
    const initialList: ReactionReactor[] = [];
    if (chat && chat.type === 'direct' && reactions.length > 0) {
      for (const r of reactions) {
        if (r.userReacted) {
          initialList.push({
            peerId: 'self',
            user: { id: 'self', name: 'You', isSelf: true },
            emoji: r.emoji,
            date: Date.now(),
            isSelf: true,
          });
        }
        if (!r.userReacted || (r.count && r.count > 1)) {
          initialList.push({
            peerId: chat.id,
            user: {
              id: chat.id,
              name: chat.name,
              avatar: chat.avatar,
              thumbUrl: chat.thumbUrl,
              username: chat.username,
            },
            emoji: r.emoji,
            date: Date.now(),
            isSelf: false,
          });
        }
      }
    }
    setReactors(initialList);

    // Call MTProto getMessageReactionsList
    telegramApi
      .getMessageReactionsList(chatId, messageId, 50)
      .then((res) => {
        if (!active) return;
        setIsLoading(false);
        if (res && res.reactions && res.reactions.length > 0) {
          setReactors(res.reactions);
        }
      })
      .catch((err) => {
        if (!active) return;
        setIsLoading(false);
        console.warn('[ReactionDetailsModal] Could not fetch reactions list:', err?.message || err);
      });

    return () => {
      active = false;
    };
  }, [isOpen, chatId, messageId, chat]);

  if (!isOpen || !reactions || reactions.length === 0) return null;

  const totalCount = reactions.reduce((acc, r) => acc + (r.count || 1), 0);

  // Filter reactors by selected tab
  const filteredReactors = selectedFilter === 'all'
    ? reactors
    : reactors.filter((r) => r.emoji === selectedFilter);

  const formatReactorTime = (timestampMs: number) => {
    if (!timestampMs) return '';
    try {
      const d = new Date(timestampMs);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a2330] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-900 dark:text-gray-100 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900 dark:text-white">Reactions</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teleforge-primary/15 text-teleforge-primary">
              {totalCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message preview snippet */}
        {messageText && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 truncate shrink-0">
            &quot;{messageText}&quot;
          </div>
        )}

        {/* Reaction Filter Tabs */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-none shrink-0 bg-gray-50/50 dark:bg-gray-800/20">
          <button
            type="button"
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedFilter === 'all'
                ? 'bg-teleforge-primary text-white shadow-xs'
                : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10'
            }`}
          >
            All {totalCount}
          </button>
          {reactions.map((r, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedFilter(r.emoji)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedFilter === r.emoji
                  ? 'bg-teleforge-primary text-white shadow-xs'
                  : 'bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300 hover:bg-black/10'
              }`}
            >
              <span>{r.emoji}</span>
              <span className="opacity-90">{r.count}</span>
            </button>
          ))}
        </div>

        {/* Reactors List */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-gray-100 dark:divide-gray-800/60 min-h-[160px]">
          {isLoading && reactors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 size={24} className="animate-spin text-teleforge-primary" />
              <span className="text-xs">Loading reactions...</span>
            </div>
          ) : filteredReactors.length > 0 ? (
            filteredReactors.map((reactor, idx) => {
              const u = reactor.user;
              const isSelf = reactor.isSelf || u.isSelf;

              return (
                <div
                  key={`${u.id || idx}_${reactor.emoji}_${idx}`}
                  onClick={() => {
                    if (!isSelf && u.id && onOpenDirectChat) {
                      onOpenDirectChat(u.id, u.name, u.avatar, u.thumbUrl);
                      onClose();
                    }
                  }}
                  className={`py-2 px-2.5 flex items-center justify-between rounded-xl transition-colors ${
                    !isSelf && onOpenDirectChat
                      ? 'hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {isSelf ? (
                        <div className="w-10 h-10 rounded-full bg-teleforge-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">
                          You
                        </div>
                      ) : (
                        <Avatar
                          src={u.avatar}
                          previewSrc={u.thumbUrl}
                          name={u.name}
                          size="md"
                        />
                      )}
                      {/* Reaction pill on avatar */}
                      <span className="absolute -bottom-1 -right-1 text-sm filter drop-shadow-xs scale-110">
                        {reactor.emoji}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                          {isSelf ? 'You' : u.name}
                        </span>
                        {isSelf && (
                          <span className="px-1.5 py-0.2 rounded-md bg-teleforge-primary/15 text-teleforge-primary text-[10px] font-extrabold">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {u.username && <span>@{u.username}</span>}
                        {reactor.date > 0 && <span>{formatReactorTime(reactor.date)}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-2xl hover:scale-125 transition-transform select-none">
                      {reactor.emoji}
                    </span>
                    {!isSelf && onOpenDirectChat && u.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDirectChat(u.id, u.name, u.avatar, u.thumbUrl);
                          onClose();
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-teleforge-primary hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        title={`Open chat with ${u.name}`}
                      >
                        <MessageCircle size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            /* Fallback breakdown when individual identities are hidden in channels */
            <div className="py-4 px-2 space-y-2">
              {reactions
                .filter((r) => selectedFilter === 'all' || r.emoji === selectedFilter)
                .map((r, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      onSelectReaction?.(r.emoji);
                      onClose();
                    }}
                    className="py-2.5 px-3 flex items-center justify-between rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer border border-transparent hover:border-black/5 dark:hover:border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{r.emoji}</span>
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {r.userReacted ? 'You reacted' : `${r.count} ${r.count === 1 ? 'person reacted' : 'people reacted'}`}
                        </div>
                        {r.userReacted ? (
                          <div className="text-[11px] text-teleforge-primary font-medium">Tap to remove your reaction</div>
                        ) : (
                          <div className="text-[11px] text-gray-400">Tap to react with {r.emoji}</div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800">
                      {r.count}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Quick Add Reaction Palette */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 shrink-0">
          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>React with emoji</span>
            <span className="text-[10px] text-teleforge-primary font-normal">Tap to send</span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {COMMON_REACTIONS.map((emoji) => {
              const hasReacted = reactions.some((r) => r.emoji === emoji && r.userReacted);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSelectReaction?.(emoji);
                    onClose();
                  }}
                  className={`p-1.5 rounded-xl text-xl hover:scale-125 active:scale-95 transition-all cursor-pointer relative shrink-0 ${
                    hasReacted
                      ? 'bg-teleforge-primary/20 ring-1 ring-teleforge-primary'
                      : 'hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                  title={`React ${emoji}`}
                >
                  {emoji}
                  {hasReacted && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-teleforge-primary text-white rounded-full flex items-center justify-center text-[8px]">
                      <Check size={9} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Note */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 text-center shrink-0">
          Reactor identities in broadcast channels follow Telegram privacy settings.
        </div>
      </div>
    </div>
  );
};
