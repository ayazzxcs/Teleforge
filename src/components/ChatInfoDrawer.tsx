import React, { useState } from 'react';
import { X, Bell, BellOff, Link2, Image, FileText, Music, UserCheck, ShieldCheck, Share2, Copy, Check } from 'lucide-react';
import { Chat } from '../types';
import { Avatar } from './Avatar';

interface ChatInfoDrawerProps {
  chat: Chat | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleMute: (chatId: string) => void;
}

export const ChatInfoDrawer: React.FC<ChatInfoDrawerProps> = ({ chat, isOpen, onClose, onToggleMute }) => {
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'files' | 'links' | 'audio'>('media');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !chat) return null;

  const handleCopyLink = () => {
    const link = `https://t.me/${chat.username ? chat.username.replace('@', '') : chat.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Collect media attachments from chat messages
  const mediaItems = chat.messages.filter((m) => m.attachment?.type === 'image');
  const fileItems = chat.messages.filter((m) => m.attachment?.type === 'file');
  const audioItems = chat.messages.filter((m) => m.attachment?.type === 'audio');

  return (
    <div className="w-80 md:w-96 h-full bg-white dark:bg-teleforge-surface border-l border-gray-200 dark:border-gray-800 flex flex-col z-20 shadow-lg animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-medium text-sm text-gray-800 dark:text-gray-150">
          {chat.type === 'channel' ? 'Channel Info' : chat.type === 'group' ? 'Group Info' : 'User Info'}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile Card */}
        <div className="flex flex-col items-center p-6 border-b border-gray-100 dark:border-gray-800 text-center">
          <div className="relative mb-3">
            <Avatar
              src={chat.avatar}
              previewSrc={chat.thumbUrl}
              name={chat.name}
              color={chat.avatarColor}
              size="xl"
              className="w-24 h-24 border-2 border-white dark:border-[#17212b]"
            />
            {chat.verified && (
              <div className="absolute bottom-0 right-0 bg-teleforge-primary text-teleforge-cream p-1 rounded-full ring-2 ring-white dark:ring-[#17212b]">
                <ShieldCheck size={14} />
              </div>
            )}
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1">
            {chat.name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {chat.type === 'channel'
              ? typeof chat.memberCount === 'number'
                ? `${chat.memberCount.toLocaleString()} ${chat.memberCount === 1 ? 'subscriber' : 'subscribers'}`
                : 'channel'
              : chat.type === 'group'
              ? typeof chat.memberCount === 'number'
                ? `${chat.memberCount.toLocaleString()} ${chat.memberCount === 1 ? 'member' : 'members'}`
                : 'group'
              : chat.online
              ? 'online'
              : chat.lastSeen || 'last seen recently'}
          </p>
        </div>

        {/* Details & Actions */}
        <div className="p-4 space-y-4 border-b border-gray-100 dark:border-gray-800">
          {chat.description && (
            <div>
              <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase">About</div>
              <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-wrap">{chat.description}</p>
            </div>
          )}

          {chat.username && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Username</div>
                <div className="text-sm text-teleforge-primary dark:text-rose-300 hover:underline cursor-pointer font-medium">{chat.username}</div>
              </div>
              <button
                onClick={handleCopyLink}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                title="Copy link"
              >
                {copiedLink ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
              </button>
            </div>
          )}

          {chat.phone && (
            <div>
              <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Phone</div>
              <div className="text-sm text-gray-800 dark:text-gray-200">{chat.phone}</div>
            </div>
          )}

          {/* Notifications Toggle */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2.5">
              {chat.isMuted ? <BellOff size={18} className="text-gray-400" /> : <Bell size={18} className="text-teleforge-primary" />}
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Notifications</span>
            </div>
            <button
              onClick={() => onToggleMute(chat.id)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                !chat.isMuted ? 'bg-teleforge-primary' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                  !chat.isMuted ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Media / Files / Audio tabs */}
        <div className="p-4">
          <div className="flex border-b border-gray-100 dark:border-gray-800 mb-3">
            <button
              onClick={() => setActiveMediaTab('media')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors ${
                activeMediaTab === 'media'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Photos ({mediaItems.length})
            </button>
            <button
              onClick={() => setActiveMediaTab('files')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors ${
                activeMediaTab === 'files'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Files ({fileItems.length})
            </button>
            <button
              onClick={() => setActiveMediaTab('audio')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors ${
                activeMediaTab === 'audio'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Audio ({audioItems.length})
            </button>
          </div>

          {activeMediaTab === 'media' && (
            <div>
              {mediaItems.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaItems.map((m, idx) => (
                    <a
                      key={idx}
                      href={m.attachment?.url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 hover:opacity-90 transition-opacity"
                    >
                      <img src={m.attachment?.url} alt="Shared" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <Image size={24} className="opacity-40" />
                  <span>No shared photos yet</span>
                </div>
              )}
            </div>
          )}

          {activeMediaTab === 'files' && (
            <div>
              {fileItems.length > 0 ? (
                <div className="space-y-2">
                  {fileItems.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <FileText size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {f.attachment?.name || 'Document'}
                        </div>
                        <div className="text-[10px] text-gray-400">{f.attachment?.size || '42 KB'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <FileText size={24} className="opacity-40" />
                  <span>No shared files</span>
                </div>
              )}
            </div>
          )}

          {activeMediaTab === 'audio' && (
            <div>
              {audioItems.length > 0 ? (
                <div className="space-y-2">
                  {audioItems.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                        <Music size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {a.attachment?.name || 'Audio message'}
                        </div>
                        <div className="text-[10px] text-gray-400">{a.attachment?.duration || '0:18'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <Music size={24} className="opacity-40" />
                  <span>No voice or audio messages</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
