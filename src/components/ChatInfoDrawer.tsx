import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bell,
  BellOff,
  Image,
  Video,
  FileText,
  Music,
  ShieldCheck,
  Copy,
  Check,
  Download,
  Loader2,
  Play,
} from 'lucide-react';
import { Chat, Attachment, Message } from '../types';
import { Avatar } from './Avatar';
import { telegramApi, isAndroidApp, resolveApiUrl } from '../services/telegramApi';
import { mediaService } from '../services/mediaService';
import { downloadFileToDevice } from '../utils/fileDownloader';
import { showToast } from './Toast';
import { mapTelegramMessage } from '../utils/telegramAdapter';

interface ChatInfoDrawerProps {
  chat: Chat | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleMute: (chatId: string) => void;
  onOpenMediaModal?: (attachment: Attachment) => void;
}

// Subcomponent for individual shared photo with instant 0ms preview and progressive loading
const SharedPhotoItem: React.FC<{
  chatId: string;
  messageId: string | number;
  attachment: any;
  onClick: () => void;
}> = ({ chatId, messageId, attachment, onClick }) => {
  const thumbApiUrl = !isAndroidApp()
    ? resolveApiUrl(`/api/telegram/media?chatId=${encodeURIComponent(chatId)}&messageId=${messageId}&thumb=1`)
    : '';
  const [src, setSrc] = useState<string>(() => {
    return mediaService.get(chatId, messageId) || attachment.url || thumbApiUrl || attachment.thumbUrl || '';
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (src && !isAndroidApp()) return;
    let mounted = true;
    const unsub = mediaService.subscribe(chatId, messageId, (url) => {
      if (url && mounted) {
        setSrc(url);
      }
    });

    if (!src || src === attachment.thumbUrl) {
      mediaService
        .loadMedia(chatId, messageId, { fullRes: false })
        .then((url) => {
          if (url && mounted) {
            setSrc(url);
          }
        })
        .catch(() => {});
    }

    return () => {
      mounted = false;
      unsub();
    };
  }, [chatId, messageId, attachment.thumbUrl, src]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-teleforge-primary transition-all hover:opacity-95"
    >
      {src ? (
        <img
          src={src}
          alt={attachment.name || 'Shared Photo'}
          className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
            loaded ? 'opacity-100' : 'opacity-90'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (attachment.thumbUrl && src !== attachment.thumbUrl) {
              setSrc(attachment.thumbUrl);
            }
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100 dark:bg-gray-800">
          <Image size={22} className="opacity-40" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
    </button>
  );
};

// Subcomponent for individual shared video
const SharedVideoItem: React.FC<{
  chatId: string;
  messageId: string | number;
  attachment: any;
  onClick: () => void;
}> = ({ attachment, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square rounded-lg overflow-hidden bg-black/40 relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-teleforge-primary"
    >
      {attachment.thumbUrl ? (
        <img
          src={attachment.thumbUrl}
          alt={attachment.name || 'Shared Video'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500">
          <Play size={24} className="opacity-40" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center group-hover:scale-110 transition-transform shadow-md border border-white/20">
          <Play size={14} className="fill-white ml-0.5" />
        </div>
      </div>
      {attachment.duration && (
        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-medium text-white shadow-xs">
          {attachment.duration}
        </span>
      )}
    </button>
  );
};

// Subcomponent for individual shared file
const SharedFileItem: React.FC<{
  chatId: string;
  messageId: string | number;
  attachment: any;
}> = ({ chatId, messageId, attachment }) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDownloading(true);
      const url = await mediaService.loadMedia(chatId, messageId, {
        fullRes: true,
        onProgress: (pct) => setProgress(pct),
      });
      if (url) {
        await downloadFileToDevice(
          url,
          attachment.name || 'document',
          attachment.mimeType || 'application/octet-stream'
        );
      } else {
        showToast('Could not download file', 'error');
      }
    } catch {
      showToast('Download failed', 'error');
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <FileText size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
          {attachment.name || 'Document'}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <span>{attachment.size || 'File'}</span>
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 transition-colors shrink-0"
        title="Download file"
      >
        {downloading ? (
          <div className="flex items-center gap-1 text-[11px] font-bold text-teleforge-primary">
            <Loader2 size={16} className="animate-spin" />
            {progress !== null && <span>{progress}%</span>}
          </div>
        ) : (
          <Download size={16} />
        )}
      </button>
    </div>
  );
};

// Subcomponent for individual shared audio
const SharedAudioItem: React.FC<{
  chatId: string;
  messageId: string | number;
  attachment: any;
}> = ({ chatId, messageId, attachment }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDownloading(true);
      const url = await mediaService.loadMedia(chatId, messageId, { fullRes: true });
      if (url) {
        await downloadFileToDevice(
          url,
          attachment.name || 'audio.mp3',
          attachment.mimeType || 'audio/mpeg'
        );
      } else {
        showToast('Could not download audio', 'error');
      }
    } catch {
      showToast('Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group">
      <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
        <Music size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
          {attachment.name || 'Audio message'}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <span>{attachment.duration || '0:00'}</span>
          {attachment.size && <span>• {attachment.size}</span>}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 transition-colors shrink-0"
        title="Download audio"
      >
        {downloading ? <Loader2 size={16} className="animate-spin text-teleforge-primary" /> : <Download size={16} />}
      </button>
    </div>
  );
};

export const ChatInfoDrawer: React.FC<ChatInfoDrawerProps> = ({
  chat,
  isOpen,
  onClose,
  onToggleMute,
  onOpenMediaModal,
}) => {
  const [activeMediaTab, setActiveMediaTab] = useState<'photos' | 'videos' | 'files' | 'audio'>('photos');
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharedMedia, setSharedMedia] = useState<{
    photos: Message[];
    videos: Message[];
    files: Message[];
    audio: Message[];
  }>({
    photos: [],
    videos: [],
    files: [],
    audio: [],
  });
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);

  // Load shared media directly from Telegram MTProto when drawer is open or tab changes
  useEffect(() => {
    if (!isOpen || !chat?.id || chat.id === 'saved-messages') return;

    let cancelled = false;
    setIsLoadingMedia(true);

    telegramApi
      .getChatSharedMedia(chat.id, activeMediaTab, 100)
      .then((msgs) => {
        if (cancelled) return;
        const mapped = (msgs || []).map((m) =>
          mapTelegramMessage(m, chat.id, chat.name || 'Telegram')
        );
        setSharedMedia((prev) => ({
          ...prev,
          [activeMediaTab]: mapped,
        }));
      })
      .catch((err) => {
        console.warn('[ChatInfoDrawer] Error loading shared media:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMedia(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, chat?.id, chat?.name, activeMediaTab]);

  // Combine fetched items with any local chat messages in memory
  const items = useMemo(() => {
    if (!chat) return [];
    const fetched = sharedMedia[activeMediaTab] || [];
    const localFiltered = (chat.messages || []).filter((m) => {
      if (activeMediaTab === 'photos') return m.attachment?.type === 'image';
      if (activeMediaTab === 'videos') return m.attachment?.type === 'video';
      if (activeMediaTab === 'files') return m.attachment?.type === 'file';
      if (activeMediaTab === 'audio') return m.attachment?.type === 'audio';
      return false;
    });

    const seen = new Set<string>();
    const result: Array<{ id: string | number; attachment: Attachment }> = [];

    for (const m of [...fetched, ...localFiltered]) {
      const idStr = String(m.id);
      if (m.attachment && !seen.has(idStr)) {
        seen.add(idStr);
        result.push({
          id: m.id,
          attachment: m.attachment,
        });
      }
    }
    return result;
  }, [sharedMedia, activeMediaTab, chat]);

  if (!isOpen || !chat) return null;

  const handleCopyLink = () => {
    const link = `https://t.me/${chat.username ? chat.username.replace('@', '') : chat.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handlePhotoClick = (item: { id: string | number; attachment: any }) => {
    if (onOpenMediaModal) {
      const fullUrl =
        mediaService.get(chat.id, item.id) ||
        item.attachment?.url ||
        `/api/telegram/media?chatId=${encodeURIComponent(chat.id)}&messageId=${item.id}`;
      onOpenMediaModal({
        ...item.attachment,
        chatId: chat.id,
        messageId: item.id,
        url: fullUrl,
        thumbUrl: item.attachment?.thumbUrl,
      });
    }
  };

  const handleVideoClick = (item: { id: string | number; attachment: any }) => {
    if (onOpenMediaModal) {
      const videoUrl =
        item.attachment?.url ||
        `/api/telegram/media?chatId=${encodeURIComponent(chat.id)}&messageId=${item.id}`;
      onOpenMediaModal({
        ...item.attachment,
        chatId: chat.id,
        messageId: item.id,
        url: videoUrl,
        thumbUrl: item.attachment?.thumbUrl,
      });
    }
  };

  return (
    <div className="w-full h-full bg-white dark:bg-teleforge-surface border-l border-gray-200 dark:border-gray-800 flex flex-col z-20 shadow-lg animate-in slide-in-from-right duration-200">
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
              peerId={chat.id}
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
                <div className="text-sm text-teleforge-primary dark:text-rose-300 hover:underline cursor-pointer font-medium">
                  {chat.username}
                </div>
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

        {/* Media / Videos / Files / Audio tabs */}
        <div className="p-4">
          <div className="flex border-b border-gray-100 dark:border-gray-800 mb-3 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveMediaTab('photos')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors whitespace-nowrap px-2 ${
                activeMediaTab === 'photos'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Photos {items.length > 0 && activeMediaTab === 'photos' ? `(${items.length})` : ''}
            </button>
            <button
              onClick={() => setActiveMediaTab('videos')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors whitespace-nowrap px-2 ${
                activeMediaTab === 'videos'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Videos {items.length > 0 && activeMediaTab === 'videos' ? `(${items.length})` : ''}
            </button>
            <button
              onClick={() => setActiveMediaTab('files')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors whitespace-nowrap px-2 ${
                activeMediaTab === 'files'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Files {items.length > 0 && activeMediaTab === 'files' ? `(${items.length})` : ''}
            </button>
            <button
              onClick={() => setActiveMediaTab('audio')}
              className={`flex-1 pb-2 text-xs font-medium text-center border-b-2 transition-colors whitespace-nowrap px-2 ${
                activeMediaTab === 'audio'
                  ? 'border-teleforge-primary text-teleforge-primary dark:text-teleforge-cream font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Audio {items.length > 0 && activeMediaTab === 'audio' ? `(${items.length})` : ''}
            </button>
          </div>

          {isLoadingMedia && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 size={22} className="animate-spin text-teleforge-primary" />
              <span className="text-xs">Loading shared media...</span>
            </div>
          )}

          {activeMediaTab === 'photos' && (
            <div>
              {items.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {items.map((m) => (
                    <SharedPhotoItem
                      key={m.id}
                      chatId={chat.id}
                      messageId={m.id}
                      attachment={m.attachment}
                      onClick={() => handlePhotoClick(m)}
                    />
                  ))}
                </div>
              ) : !isLoadingMedia ? (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <Image size={24} className="opacity-40" />
                  <span>No shared photos</span>
                </div>
              ) : null}
            </div>
          )}

          {activeMediaTab === 'videos' && (
            <div>
              {items.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {items.map((m) => (
                    <SharedVideoItem
                      key={m.id}
                      chatId={chat.id}
                      messageId={m.id}
                      attachment={m.attachment}
                      onClick={() => handleVideoClick(m)}
                    />
                  ))}
                </div>
              ) : !isLoadingMedia ? (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <Video size={24} className="opacity-40" />
                  <span>No shared videos</span>
                </div>
              ) : null}
            </div>
          )}

          {activeMediaTab === 'files' && (
            <div>
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((f) => (
                    <SharedFileItem
                      key={f.id}
                      chatId={chat.id}
                      messageId={f.id}
                      attachment={f.attachment}
                    />
                  ))}
                </div>
              ) : !isLoadingMedia ? (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <FileText size={24} className="opacity-40" />
                  <span>No shared files</span>
                </div>
              ) : null}
            </div>
          )}

          {activeMediaTab === 'audio' && (
            <div>
              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((a) => (
                    <SharedAudioItem
                      key={a.id}
                      chatId={chat.id}
                      messageId={a.id}
                      attachment={a.attachment}
                    />
                  ))}
                </div>
              ) : !isLoadingMedia ? (
                <div className="text-center py-8 text-xs text-gray-400 flex flex-col items-center gap-1.5">
                  <Music size={24} className="opacity-40" />
                  <span>No audio files</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

