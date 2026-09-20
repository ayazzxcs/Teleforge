import React, { useState } from 'react';
import { X, Users, Megaphone, Loader2, Hash } from 'lucide-react';

interface JoinPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: () => void;
  onOpenChat?: () => void;
  title: string;
  about?: string;
  participantsCount?: number;
  photo?: string;
  isChannel?: boolean;
  isGroup?: boolean;
  alreadyJoined?: boolean;
  isJoining?: boolean;
}

export const JoinPreviewModal: React.FC<JoinPreviewModalProps> = ({
  isOpen,
  onClose,
  onJoin,
  onOpenChat,
  title,
  about,
  participantsCount,
  photo,
  isChannel,
  isGroup,
  alreadyJoined,
  isJoining,
}) => {
  if (!isOpen) return null;

  const formatCount = (count: number) => {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  // Generate avatar color from title
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[340px] max-w-[90vw] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div className="relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
          >
            <X size={16} />
          </button>

          {/* Photo / Avatar area */}
          <div className="flex flex-col items-center pt-8 pb-4 bg-gradient-to-b from-teleforge-primary/20 to-transparent dark:from-teleforge-primary/10">
            {photo ? (
              <img
                src={photo}
                alt={title}
                className="w-20 h-20 rounded-full object-cover border-3 border-white dark:border-gray-700 shadow-lg"
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg ${getAvatarColor(title)}`}
              >
                {title.charAt(0).toUpperCase()}
              </div>
            )}

            <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white text-center px-4 leading-tight">
              {title}
            </h2>

            {/* Type badge + member count */}
            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {isChannel ? (
                <span className="flex items-center gap-1">
                  <Megaphone size={12} />
                  Channel
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  Group
                </span>
              )}
              {participantsCount ? (
                <>
                  <span>•</span>
                  <span>{formatCount(participantsCount)} {isChannel ? 'subscribers' : 'members'}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* About / Description */}
        {about && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
              {about}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-5 pb-5 pt-3 flex flex-col gap-2">
          {alreadyJoined ? (
            <>
              <button
                onClick={() => {
                  if (onOpenChat) onOpenChat();
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-teleforge-primary text-white font-semibold text-sm hover:bg-teleforge-primary/90 active:scale-[0.98] transition-all"
              >
                Open Chat
              </button>
              <p className="text-xs text-center text-gray-400 dark:text-gray-500">
                You are already a member
              </p>
            </>
          ) : (
            <>
              <button
                onClick={onJoin}
                disabled={isJoining}
                className="w-full py-2.5 rounded-xl bg-teleforge-primary text-white font-semibold text-sm hover:bg-teleforge-primary/90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isJoining ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>Join {isChannel ? 'Channel' : 'Group'}</>
                )}
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl text-gray-500 dark:text-gray-400 font-medium text-sm hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
