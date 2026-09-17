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
  Play,
  Video,
  Download,
  Maximize2,
} from 'lucide-react';
import { Chat, Message, Reaction, Attachment } from '../types';
import { AudioPlayer } from './AudioPlayer';
import { Avatar } from './Avatar';
import { TeleForgeVideoPlayer } from './TeleForgeVideoPlayer';
import { UserProfileModal, UserProfileDetails } from './UserProfileModal';
import { mediaService } from '../services/mediaService';
import { downloadFileToDevice } from '../utils/fileDownloader';
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
import { telegramApi, resolveApiUrl, OnlineGifItem, TelegramStickerSet } from '../services/telegramApi';
import { stickerService, CustomSticker } from '../services/stickerService';

interface ChatMediaImageProps {
  attachment: Attachment;
  chatId: string;
  messageId: string;
  onOpenMediaModal: (attachment: Attachment) => void;
}

const ChatMediaImage: React.FC<ChatMediaImageProps> = ({
  attachment,
  chatId,
  messageId,
  onOpenMediaModal,
}) => {
  const [mediaUrl, setMediaUrl] = useState<string>(() => {
    if (attachment.url && !attachment.url.includes('/api/telegram/media')) {
      return attachment.url;
    }
    return mediaService.get(chatId, messageId) || '';
  });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (mediaUrl) return;
    let mounted = true;
    const unsub = mediaService.subscribe(chatId, messageId, (url) => {
      if (url && mounted) {
        setMediaUrl(url);
        setFailed(false);
      }
    });
    mediaService
      .loadMedia(chatId, messageId, { fullRes: false })
      .then((url) => {
        if (!mounted) return;
        if (url) {
          setMediaUrl(url);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
      unsub();
    };
  }, [chatId, messageId, mediaUrl, retryCount]);

  const displayUrl = mediaUrl || (attachment.url && !attachment.url.includes('/api/telegram/media') ? attachment.url : '');
  const thumbUrl = attachment.thumbUrl;

  const handleClick = (e: React.MouseEvent) => {
    if (failed && !displayUrl) {
      e.stopPropagation();
      setFailed(false);
      setRetryCount((c) => c + 1);
      return;
    }
    onOpenMediaModal({
      ...attachment,
      url: displayUrl || thumbUrl || '',
    });
  };

  return (
    <div
      onClick={handleClick}
      className="mb-2 cursor-pointer rounded-xl overflow-hidden shadow-xs hover:opacity-95 transition-opacity relative group bg-black/20 min-h-[140px] max-h-80 flex items-center justify-center select-none"
    >
      {/* 1. Instant blurred preview if thumbUrl is available (0ms) */}
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt={attachment.name || 'Photo preview'}
          className={`absolute inset-0 w-full h-full object-cover filter blur-[2px] scale-105 transition-opacity duration-300 ${
            loaded ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}

      {/* 2. Full-resolution loaded image */}
      {displayUrl && (
        <img
          src={displayUrl}
          alt={attachment.name || 'Photo'}
          onLoad={() => setLoaded(true)}
          className={`relative z-10 max-h-80 w-full object-cover transition-opacity duration-300 ${
            loaded || !thumbUrl ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* 3. Non-blocking subtle loading badge (only if no full image loaded yet) */}
      {!loaded && !displayUrl && !failed && (
        <div className="relative z-20 flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur-xs text-white/90 shadow-md">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {/* 4. Tap to retry overlay if full load failed and not loaded */}
      {failed && !loaded && !displayUrl && (
        <div className="relative z-20 flex flex-col items-center justify-center p-2.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-center shadow-lg">
          <span className="text-[11px] font-medium mb-1">Failed to load</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFailed(false);
              setRetryCount((c) => c + 1);
            }}
            className="text-[11px] px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded-md font-semibold transition-colors"
          >
            Tap to retry
          </button>
        </div>
      )}
    </div>
  );
};

interface ChatMediaVideoProps {
  attachment: Attachment;
  chatId: string;
  messageId: string;
  onOpenMediaModal: (attachment: Attachment) => void;
}

const ChatMediaVideo: React.FC<ChatMediaVideoProps> = ({
  attachment,
  chatId,
  messageId,
  onOpenMediaModal,
}) => {
  const [videoUrl, setVideoUrl] = useState<string>(() => {
    return mediaService.get(chatId, messageId, { fullVideo: true }) || '';
  });
  const [thumbUrl, setThumbUrl] = useState<string>(() => {
    return attachment.thumbUrl || mediaService.get(chatId, messageId) || '';
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ pct: number; dl: number; tot: number } | null>(null);

  // Background thumbnail loader for instant Telegram-style preview
  useEffect(() => {
    if (thumbUrl) return;
    let mounted = true;
    mediaService.loadMedia(chatId, messageId, { fullRes: false }).then((url) => {
      if (url && mounted) setThumbUrl(url);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [chatId, messageId, thumbUrl]);

  useEffect(() => {
    if (videoUrl) return;
    const unsub = mediaService.subscribe(
      chatId,
      messageId,
      (url) => {
        if (url) {
          setVideoUrl(url);
          setIsLoading(false);
        }
      },
      { fullVideo: true }
    );
    const unsubProg = mediaService.subscribeProgress(
      chatId,
      messageId,
      (pct, dl, tot) => {
        setDownloadProgress({ pct, dl, tot });
      },
      { fullVideo: true }
    );
    return () => {
      unsub();
      unsubProg();
    };
  }, [chatId, messageId, videoUrl]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoUrl) {
      setIsPlaying(true);
    } else {
      setIsLoading(true);
      mediaService.loadMedia(chatId, messageId, {
        fullVideo: true,
        onProgress: (pct, dl, tot) => {
          setDownloadProgress({ pct, dl, tot });
        },
      }).then((url) => {
        setIsLoading(false);
        if (url) {
          setVideoUrl(url);
          setIsPlaying(true);
        }
      }).catch(() => setIsLoading(false));
    }
  };

  const handleOpenFull = () => {
    onOpenMediaModal({
      ...attachment,
      chatId,
      messageId,
      url: videoUrl || '',
      thumbUrl: thumbUrl || attachment.thumbUrl,
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let target = videoUrl;
    if (!target) {
      setIsLoading(true);
      target = await mediaService.loadMedia(chatId, messageId, {
        fullVideo: true,
        onProgress: (pct, dl, tot) => setDownloadProgress({ pct, dl, tot }),
      }) || '';
      setIsLoading(false);
    }
    if (target) {
      await downloadFileToDevice(target, attachment.name || 'teleforge-video.mp4', 'video/mp4');
    } else {
      showToast('Could not download video', 'error');
    }
  };

  if (isPlaying && videoUrl) {
    return (
      <div className="mb-2 rounded-xl overflow-hidden shadow-xs relative bg-black max-h-80" onClick={(e) => e.stopPropagation()}>
        <TeleForgeVideoPlayer
          src={videoUrl}
          poster={thumbUrl || attachment.thumbUrl}
          title={attachment.name}
          autoPlay={true}
          maxHeightClass="max-h-80"
        />
      </div>
    );
  }

  return (
    <div
      onClick={handleOpenFull}
      className="mb-2 cursor-pointer rounded-xl overflow-hidden shadow-xs hover:opacity-95 transition-opacity relative group bg-black/20 min-h-[160px] max-h-80 flex items-center justify-center select-none"
    >
      {/* Video Thumbnail */}
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={attachment.name || 'Video thumbnail'}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-slate-900/80" />
      )}

      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

      {/* Quick Actions in Top-Right: Fullscreen / Expand and Download */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleOpenFull();
          }}
          className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs border border-white/20 transition-all hover:scale-105 shadow-md"
          title="Fullscreen / Open in player"
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs border border-white/20 transition-all hover:scale-105 shadow-md"
          title="Download video"
        >
          <Download size={13} />
        </button>
      </div>

      {/* Center Play Button */}
      <button
        onClick={handlePlayClick}
        disabled={isLoading}
        className="relative z-10 min-w-12 h-12 px-3 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs transition-transform transform group-hover:scale-110 shadow-lg border border-white/20"
        title="Play video"
      >
        {isLoading ? (
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-5 h-5 animate-spin text-teleforge-primary" />
            <span className="text-[11px] font-bold text-white">
              {downloadProgress ? `${downloadProgress.pct}%` : '...'}
            </span>
          </div>
        ) : (
          <Play className="w-6 h-6 fill-white ml-0.5" />
        )}
      </button>

      {/* Progress Bar when loading */}
      {isLoading && downloadProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-20">
          <div
            className="h-full bg-teleforge-primary transition-all duration-200"
            style={{ width: `${downloadProgress.pct}%` }}
          />
        </div>
      )}

      {/* Bottom info badge */}
      <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-medium text-white flex items-center gap-1.5">
        <Video size={12} />
        <span>{attachment.duration || 'Video'}</span>
        {attachment.size && <span>• {attachment.size}</span>}
      </div>
    </div>
  );
};

// Dedicated circular video note component (Telegram-style round message)
const ChatMediaVideoNote: React.FC<{
  attachment: Attachment;
  chatId: string;
  messageId: string;
}> = ({ attachment, chatId, messageId }) => {
  const [videoUrl, setVideoUrl] = useState<string>(() => {
    return mediaService.get(chatId, messageId, { fullVideo: true }) || '';
  });
  const [thumbUrl, setThumbUrl] = useState<string>(() => {
    return attachment.thumbUrl || mediaService.get(chatId, messageId) || '';
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (thumbUrl) return;
    let mounted = true;
    mediaService.loadMedia(chatId, messageId, { fullRes: false }).then((url) => {
      if (url && mounted) setThumbUrl(url);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [chatId, messageId, thumbUrl]);

  useEffect(() => {
    if (videoUrl) return;
    const unsub = mediaService.subscribe(
      chatId,
      messageId,
      (url) => {
        if (url) {
          setVideoUrl(url);
          setIsLoading(false);
        }
      },
      { fullVideo: true }
    );
    return unsub;
  }, [chatId, messageId, videoUrl]);

  useEffect(() => {
    if (videoUrl && isPlaying && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoUrl, isPlaying]);

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoUrl) {
      setIsLoading(true);
      mediaService.loadMedia(chatId, messageId, { fullVideo: true }).then((url) => {
        setIsLoading(false);
        if (url) {
          setVideoUrl(url);
          setIsPlaying(true);
        }
      }).catch(() => setIsLoading(false));
      return;
    }

    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  return (
    <div
      onClick={handleTogglePlay}
      className="relative w-48 h-48 sm:w-56 sm:h-56 min-w-[192px] min-h-[192px] max-w-[192px] max-h-[192px] sm:min-w-[224px] sm:min-h-[224px] sm:max-w-[224px] sm:max-h-[224px] rounded-full overflow-hidden aspect-square border-2 border-white/25 shadow-xl bg-black cursor-pointer group select-none my-1.5 flex items-center justify-center shrink-0"
      title="Tap to play / pause video message"
    >
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbUrl}
          playsInline
          loop
          muted={isMuted}
          className="w-full h-full object-cover rounded-full pointer-events-none"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      ) : thumbUrl ? (
        <img
          src={thumbUrl}
          alt="Video Note"
          className="w-full h-full object-cover rounded-full filter blur-[0.5px]"
        />
      ) : (
        <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center">
          <Video size={36} className="text-white/40" />
        </div>
      )}

      {/* Play/Loading Center Overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 bg-black/35 flex items-center justify-center rounded-full transition-opacity group-hover:bg-black/50">
          <div className="w-12 h-12 rounded-full bg-black/65 text-white flex items-center justify-center shadow-lg border border-white/30 group-hover:scale-110 transition-transform">
            {isLoading ? (
              <Loader2 size={22} className="animate-spin text-teleforge-primary" />
            ) : (
              <Play size={20} className="fill-white ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Sound Mute Toggle */}
      {isPlaying && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (videoRef.current) {
              videoRef.current.muted = !isMuted;
              setIsMuted(!isMuted);
            }
          }}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black/90 shadow-md border border-white/20 z-10"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      )}

      {/* Duration Badge */}
      {attachment.duration && !isPlaying && (
        <span className="absolute bottom-3 px-2 py-0.5 rounded-full bg-black/75 text-[10px] font-bold text-white shadow-xs">
          {attachment.duration}
        </span>
      )}
    </div>
  );
};

// Component for Telegram-style Stickers
const ChatMediaSticker: React.FC<{
  attachment: Attachment;
  chatId: string;
  messageId: string;
  onOpenStickerPreview?: (att: Attachment, cId: string, mId: string) => void;
}> = ({ attachment, chatId, messageId, onOpenStickerPreview }) => {
  const [src, setSrc] = useState<string>(() => {
    if (attachment.url && !attachment.url.includes('/api/telegram/media')) {
      return attachment.url;
    }
    return mediaService.get(chatId, messageId) || attachment.thumbUrl || '';
  });
  const [hasError, setHasError] = useState(false);
  const [isSaved, setIsSaved] = useState(() =>
    stickerService.isStickerSaved(attachment.url) ||
    Boolean(attachment.documentId && stickerService.isStickerSaved(attachment.documentId))
  );

  useEffect(() => {
    const unsub = stickerService.subscribe(() => {
      setIsSaved(
        stickerService.isStickerSaved(attachment.url) ||
        Boolean(attachment.documentId && stickerService.isStickerSaved(attachment.documentId))
      );
    });
    return unsub;
  }, [attachment.url, attachment.documentId]);

  useEffect(() => {
    let mounted = true;
    const unsub = mediaService.subscribe(chatId, messageId, (url) => {
      if (url && mounted) {
        setSrc(url);
        setHasError(false);
      }
    });

    if (!src || src === attachment.thumbUrl) {
      mediaService.loadMedia(chatId, messageId, { fullRes: false }).then((url) => {
        if (url && mounted) {
          setSrc(url);
          setHasError(false);
        }
      }).catch(() => {});
    }

    return () => {
      mounted = false;
      unsub();
    };
  }, [chatId, messageId, attachment.thumbUrl, src]);

  const normalizedSrc = (src.startsWith('/stickers/') || src.startsWith('/gifs/')) ? '.' + src : src;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) {
      stickerService.removeCustomSticker(attachment.documentId || normalizedSrc || attachment.url);
      showToast('Removed from your stickers', 'info');
    } else {
      stickerService.addCustomSticker({
        id: attachment.documentId || `stk-${Date.now()}`,
        name: attachment.name || (attachment.stickerEmoji ? `Sticker ${attachment.stickerEmoji}` : 'Custom Sticker'),
        emoji: attachment.stickerEmoji,
        url: normalizedSrc || attachment.url,
        thumbUrl: attachment.thumbUrl || normalizedSrc,
        stickerSet: attachment.stickerSet,
        documentId: attachment.documentId,
        accessHash: attachment.accessHash,
        fileReference: attachment.fileReference,
      });
      showToast('Sticker added to your stickers! ⭐', 'success');
    }
  };

  return (
    <div
      onClick={() => onOpenStickerPreview?.({ ...attachment, url: normalizedSrc || attachment.url }, chatId, messageId)}
      className="group relative my-1 cursor-pointer transition-transform hover:scale-105 active:scale-95 select-none"
      title="Tap to preview & add sticker"
    >
      {normalizedSrc && !hasError ? (
        <img
          src={normalizedSrc}
          alt={attachment.name || 'Sticker'}
          onError={() => setHasError(true)}
          className="w-36 h-36 sm:w-44 sm:h-44 object-contain filter drop-shadow-md"
        />
      ) : (
        <div className="w-32 h-32 rounded-2xl bg-black/10 dark:bg-white/10 flex flex-col items-center justify-center p-2 text-center select-none shadow-xs">
          <span className="text-4xl">{attachment.name?.replace('Sticker', '').trim() || '⭐️'}</span>
        </div>
      )}

      {/* Floating Quick-Add Button on Sticker */}
      <button
        type="button"
        onClick={handleQuickAdd}
        title={isSaved ? 'In your stickers (click to remove)' : 'Add to your stickers'}
        className={`absolute top-1 right-1 p-1.5 rounded-full backdrop-blur-md transition-all shadow-md cursor-pointer ${
          isSaved
            ? 'bg-green-600/90 text-white opacity-90 scale-100'
            : 'bg-black/60 hover:bg-teleforge-primary text-white opacity-0 group-hover:opacity-100 hover:scale-110'
        }`}
      >
        {isSaved ? <Check size={13} className="text-white stroke-[2.5]" /> : <Plus size={13} className="stroke-[2.5]" />}
      </button>
    </div>
  );
};

// Sticker Preview & Add Sheet Modal
const StickerPreviewModal: React.FC<{
  data: {
    attachment: Attachment;
    chatId: string;
    messageId: string;
  } | null;
  onClose: () => void;
  onSendMessage: (text: string, replyTo?: Message, attachment?: Attachment) => void;
}> = ({ data, onClose, onSendMessage }) => {
  if (!data) return null;
  const { attachment } = data;
  const isSaved = stickerService.isStickerSaved(attachment.url) ||
    Boolean(attachment.documentId && stickerService.isStickerSaved(attachment.documentId));

  const [saving, setSaving] = useState(false);

  const handleToggleSave = () => {
    setSaving(true);
    try {
      if (isSaved) {
        stickerService.removeCustomSticker(attachment.documentId || attachment.url);
        showToast('Removed from your stickers', 'info');
      } else {
        stickerService.addCustomSticker({
          id: attachment.documentId || `stk-${Date.now()}`,
          name: attachment.name || (attachment.stickerEmoji ? `Sticker ${attachment.stickerEmoji}` : 'Custom Sticker'),
          emoji: attachment.stickerEmoji,
          url: attachment.url,
          thumbUrl: attachment.thumbUrl || attachment.url,
          stickerSet: attachment.stickerSet,
          documentId: attachment.documentId,
          accessHash: attachment.accessHash,
          fileReference: attachment.fileReference,
        });
        showToast('Sticker added to your stickers! ⭐', 'success');
      }
    } catch (e: any) {
      showToast('Failed to update sticker', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = () => {
    onSendMessage('', undefined, attachment);
    onClose();
    showToast('Sticker sent! 🚀', 'success');
  };

  const stickerTitle = attachment.stickerSet?.title || attachment.name?.replace('Sticker', '').trim() || 'Custom Sticker';
  const stickerSub = attachment.stickerSet?.shortName ? `@${attachment.stickerSet.shortName}` : 'Custom Telegram Sticker';
  const displaySrc = attachment.url.startsWith('/stickers/') || attachment.url.startsWith('/gifs/') ? '.' + attachment.url : attachment.url;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131b26] rounded-3xl p-6 max-w-xs sm:max-w-sm w-full border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col items-center relative text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center my-3 relative">
          <img
            src={displaySrc}
            alt={attachment.name || 'Sticker'}
            className="w-full h-full object-contain filter drop-shadow-xl"
            onError={(e) => {
              if (attachment.thumbUrl && e.currentTarget.src !== attachment.thumbUrl) {
                e.currentTarget.src = attachment.thumbUrl;
              }
            }}
          />
          {attachment.stickerEmoji && (
            <span className="absolute bottom-0 right-0 text-2xl p-1 bg-white/90 dark:bg-black/90 rounded-full shadow-md backdrop-blur-xs">
              {attachment.stickerEmoji}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-2">
          {stickerTitle}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
          {stickerSub}
        </p>

        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={handleToggleSave}
            disabled={saving}
            className={`w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isSaved
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-500/10 hover:text-red-500'
                : 'bg-teleforge-primary hover:bg-teleforge-hover text-white shadow-lg shadow-teleforge-primary/25 active:scale-98'
            }`}
          >
            {isSaved ? <Check size={18} className="text-green-500 stroke-[2.5]" /> : <Sparkles size={18} />}
            <span>{isSaved ? 'In Your Stickers (Remove)' : (attachment.stickerSet ? 'Add Sticker Pack' : 'Add to Stickers')}</span>
          </button>

          <button
            type="button"
            onClick={handleSend}
            className="w-full py-2.5 rounded-2xl font-medium text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Send size={14} />
            <span>Send to Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// Component for Telegram GIFs
const ChatMediaGif: React.FC<{
  attachment: Attachment;
  chatId: string;
  messageId: string;
  onOpenMediaModal: (att: Attachment) => void;
}> = ({ attachment, chatId, messageId, onOpenMediaModal }) => {
  const [url, setUrl] = useState<string>(() => {
    if (attachment.url && !attachment.url.includes('/api/telegram/media')) {
      return attachment.url;
    }
    return mediaService.get(chatId, messageId, { fullVideo: true }) || attachment.url || '';
  });

  useEffect(() => {
    if (url && !url.includes('/api/telegram/media')) return;
    const unsub = mediaService.subscribe(
      chatId,
      messageId,
      (newUrl) => {
        if (newUrl) setUrl(newUrl);
      },
      { fullVideo: true }
    );
    mediaService.loadMedia(chatId, messageId, { fullVideo: true }).then((u) => {
      if (u) setUrl(u);
    }).catch(() => {});
    return unsub;
  }, [chatId, messageId, url]);

  const normalizedUrl = (url.startsWith('/stickers/') || url.startsWith('/gifs/')) ? '.' + url : url;

  return (
    <div
      onClick={() => onOpenMediaModal({ ...attachment, url: normalizedUrl, chatId, messageId })}
      className="relative my-1 max-w-sm rounded-2xl overflow-hidden shadow-md cursor-pointer group bg-black/30"
    >
      {normalizedUrl.endsWith('.gif') || normalizedUrl.startsWith('data:image/gif') ? (
        <img src={normalizedUrl} alt={attachment.name || 'GIF'} className="w-full max-h-72 object-cover" />
      ) : (
        <video
          src={normalizedUrl}
          playsInline
          autoPlay
          loop
          muted
          className="w-full max-h-72 object-cover pointer-events-none"
        />
      )}
      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-extrabold text-white uppercase tracking-wider backdrop-blur-xs">
        GIF
      </span>
    </div>
  );
};

export interface CuratedSticker {
  id: string;
  name: string;
  emoji: string;
  category: 'all' | 'duck' | 'doge' | 'cat' | 'reactions' | 'fun';
  tags: string[];
  url: string;
}

export interface CuratedGif {
  id: string;
  name: string;
  category: 'all' | 'trending' | 'dance' | 'reactions' | 'party' | 'love';
  tags: string[];
  url: string;
}

const CURATED_STICKERS: CuratedSticker[] = [
  // Duck Pack
  { id: 'stk-duck-hi', name: 'Duck Hello', emoji: '👋', category: 'duck', tags: ['duck', 'hello', 'hi', 'wave', 'greet'], url: './stickers/duck_hello.svg' },
  { id: 'stk-duck-cool', name: 'Duck Cool', emoji: '😎', category: 'duck', tags: ['duck', 'cool', 'sunglasses', 'chill'], url: './stickers/duck_cool.svg' },
  { id: 'stk-duck-love', name: 'Duck Love', emoji: '❤️', category: 'duck', tags: ['duck', 'love', 'heart', 'kiss', 'cute'], url: './stickers/duck_love.svg' },
  { id: 'stk-duck-shock', name: 'Duck Shocked', emoji: '😱', category: 'duck', tags: ['duck', 'shocked', 'surprised', 'omg', 'what'], url: './stickers/duck_shocked.svg' },
  { id: 'stk-duck-sleepy', name: 'Duck Sleepy', emoji: '😴', category: 'duck', tags: ['duck', 'sleep', 'tired', 'zzz', 'night'], url: './stickers/duck_sleepy.svg' },
  { id: 'stk-duck-angry', name: 'Duck Angry', emoji: '😡', category: 'duck', tags: ['duck', 'angry', 'mad', 'rage', 'furious'], url: './stickers/duck_angry.svg' },
  { id: 'stk-duck-rich', name: 'Duck Rich', emoji: '🤑', category: 'duck', tags: ['duck', 'money', 'rich', 'dollar', 'crypto', 'ton'], url: './stickers/duck_rich.svg' },

  // Doge Pack
  { id: 'stk-doge-party', name: 'Doge Party', emoji: '🐕', category: 'doge', tags: ['doge', 'dog', 'party', 'celebrate', 'fun'], url: './stickers/doge_party.svg' },
  { id: 'stk-doge-cool', name: 'Doge Cool', emoji: '🕶️', category: 'doge', tags: ['doge', 'dog', 'cool', 'sunglasses', 'swag'], url: './stickers/doge_cool.svg' },
  { id: 'stk-doge-wow', name: 'Doge Wow', emoji: '✨', category: 'doge', tags: ['doge', 'wow', 'amaze', 'much wow', 'dog'], url: './stickers/doge_wow.svg' },
  { id: 'stk-doge-cry', name: 'Doge Cry', emoji: '😭', category: 'doge', tags: ['doge', 'cry', 'tears', 'sad', 'pain'], url: './stickers/doge_cry.svg' },

  // Cat Pack
  { id: 'stk-cat-happy', name: 'Happy Cat', emoji: '😺', category: 'cat', tags: ['cat', 'happy', 'kitty', 'smile', 'joy'], url: './stickers/cat_happy.svg' },
  { id: 'stk-cat-love', name: 'Cat Love', emoji: '😻', category: 'cat', tags: ['cat', 'love', 'heart eyes', 'crush'], url: './stickers/cat_love.svg' },
  { id: 'stk-cat-vibing', name: 'Cat Vibing', emoji: '🎧', category: 'cat', tags: ['cat', 'music', 'headphones', 'vibe', 'beats'], url: './stickers/cat_vibing.svg' },

  // Reactions & Expressive
  { id: 'stk-thumbs-up', name: 'Thumbs Up', emoji: '👍', category: 'reactions', tags: ['thumbs up', 'yes', 'agree', 'ok', 'good', 'approved'], url: './stickers/thumbs_up.svg' },
  { id: 'stk-crying-laugh', name: 'Crying Laugh', emoji: '😂', category: 'reactions', tags: ['laugh', 'lol', 'rofl', 'funny', 'haha'], url: './stickers/crying_laugh.svg' },
  { id: 'stk-star-struck', name: 'Star Struck', emoji: '🤩', category: 'reactions', tags: ['star', 'struck', 'amazed', 'wow', 'gorgeous'], url: './stickers/star_struck.svg' },
  { id: 'stk-cool-shades', name: 'Cool Shades', emoji: '😎', category: 'reactions', tags: ['cool', 'boss', 'shades', 'swagger'], url: './stickers/cool_sunglasses.svg' },
  { id: 'stk-peace', name: 'Peace Sign', emoji: '✌️', category: 'reactions', tags: ['peace', 'victory', 'chill', 'zen'], url: './stickers/peace_sign.svg' },
  { id: 'stk-trophy', name: 'Winner Trophy', emoji: '🏆', category: 'reactions', tags: ['trophy', 'winner', 'number 1', 'gold', 'champion'], url: './stickers/trophy_winner.svg' },

  // Fun & Celebrations
  { id: 'stk-fire-flame', name: 'Fire Flame', emoji: '🔥', category: 'fun', tags: ['fire', 'flame', 'lit', 'hot', 'epic'], url: './stickers/fire_flame.svg' },
  { id: 'stk-party-popper', name: 'Party Popper', emoji: '🎉', category: 'fun', tags: ['party', 'popper', 'confetti', 'celebrate'], url: './stickers/party_popper.svg' },
  { id: 'stk-heart-sparkle', name: 'Sparkle Heart', emoji: '💖', category: 'fun', tags: ['heart', 'love', 'sparkle', 'precious'], url: './stickers/heart_sparkle.svg' },
  { id: 'stk-rocket-launch', name: 'Rocket Spark', emoji: '🚀', category: 'fun', tags: ['rocket', 'launch', 'moon', 'fast', 'blast'], url: './stickers/rocket_launch.svg' },
  { id: 'stk-coffee', name: 'Morning Coffee', emoji: '☕', category: 'fun', tags: ['coffee', 'tea', 'morning', 'energy', 'cafe'], url: './stickers/coffee_morning.svg' },
  { id: 'stk-gem-diamond', name: 'Diamond Gem', emoji: '💎', category: 'fun', tags: ['diamond', 'gem', 'crystal', 'valuable', 'rare'], url: './stickers/gem_diamond.svg' },
];

const CURATED_GIFS: CuratedGif[] = [
  // Trending & Dance
  { id: 'gif-vibing-cat', name: 'Vibing Cat', category: 'trending', tags: ['cat', 'vibing', 'headbob', 'groove', 'music', 'jam'], url: './gifs/vibing_cat.svg' },
  { id: 'gif-celebrate', name: 'Celebration', category: 'party', tags: ['celebrate', 'party', 'woohoo', 'confetti', 'yay'], url: './gifs/celebrate.svg' },
  { id: 'gif-dancing', name: 'Dancing', category: 'dance', tags: ['dance', 'groove', 'disco', 'party', 'moves'], url: './gifs/dancing.svg' },
  { id: 'gif-party-dance', name: 'Disco Party', category: 'party', tags: ['disco', 'party', 'dance', 'fun', 'rave'], url: './gifs/party_dance.svg' },
  { id: 'gif-dog-spin', name: 'Spinning Doge', category: 'trending', tags: ['dog', 'doge', 'spin', 'cute', 'dizzy'], url: './gifs/dog_spinning.svg' },

  // Reactions & Fun
  { id: 'gif-thumbs-up', name: 'Thumbs Up', category: 'reactions', tags: ['thumbs up', 'yes', 'great', 'approved', 'like'], url: './gifs/thumbs_up.svg' },
  { id: 'gif-applause', name: 'Applause', category: 'reactions', tags: ['applause', 'clap', 'clapping', 'bravo', 'congrats'], url: './gifs/applause.svg' },
  { id: 'gif-laughing', name: 'Laughing', category: 'reactions', tags: ['laugh', 'lol', 'haha', 'funny', 'hilarious'], url: './gifs/laughing.svg' },
  { id: 'gif-mind-blown', name: 'Mind Blown', category: 'reactions', tags: ['mind blown', 'shocked', 'explosion', 'wow', 'insane'], url: './gifs/mind_blown.svg' },
  { id: 'gif-facepalm', name: 'Facepalm', category: 'reactions', tags: ['facepalm', 'smh', 'oh no', 'why', 'disappointed'], url: './gifs/facepalm.svg' },
  { id: 'gif-crying-tears', name: 'Crying Tears', category: 'reactions', tags: ['cry', 'crying', 'tears', 'sad', 'unhappy'], url: './gifs/crying_tears.svg' },

  // Love & Hype
  { id: 'gif-love-hearts', name: 'Love Hearts', category: 'love', tags: ['love', 'heart', 'hearts', 'romance', 'kiss'], url: './gifs/love_hearts.svg' },
  { id: 'gif-fire-burning', name: 'Fire Burning', category: 'trending', tags: ['fire', 'flame', 'lit', 'hot', 'hype'], url: './gifs/fire_burning.svg' },
  { id: 'gif-rocket-blast', name: 'To The Moon', category: 'trending', tags: ['rocket', 'blast', 'moon', 'space', 'crypto'], url: './gifs/rocket_blast.svg' },
];

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
  onSelectChat?: (chatId: string) => void;
  onOpenDirectChat?: (userId: string, userName: string, userAvatar?: string, userThumbUrl?: string) => void;
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
  onSelectChat,
  onOpenDirectChat,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');
  const [stickerSearch, setStickerSearch] = useState('');
  const [stickerCategory, setStickerCategory] = useState<string>('my_stickers');
  const [gifSearch, setGifSearch] = useState('');
  const [gifCategory, setGifCategory] = useState<string>('all');
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>(() => stickerService.getCustomStickers());
  const [stickerPreviewData, setStickerPreviewData] = useState<{
    attachment: Attachment;
    chatId: string;
    messageId: string;
  } | null>(null);
  const [telegramStickerSets, setTelegramStickerSets] = useState<TelegramStickerSet[]>([]);
  const [activeStickerSet, setActiveStickerSet] = useState<TelegramStickerSet | null>(null);
  const [isLoadingStickerSets, setIsLoadingStickerSets] = useState(false);

  // Online GIFs state for infinite scroll
  const [onlineGifs, setOnlineGifs] = useState<OnlineGifItem[]>([]);
  const [gifNextOffset, setGifNextOffset] = useState<string>('');
  const [isGifsLoading, setIsGifsLoading] = useState(false);

  // Subscribe to live custom stickers updates
  useEffect(() => {
    const unsub = stickerService.subscribe(() => {
      setCustomStickers([...stickerService.getCustomStickers()]);
    });
    return unsub;
  }, []);

  // Fetch installed Telegram sticker sets on demand
  useEffect(() => {
    if (stickerCategory === 'tg_packs' && telegramStickerSets.length === 0 && !isLoadingStickerSets) {
      setIsLoadingStickerSets(true);
      telegramApi.getInstalledStickerSets().then((sets) => {
        setTelegramStickerSets(sets);
        if (sets.length > 0 && !activeStickerSet) {
          telegramApi.getStickerSet(sets[0]).then((full) => {
            if (full) setActiveStickerSet(full);
          });
        }
      }).catch(() => {}).finally(() => setIsLoadingStickerSets(false));
    }
  }, [stickerCategory, telegramStickerSets.length, isLoadingStickerSets, activeStickerSet]);

  // Online GIFs infinite stream loader
  const loadOnlineGifs = async (query: string, offset: string, append = false) => {
    if (isGifsLoading) return;
    setIsGifsLoading(true);
    try {
      const effectiveQuery = query.trim() || (gifCategory !== 'all' ? gifCategory : '');
      const res = await telegramApi.getOnlineGifs(effectiveQuery, offset);
      if (append) {
        setOnlineGifs((prev) => [...prev, ...(res.results || [])]);
      } else {
        setOnlineGifs(res.results || []);
      }
      setGifNextOffset(res.nextOffset || '');
    } catch (err) {
      console.warn('[ChatView] Online GIF error:', err);
    } finally {
      setIsGifsLoading(false);
    }
  };

  useEffect(() => {
    if (emojiPickerTab !== 'gifs') return;
    const timer = setTimeout(() => {
      loadOnlineGifs(gifSearch, '', false);
    }, gifSearch ? 350 : 0);
    return () => clearTimeout(timer);
  }, [emojiPickerTab, gifSearch, gifCategory]);

  const handleGifScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 180 && !isGifsLoading && gifNextOffset) {
      loadOnlineGifs(gifSearch, gifNextOffset, true);
    }
  };

  const filteredStickers = useMemo(() => {
    return CURATED_STICKERS.filter((stk) => {
      const matchesCategory = stickerCategory === 'all' || stk.category === stickerCategory;
      const q = stickerSearch.toLowerCase().trim();
      if (!q) return matchesCategory;
      const matchesQuery =
        stk.name.toLowerCase().includes(q) ||
        stk.emoji.includes(q) ||
        stk.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [stickerSearch, stickerCategory]);

  const filteredCustomStickers = useMemo(() => {
    const q = stickerSearch.toLowerCase().trim();
    if (!q) return customStickers;
    return customStickers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.emoji && s.emoji.includes(q))
    );
  }, [customStickers, stickerSearch]);

  const filteredGifs = useMemo(() => {
    return CURATED_GIFS.filter((gif) => {
      const matchesCategory = gifCategory === 'all' || gif.category === gifCategory;
      const q = gifSearch.toLowerCase().trim();
      if (!q) return matchesCategory;
      const matchesQuery =
        gif.name.toLowerCase().includes(q) ||
        gif.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [gifSearch, gifCategory]);

  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [userProfileModalData, setUserProfileModalData] = useState<UserProfileDetails | null>(null);
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

  const handleOpenProfileOrDrawer = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!chat) return;
    if (chat.type === 'direct' || chat.type === 'bot') {
      setUserProfileModalData({
        id: chat.id,
        name: chat.name,
        username: chat.username,
        phone: chat.phone,
        bio: chat.bio || chat.description,
        avatar: chat.avatar,
        thumbUrl: chat.thumbUrl,
        online: chat.online,
        lastSeen: chat.lastSeen,
        verified: chat.verified,
        isBot: chat.type === 'bot',
      });
    } else {
      onToggleInfoDrawer();
    }
  };

  return (
    <main className="flex-1 h-full flex flex-col bg-teleforge-bg dark:bg-teleforge-bg relative overflow-hidden">
      {/* =========================================================================
          CHAT HEADER
         ========================================================================= */}
      <header className="h-14 px-4 bg-white dark:bg-teleforge-surface border-b border-gray-200 dark:border-gray-800 flex items-center justify-between z-10 select-none shadow-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0 cursor-pointer" onClick={handleOpenProfileOrDrawer}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBackToSidebar();
            }}
            className="md:hidden p-1.5 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>

          <div
            className="relative cursor-pointer transition-transform hover:scale-105 active:scale-95"
            onClick={handleOpenProfileOrDrawer}
            title={chat.type === 'direct' || chat.type === 'bot' ? 'View User Profile' : 'View Channel / Group Info'}
          >
            <Avatar
              src={chat.avatar}
              previewSrc={chat.thumbUrl}
              name={chat.name}
              color={chat.avatarColor}
              size="sm"
              className="w-10 h-10"
              peerId={chat.id}
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

          if (message.isService) {
            return (
              <div key={message.id} className="flex justify-center my-2 select-none w-full">
                <span className="px-3.5 py-1 rounded-full bg-black/40 dark:bg-white/10 text-white text-xs font-medium backdrop-blur-xs shadow-xs text-center max-w-[85%]">
                  {message.text}
                </span>
              </div>
            );
          }

          const cornerClass = getCornerRadiusClass(chatConfig.cornerRounding, isOut);
          const isSticker = message.attachment?.type === 'sticker' || message.attachment?.isSticker;
          const isVideoNote = message.attachment?.type === 'videoNote' || message.attachment?.isRound;

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
                <div
                  className="shrink-0 mb-0.5 w-8 h-8 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserProfileModalData({
                      id: message.senderId || '',
                      name: senderDisplayName,
                      avatar: avatarSrc,
                      thumbUrl: message.senderThumbUrl,
                      online: false,
                      isBot: false,
                    });
                  }}
                  title={`View ${senderDisplayName}'s Profile`}
                >
                  {isLastInGroup ? (
                    <Avatar
                      src={avatarSrc}
                      previewSrc={message.senderThumbUrl}
                      name={senderDisplayName}
                      color={senderColor}
                      size="sm"
                      className="w-8 h-8 text-[11px] shadow-xs"
                      peerId={message.senderId}
                    />
                  ) : (
                    <div className="w-8" />
                  )}
                </div>
              )}

              {/* Message Bubble Container */}
              <div
                className={`max-w-[85%] md:max-w-[70%] relative transition-all group ${
                  isSticker
                    ? 'bg-transparent border-transparent shadow-none p-0'
                    : isVideoNote
                    ? 'p-0 bg-transparent border-transparent shadow-none'
                    : `${isCompact ? 'py-1.5 px-2.5' : 'p-3'} shadow-xs ${cornerClass} border`
                }`}
                style={
                  isSticker || isVideoNote
                    ? {}
                    : {
                        backgroundColor: bubbleBg,
                        color: bubbleColor,
                        borderColor: 'var(--tf-border)',
                      }
                }
              >
                {/* Sender Name in Groups (Only on first message of cluster) */}
                {isGroupChat && !isOut && isFirstInGroup && !isSticker && (
                  <div
                    style={{ color: chatConfig.chatAccent || senderColor }}
                    className="text-xs font-semibold mb-1 cursor-pointer hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUserProfileModalData({
                        id: message.senderId || '',
                        name: senderDisplayName,
                        avatar: avatarSrc,
                        thumbUrl: message.senderThumbUrl,
                        online: false,
                        isBot: false,
                      });
                    }}
                    title={`View ${senderDisplayName}'s Profile`}
                  >
                    {senderDisplayName}
                  </div>
                )}

                {/* Forwarded Header */}
                {message.forwardFrom && !isSticker && (
                  <div
                    className="mb-1.5 text-xs font-semibold flex items-center gap-1.5 opacity-90 cursor-pointer"
                    style={{ color: chatConfig.chatAccent || 'var(--tf-primary)' }}
                    onClick={(e) => {
                      if (message.forwardFrom?.id) {
                        e.stopPropagation();
                        setUserProfileModalData({
                          id: message.forwardFrom.id,
                          name: message.forwardFrom.name,
                          avatar: message.forwardFrom.avatar,
                          thumbUrl: message.forwardFrom.thumbUrl,
                          online: false,
                          isBot: false,
                        });
                      }
                    }}
                  >
                    <span>↪ Forwarded from</span>
                    <span className="font-bold underline">{message.forwardFrom.name}</span>
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
                  <ChatMediaImage
                    attachment={message.attachment}
                    chatId={chat.id}
                    messageId={message.id}
                    onOpenMediaModal={onOpenMediaModal}
                  />
                )}

                {/* Attachment: Video */}
                {message.attachment?.type === 'video' && (
                  <ChatMediaVideo
                    attachment={message.attachment}
                    chatId={chat.id}
                    messageId={message.id}
                    onOpenMediaModal={onOpenMediaModal}
                  />
                )}

                {/* Attachment: Video Note (Telegram Round Video) */}
                {isVideoNote && message.attachment && (
                  <ChatMediaVideoNote
                    attachment={message.attachment}
                    chatId={chat.id}
                    messageId={message.id}
                  />
                )}

                {/* Attachment: GIF */}
                {(message.attachment?.type === 'gif' || message.attachment?.isGif) && message.attachment && (
                  <ChatMediaGif
                    attachment={message.attachment}
                    chatId={chat.id}
                    messageId={message.id}
                    onOpenMediaModal={onOpenMediaModal}
                  />
                )}

                {/* Attachment: Sticker */}
                {isSticker && message.attachment && (
                  <ChatMediaSticker
                    attachment={message.attachment}
                    chatId={chat.id}
                    messageId={message.id}
                    onOpenStickerPreview={(att, cId, mId) =>
                      setStickerPreviewData({ attachment: att, chatId: cId, messageId: mId })
                    }
                  />
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
                {(!isSticker || (message.text && !message.text.startsWith('⭐️') && !message.text.startsWith('Duck') && !message.text.startsWith('[Sticker]'))) && message.text && (
                  <div className={`whitespace-pre-wrap break-words leading-relaxed ${fontSizeClass}`}>
                    {message.text}
                  </div>
                )}

                {/* Inline Translation Display */}
                {translatedMessages[message.id] && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/10 text-xs italic opacity-90">
                    {translatedMessages[message.id]}
                  </div>
                )}

                {/* Footer: Timestamp & Checkmarks */}
                <div
                  className={`flex items-center justify-end gap-1 mt-1 text-[11px] select-none ${
                    isSticker
                      ? 'bg-black/40 text-white px-1.5 py-0.5 rounded-full w-fit ml-auto'
                      : 'opacity-70'
                  }`}
                >
                  <span>{formatTime(message.timestamp, message.rawDate)}</span>
                  {isOut && (
                    <span>
                      {message.status === 'read' ? (
                        <CheckCheck
                          size={14}
                          style={{ color: isSticker ? '#fff' : chatConfig.chatAccent || 'var(--tf-primary)' }}
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

        {/* Emoji / Stickers / GIFs Popover */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-16 left-2 sm:left-12 bg-white dark:bg-[#1f2d3d] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-3 z-30 w-80 max-w-[calc(100vw-24px)] animate-in fade-in slide-in-from-bottom-2 duration-150">
              {/* Tab Selector */}
              <div className="flex items-center gap-1 mb-2.5 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEmojiPickerTab('emoji')}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    emojiPickerTab === 'emoji'
                      ? 'bg-white dark:bg-teleforge-surface text-teleforge-primary dark:text-teleforge-cream shadow-xs'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Emoji
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiPickerTab('stickers')}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    emojiPickerTab === 'stickers'
                      ? 'bg-white dark:bg-teleforge-surface text-teleforge-primary dark:text-teleforge-cream shadow-xs'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  Stickers
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiPickerTab('gifs')}
                  className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    emojiPickerTab === 'gifs'
                      ? 'bg-white dark:bg-teleforge-surface text-teleforge-primary dark:text-teleforge-cream shadow-xs'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  GIFs
                </button>
              </div>

              {/* Emoji Content */}
              {emojiPickerTab === 'emoji' && (
                <div className="grid grid-cols-6 gap-2 text-xl max-h-56 overflow-y-auto pr-1">
                  {[
                    '😀', '😂', '🔥', '❤️', '👍', '👏', '🎉', '⚡', '🚀', '✨', '😍', '🤔',
                    '🙌', '💯', '👌', '😎', '🥳', '💡', '💎', '🌟', '💪', '🎯', '👑', '🌈',
                    '😭', '👀', '🤝', '🙏', '🫡', '🤤', '😴', '👋', '💀', '💖', '⭐', '☕',
                  ].map((emoji, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputText((prev) => prev + emoji);
                      }}
                      className="hover:scale-125 transition-transform p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-center cursor-pointer"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Stickers Content */}
              {emojiPickerTab === 'stickers' && (
                <div className="flex flex-col gap-2">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search stickers (e.g. duck, love, doge)..."
                      value={stickerSearch}
                      onChange={(e) => setStickerSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-100 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 placeholder-gray-400 border border-transparent focus:border-teleforge-primary rounded-xl outline-none transition-colors"
                    />
                    {stickerSearch && (
                      <button
                        type="button"
                        onClick={() => setStickerSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
                    {[
                      { id: 'my_stickers', label: `⭐ My Stickers${customStickers.length > 0 ? ` (${customStickers.length})` : ''}` },
                      { id: 'tg_packs', label: '📦 Telegram Packs' },
                      { id: 'all', label: 'All Curated' },
                      { id: 'duck', label: '🦆 Duck' },
                      { id: 'doge', label: '🐕 Doge' },
                      { id: 'cat', label: '😺 Cat' },
                      { id: 'reactions', label: '👍 Reactions' },
                      { id: 'fun', label: '🎉 Fun' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setStickerCategory(cat.id)}
                        className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors font-medium cursor-pointer ${
                          stickerCategory === cat.id
                            ? 'bg-teleforge-primary text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Stickers Grid */}
                  <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                    {/* Mode 1: User's Added Custom Stickers */}
                    {stickerCategory === 'my_stickers' && (
                      <>
                        {filteredCustomStickers.map((stk) => (
                          <div
                            key={stk.id}
                            className="group relative flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title={stk.name}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onSendMessage('', replyingTo || undefined, {
                                  type: 'sticker',
                                  url: stk.url,
                                  name: stk.name,
                                  isSticker: true,
                                  documentId: stk.documentId,
                                  accessHash: stk.accessHash,
                                  fileReference: stk.fileReference,
                                  stickerEmoji: stk.emoji,
                                  stickerSet: stk.stickerSet,
                                });
                                setReplyingTo(null);
                                setShowEmojiPicker(false);
                              }}
                              className="w-full flex flex-col items-center cursor-pointer"
                            >
                              <img
                                src={stk.url.startsWith('/stickers/') || stk.url.startsWith('/gifs/') ? '.' + stk.url : stk.url}
                                alt={stk.name}
                                className="w-14 h-14 object-contain filter drop-shadow-xs group-hover:scale-110 transition-transform"
                                loading="lazy"
                                onError={(e) => {
                                  if (stk.thumbUrl && e.currentTarget.src !== stk.thumbUrl) {
                                    e.currentTarget.src = stk.thumbUrl;
                                  }
                                }}
                              />
                              <span className="text-[10px] text-gray-500 truncate w-full text-center mt-1">
                                {stk.name}
                              </span>
                            </button>

                            {/* Quick Delete from My Stickers */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                stickerService.removeCustomSticker(stk.id);
                                showToast('Removed sticker', 'info');
                              }}
                              className="absolute top-0.5 right-0.5 p-1 rounded-full bg-black/60 hover:bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-all shadow-xs cursor-pointer"
                              title="Remove from My Stickers"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}

                        {filteredCustomStickers.length === 0 && (
                          <div className="col-span-4 py-8 text-center text-xs text-gray-400 flex flex-col items-center justify-center">
                            <Sparkles size={24} className="text-teleforge-primary mb-2 opacity-80" />
                            <p className="font-semibold text-gray-700 dark:text-gray-300">No Custom Stickers Yet</p>
                            <p className="text-[11px] mt-1 text-gray-400">
                              Tap any sticker in chat to save it directly to your stickers!
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Mode 2: Installed Telegram Sticker Sets */}
                    {stickerCategory === 'tg_packs' && (
                      <div className="col-span-4 flex flex-col gap-2">
                        {isLoadingStickerSets ? (
                          <div className="py-8 text-center text-xs text-teleforge-primary flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            <span>Loading your Telegram sticker packs...</span>
                          </div>
                        ) : telegramStickerSets.length === 0 ? (
                          <div className="py-8 text-center text-xs text-gray-400">
                            No installed Telegram sticker packs found on your account.
                          </div>
                        ) : (
                          <>
                            {/* Pack Tabs */}
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                              {telegramStickerSets.map((pack) => (
                                <button
                                  key={pack.id}
                                  type="button"
                                  onClick={() => {
                                    telegramApi.getStickerSet(pack).then((full) => {
                                      if (full) setActiveStickerSet(full);
                                    });
                                  }}
                                  className={`px-2 py-1 rounded-xl text-[11px] whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer ${
                                    activeStickerSet?.id === pack.id
                                      ? 'bg-teleforge-primary text-white font-medium'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                                  }`}
                                >
                                  {pack.thumbUrl && (
                                    <img src={pack.thumbUrl} alt="" className="w-3.5 h-3.5 object-contain" />
                                  )}
                                  <span>{pack.title}</span>
                                </button>
                              ))}
                            </div>

                            {/* Active Pack Stickers */}
                            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                              {(activeStickerSet?.stickers || []).map((stk) => (
                                <button
                                  key={stk.id}
                                  type="button"
                                  onClick={() => {
                                    onSendMessage('', replyingTo || undefined, {
                                      type: 'sticker',
                                      url: stk.thumbUrl || '',
                                      name: stk.emoji ? `Sticker ${stk.emoji}` : 'Telegram Sticker',
                                      isSticker: true,
                                      documentId: stk.documentId,
                                      accessHash: stk.accessHash,
                                      fileReference: stk.fileReference,
                                      stickerEmoji: stk.emoji,
                                    });
                                    setReplyingTo(null);
                                    setShowEmojiPicker(false);
                                  }}
                                  className="group flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                  title={stk.emoji || 'Sticker'}
                                >
                                  {stk.thumbUrl ? (
                                    <img
                                      src={stk.thumbUrl}
                                      alt=""
                                      className="w-14 h-14 object-contain filter drop-shadow-xs group-hover:scale-110 transition-transform"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="text-3xl">{stk.emoji || '⭐️'}</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Mode 3: Curated Stickers */}
                    {stickerCategory !== 'my_stickers' && stickerCategory !== 'tg_packs' && (
                      <>
                        {filteredStickers.map((stk) => (
                          <button
                            key={stk.id}
                            type="button"
                            onClick={() => {
                              onSendMessage('', replyingTo || undefined, {
                                type: 'sticker',
                                url: stk.url,
                                name: stk.name,
                                isSticker: true,
                              });
                              setReplyingTo(null);
                              setShowEmojiPicker(false);
                            }}
                            className="group flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title={stk.name}
                          >
                            <img
                              src={stk.url}
                              alt={stk.name}
                              className="w-14 h-14 object-contain filter drop-shadow-xs group-hover:scale-110 transition-transform"
                              loading="lazy"
                            />
                            <span className="text-[10px] text-gray-500 truncate w-full text-center mt-1">
                              {stk.name}
                            </span>
                          </button>
                        ))}
                        {filteredStickers.length === 0 && (
                          <div className="col-span-4 py-8 text-center text-xs text-gray-400">
                            No stickers found for &ldquo;{stickerSearch}&rdquo;
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* GIFs Content with Never-Ending Infinite Scroll */}
              {emojiPickerTab === 'gifs' && (
                <div className="flex flex-col gap-2">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search online GIFs (e.g. party, dance, cat)..."
                      value={gifSearch}
                      onChange={(e) => setGifSearch(e.target.value)}
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-gray-100 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 placeholder-gray-400 border border-transparent focus:border-teleforge-primary rounded-xl outline-none transition-colors"
                    />
                    {gifSearch && (
                      <button
                        type="button"
                        onClick={() => setGifSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Chips */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'trending', label: '🔥 Trending' },
                      { id: 'dance', label: '💃 Dance' },
                      { id: 'party', label: '🎉 Party' },
                      { id: 'reactions', label: '😂 Reactions' },
                      { id: 'love', label: '❤️ Love' },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setGifCategory(cat.id)}
                        className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors font-medium cursor-pointer ${
                          gifCategory === cat.id
                            ? 'bg-teleforge-primary text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Never-Ending GIFs Grid with Infinite Scroll */}
                  <div
                    onScroll={handleGifScroll}
                    className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1"
                  >
                    {/* 1. Live Online Telegram MTProto GIFs */}
                    {onlineGifs.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => {
                          onSendMessage('', replyingTo || undefined, {
                            type: 'gif',
                            url: gif.url || gif.thumbUrl,
                            name: gif.title,
                            isGif: true,
                            inlineResult: {
                              queryId: gif.queryId,
                              id: gif.id,
                            },
                          });
                          setReplyingTo(null);
                          setShowEmojiPicker(false);
                        }}
                        className="relative rounded-xl overflow-hidden hover:opacity-90 active:scale-98 transition-all group cursor-pointer bg-black/10 aspect-4/3"
                        title={gif.title}
                      >
                        <img
                          src={gif.thumbUrl || gif.url}
                          alt={gif.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                          <span className="text-[11px] text-white font-medium truncate">{gif.title}</span>
                        </div>
                      </button>
                    ))}

                    {/* 2. Curated Offline GIFs Fallback / Complement */}
                    {filteredGifs.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => {
                          onSendMessage('', replyingTo || undefined, {
                            type: 'gif',
                            url: gif.url,
                            name: gif.name,
                            isGif: true,
                          });
                          setReplyingTo(null);
                          setShowEmojiPicker(false);
                        }}
                        className="relative rounded-xl overflow-hidden hover:opacity-90 active:scale-98 transition-all group cursor-pointer bg-black/10 aspect-4/3"
                        title={gif.name}
                      >
                        <img
                          src={gif.url}
                          alt={gif.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                          <span className="text-[11px] text-white font-medium truncate">{gif.name}</span>
                        </div>
                      </button>
                    ))}

                    {/* Loading indicator for infinite scroll */}
                    {isGifsLoading && (
                      <div className="col-span-2 py-3 flex items-center justify-center gap-2 text-xs text-teleforge-primary font-medium">
                        <Loader2 size={16} className="animate-spin" />
                        <span>Loading more GIFs...</span>
                      </div>
                    )}

                    {!isGifsLoading && onlineGifs.length === 0 && filteredGifs.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-xs text-gray-400">
                        No GIFs found for &ldquo;{gifSearch}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              )}
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

      {/* User Profile Details Modal */}
      {userProfileModalData && (
        <UserProfileModal
          isOpen={Boolean(userProfileModalData)}
          onClose={() => setUserProfileModalData(null)}
          user={userProfileModalData}
          onOpenDirectChat={(userId, userName, userAvatar, userThumbUrl) => {
            setUserProfileModalData(null);
            if (onOpenDirectChat) {
              onOpenDirectChat(userId, userName, userAvatar, userThumbUrl);
            } else {
              onSelectChat?.(userId);
            }
          }}
          onOpenMediaModal={onOpenMediaModal}
        />
      )}

      {/* Telegram Sticker Preview & Add Sheet Modal */}
      {stickerPreviewData && (
        <StickerPreviewModal
          data={stickerPreviewData}
          onClose={() => setStickerPreviewData(null)}
          onSendMessage={onSendMessage}
        />
      )}
    </main>
  );
};
