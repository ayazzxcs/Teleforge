import React from 'react';
import { X, Heart, ThumbsUp, Flame, Sparkles, User } from 'lucide-react';
import { Reaction } from '../types';

interface ReactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  reactions: Reaction[];
  messageText?: string;
  onSelectReaction?: (emoji: string) => void;
}

export const ReactionDetailsModal: React.FC<ReactionDetailsModalProps> = ({
  isOpen,
  onClose,
  reactions,
  messageText,
  onSelectReaction,
}) => {
  // Universal Escape key listener
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !reactions || reactions.length === 0) return null;

  const totalCount = reactions.reduce((acc, r) => acc + (r.count || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1a2330] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-gray-900 dark:text-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 dark:text-white">Reactions</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teleforge-primary/15 text-teleforge-primary">
              {totalCount}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message preview snippet */}
        {messageText && (
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 truncate">
            &quot;{messageText}&quot;
          </div>
        )}

        {/* Reactions Breakdown List */}
        <div className="p-3 divide-y divide-gray-100 dark:divide-gray-800/60 max-h-72 overflow-y-auto">
          {reactions.map((r, idx) => (
            <div
              key={idx}
              onClick={() => {
                onSelectReaction?.(r.emoji);
                onClose();
              }}
              className="py-2.5 px-2 flex items-center justify-between rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{r.emoji}</span>
                <div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {r.userReacted ? 'You reacted' : `${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}`}
                  </div>
                  {r.userReacted && (
                    <div className="text-[10px] text-teleforge-primary font-medium">Tap to remove your reaction</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800">
                  {r.count}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Telegram privacy note */}
        <div className="p-3 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 text-center">
          Reactor identities in channels & large groups follow Telegram privacy policies.
        </div>
      </div>
    </div>
  );
};
