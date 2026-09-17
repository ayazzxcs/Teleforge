import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  Copy,
  Check,
  Phone,
  ShieldCheck,
  Bot,
  User as UserIcon,
  Image as ImageIcon,
  Share2,
  Sparkles,
} from 'lucide-react';
import { Avatar } from './Avatar';
import { showToast } from './Toast';
import { telegramApi } from '../services/telegramApi';

export interface UserProfileDetails {
  id: string;
  name: string;
  username?: string;
  phone?: string;
  bio?: string;
  avatar?: string;
  thumbUrl?: string;
  online?: boolean;
  lastSeen?: string;
  verified?: boolean;
  isBot?: boolean;
}

interface UserProfileModalProps {
  user: UserProfileDetails | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDirectChat?: (userId: string, userName: string, userAvatar?: string, userThumbUrl?: string) => void;
  onOpenMediaModal?: (attachment: { type: 'image'; url: string; thumbUrl?: string; name: string }) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onOpenDirectChat,
  onOpenMediaModal,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fetchedBio, setFetchedBio] = useState<string>('');
  const [fetchedPhone, setFetchedPhone] = useState<string>('');
  const [fetchedUsername, setFetchedUsername] = useState<string>('');
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  // Fetch full user details from Telegram MTProto if available
  useEffect(() => {
    if (!isOpen || !user || !user.id) return;
    setFetchedBio(user.bio || '');
    setFetchedPhone(user.phone || '');
    setFetchedUsername(user.username || '');

    let isCurrent = true;
    setIsLoadingFull(true);

    telegramApi
      .getUserFull?.(user.id)
      .then((full) => {
        if (!isCurrent || !full) return;
        if (full.bio) setFetchedBio(full.bio);
        if (full.phone) setFetchedPhone(full.phone);
        if (full.username) setFetchedUsername(full.username);
      })
      .catch(() => {})
      .finally(() => {
        if (isCurrent) setIsLoadingFull(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const displayBio = fetchedBio || user.bio;
  const displayPhone = fetchedPhone || user.phone;
  const displayUsername = fetchedUsername || user.username;

  const copyToClipboard = (text: string, field: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      showToast(`${field} copied to clipboard`, 'success');
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const handleAvatarClick = () => {
    const photoUrl = user.avatar || user.thumbUrl;
    if (photoUrl && onOpenMediaModal) {
      onOpenMediaModal({
        type: 'image',
        url: photoUrl,
        thumbUrl: user.thumbUrl,
        name: `${user.name}'s Profile Photo`,
      });
    }
  };

  const handleSendMessage = () => {
    onClose();
    if (onOpenDirectChat) {
      onOpenDirectChat(user.id, user.name, user.avatar, user.thumbUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm bg-white dark:bg-[#17212b] rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            User Profile
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Hero Section */}
        <div className="flex flex-col items-center px-6 pt-2 pb-5 text-center border-b border-gray-100 dark:border-gray-800/80">
          <div
            className="relative mb-3 cursor-pointer group transition-transform active:scale-95"
            onClick={handleAvatarClick}
            title="Click to view full photo"
          >
            <Avatar
              src={user.avatar}
              previewSrc={user.thumbUrl}
              name={user.name}
              size="xl"
              className="w-24 h-24 shadow-lg ring-4 ring-[#8B1E22]/10 dark:ring-white/10 group-hover:opacity-95"
              peerId={user.id}
            />
            {user.online && (
              <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-[#17212b] rounded-full" />
            )}
            <div className="absolute inset-0 rounded-full bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <ImageIcon size={20} />
            </div>
          </div>

          <div className="flex items-center gap-1.5 justify-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[240px]">
              {user.name}
            </h2>
            {user.verified && (
              <ShieldCheck size={16} className="text-teleforge-primary dark:text-rose-400 shrink-0" />
            )}
            {user.isBot && (
              <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-500 text-[10px] font-bold">
                BOT
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {user.online ? (
              <span className="text-emerald-500 font-medium">online</span>
            ) : (
              user.lastSeen || 'last seen recently'
            )}
          </p>
        </div>

        {/* Details List */}
        <div className="p-5 space-y-3.5 flex-1 overflow-y-auto max-h-[50vh] custom-scrollbar">
          {/* Bio / About */}
          {displayBio ? (
            <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Bio
              </div>
              <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                {displayBio}
              </p>
            </div>
          ) : null}

          {/* Username */}
          {displayUsername && (
            <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Username
                </div>
                <div className="text-xs font-semibold text-teleforge-primary dark:text-rose-400 mt-0.5">
                  @{displayUsername.replace('@', '')}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(`@${displayUsername.replace('@', '')}`, 'Username')}
                className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title="Copy username"
              >
                {copiedField === 'Username' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          )}

          {/* Phone Number */}
          {displayPhone && (
            <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Phone
                </div>
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                  {displayPhone}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(displayPhone, 'Phone number')}
                className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                title="Copy phone"
              >
                {copiedField === 'Phone number' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          )}

          {/* Telegram User ID */}
          <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/60 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                User ID
              </div>
              <div className="text-xs font-mono text-gray-600 dark:text-gray-300 mt-0.5">
                {user.id}
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(user.id, 'User ID')}
              className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title="Copy User ID"
            >
              {copiedField === 'User ID' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 pt-2 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-[#121921]/50 grid grid-cols-2 gap-2">
          {displayUsername && (
            <button
              onClick={() => copyToClipboard(`https://t.me/${displayUsername.replace('@', '')}`, 'Profile link')}
              className="py-2.5 px-3 rounded-2xl bg-gray-200/80 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 size={15} />
              <span>Share Link</span>
            </button>
          )}

          <button
            onClick={handleSendMessage}
            className={`py-2.5 px-3 rounded-2xl bg-teleforge-primary hover:bg-[#74181B] text-[#FFF8EE] text-xs font-bold shadow-md shadow-red-950/20 flex items-center justify-center gap-1.5 transition-all ${
              !displayUsername ? 'col-span-2' : ''
            }`}
          >
            <MessageSquare size={15} />
            <span>Send Message</span>
          </button>
        </div>
      </div>
    </div>
  );
};
