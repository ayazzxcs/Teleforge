import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  Languages,
  RotateCcw,
  Check,
  ChevronUp,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { downloadFileToDevice } from '../utils/fileDownloader';

export interface TeleForgeVideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  maxHeightClass?: string;
  initialDuration?: number;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export interface AudioTrackItem {
  id: string;
  index: number;
  label: string;
  language: string;
  enabled: boolean;
}

// Map common ISO 639-1 / 639-2 language codes to friendly display names
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  hi: 'Hindi',
  hin: 'Hindi',
  es: 'Spanish',
  spa: 'Spanish',
  ru: 'Russian',
  rus: 'Russian',
  ar: 'Arabic',
  ara: 'Arabic',
  zh: 'Chinese',
  zho: 'Chinese',
  chi: 'Chinese',
  fr: 'French',
  fra: 'French',
  fre: 'French',
  de: 'German',
  deu: 'German',
  ger: 'German',
  it: 'Italian',
  ita: 'Italian',
  pt: 'Portuguese',
  por: 'Portuguese',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  tr: 'Turkish',
  tur: 'Turkish',
  fa: 'Persian',
  fas: 'Persian',
  per: 'Persian',
  ur: 'Urdu',
  urd: 'Urdu',
  id: 'Indonesian',
  ind: 'Indonesian',
  ta: 'Tamil',
  tam: 'Tamil',
  te: 'Telugu',
  tel: 'Telugu',
  bn: 'Bengali',
  ben: 'Bengali',
  vi: 'Vietnamese',
  vie: 'Vietnamese',
  uk: 'Ukrainian',
  ukr: 'Ukrainian',
  pl: 'Polish',
  pol: 'Polish',
};

function formatLanguageLabel(track: { label?: string; language?: string; codec?: string; index: number }): string {
  const langKey = (track.language || '').toLowerCase().trim();
  const knownName = LANGUAGE_NAMES[langKey];
  const codecClean = (track.codec || '').replace('A_', '').replace('MPEG/L3', 'MP3');
  const trackNum = `Track ${track.index + 1}`;

  // If label is a clean custom title (ignore bot/channel watermarks like @channel)
  const cleanLabel = track.label && !track.label.trim().startsWith('@') ? track.label.trim() : '';

  if (cleanLabel && knownName) {
    return `${cleanLabel} • ${knownName}`;
  }
  if (knownName && codecClean) {
    return `${knownName} • ${codecClean} (${trackNum})`;
  }
  if (knownName) {
    return `${knownName} (${trackNum})`;
  }
  if (cleanLabel) {
    return `${cleanLabel} (${trackNum})`;
  }
  if (codecClean) {
    return `${codecClean} Audio (${trackNum})`;
  }
  if (track.language) {
    return `Audio: ${track.language.toUpperCase()} (${trackNum})`;
  }
  return `Audio Track ${track.index + 1}`;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    const remMins = mins % 60;
    return `${hrs}:${remMins < 10 ? '0' : ''}${remMins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const TeleForgeVideoPlayer: React.FC<TeleForgeVideoPlayerProps> = ({
  src,
  poster,
  title,
  autoPlay = false,
  className = '',
  maxHeightClass = 'max-h-[80vh]',
  initialDuration = 0,
  onFullscreenChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercent, setBufferedPercent] = useState(0);

  const updateBuffered = useCallback(() => {
    const v = videoRef.current;
    if (v && v.buffered.length > 0) {
      try {
        const end = v.buffered.end(v.buffered.length - 1);
        const total = v.duration || duration || 0;
        if (total > 0) {
          setBufferedPercent(Math.min(100, Math.max(0, (end / total) * 100)));
        }
      } catch (e) {}
    }
  }, [duration]);

  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  useEffect(() => {
    setHasError(false);
    if (autoPlay && videoRef.current) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      });
    }
  }, [src, autoPlay]);

  // Audio track switching state
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);

  // Dual-channel stereo mode (Stereo, Left-only, Right-only for dual language audio rips)
  const [channelMode, setChannelMode] = useState<'both' | 'left' | 'right'>('both');
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);

  const controlsTimeoutRef = useRef<any>(null);

  // Auto-transcode fallback: if playback fails, automatically retry with &transcode=1 (server-side H.264 transcode)
  const [useTranscode, setUseTranscode] = useState(false);
  const transcodeAttemptedRef = useRef(false);
  const probedSrcRef = useRef<string>('');

  // The actual src fed to <video>: adds active audioTrack and &transcode=1 if auto-fallback kicked in
  const activeSrc = (() => {
    let url = src;
    if (selectedTrackIndex > 0) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url.replace(/[?&]audioTrack=\d+/, '')}${sep}audioTrack=${selectedTrackIndex}`;
    }
    if (useTranscode) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url.replace(/[?&]transcode=1/, '')}${sep}transcode=1`;
    }
    return url;
  })();

  // Reset transcode state when src changes
  useEffect(() => {
    setUseTranscode(false);
    transcodeAttemptedRef.current = false;
    setSelectedTrackIndex(0);
  }, [src]);

  // When activeSrc changes (audioTrack switched or transcode fallback enabled), re-load and continue playing
  const prevActiveSrcRef = useRef(activeSrc);
  useEffect(() => {
    if (prevActiveSrcRef.current !== activeSrc) {
      prevActiveSrcRef.current = activeSrc;
      const video = videoRef.current;
      if (video) {
        const wasPlaying = isPlaying;
        const currentPos = currentTime;
        video.load();
        if (currentPos > 0) {
          video.currentTime = currentPos;
        }
        if (wasPlaying || autoPlay) {
          video.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }
    }
  }, [activeSrc, isPlaying, currentTime, autoPlay]);

  // Inspect and extract audio tracks from HTMLMediaElement or dedicated probe endpoint
  const inspectAudioTracks = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const rawList = (video as any).audioTracks;
    if (rawList && rawList.length > 1) {
      const parsed: AudioTrackItem[] = [];
      let activeIdx = 0;
      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i];
        const isEnabled = Boolean(item.enabled);
        if (isEnabled) activeIdx = i;
        parsed.push({
          id: item.id || `track-${i}`,
          index: i,
          label: formatLanguageLabel({ label: item.label, language: item.language, index: i }),
          language: item.language || '',
          enabled: isEnabled,
        });
      }
      setAudioTracks(parsed);
      setSelectedTrackIndex(activeIdx);
      return;
    }

    // Query backend audio tracks endpoint (reads first 256KB once, 0ms on cache)
    if (src && src.includes('/api/telegram/media') && probedSrcRef.current !== src) {
      probedSrcRef.current = src;
      const cleanUrl = src.replace(/[?&](?:audioTrack|transcode|compat)=\w+/g, '');
      const tracksUrl = cleanUrl.replace('/api/telegram/media', '/api/telegram/media/tracks');
      fetch(tracksUrl)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.tracks && data.tracks.length > 0) {
            setAudioTracks(data.tracks);
          }
        })
        .catch(() => {});
    }
  }, [src]);

  useEffect(() => {
    inspectAudioTracks();
  }, [src, inspectAudioTracks]);

  // Watchdog: detect if audio is playing but 0 video frames are decoded (unsupported video codec like HEVC in Chromium)
  useEffect(() => {
    if (!isPlaying || useTranscode) return;
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || v.currentTime < 1.2) return;

      const decoded = (v as any).webkitDecodedFrameCount !== undefined
        ? (v as any).webkitDecodedFrameCount
        : v.getVideoPlaybackQuality?.()?.totalVideoFrames;

      // If video has played past 1.2s but decoded 0 frames (or videoWidth is 0)
      if (
        (decoded === 0 || (v.videoWidth === 0 && v.videoHeight === 0)) &&
        !transcodeAttemptedRef.current &&
        src.includes('/api/telegram/media')
      ) {
        console.warn('[TeleForgeVideoPlayer] Audio playing but 0 video frames decoded (e.g. HEVC). Auto-enabling H.264 transcode...');
        transcodeAttemptedRef.current = true;
        setUseTranscode(true);
      }
    }, 800);

    return () => clearInterval(timer);
  }, [isPlaying, useTranscode, src]);

  // Switch active audio track
  const handleSelectAudioTrack = (index: number) => {
    setSelectedTrackIndex(index);
    setAudioTracks((prev) =>
      prev.map((t, i) => ({ ...t, enabled: i === index }))
    );

    const video = videoRef.current;
    if (video) {
      const rawList = (video as any).audioTracks;
      if (rawList && rawList.length > 1) {
        for (let i = 0; i < rawList.length; i++) {
          rawList[i].enabled = i === index;
        }
      }
    }
    setShowLanguageMenu(false);
  };

  // Switch stereo balance for dual-audio clips (left vs right channel)
  const handleSelectChannelMode = (mode: 'both' | 'left' | 'right') => {
    setChannelMode(mode);
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!webAudioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          webAudioCtxRef.current = ctx;
          const source = ctx.createMediaElementSource(video);
          const panner = ctx.createStereoPanner();
          pannerNodeRef.current = panner;
          source.connect(panner);
          panner.connect(ctx.destination);
        }
      }

      if (webAudioCtxRef.current?.state === 'suspended') {
        webAudioCtxRef.current.resume();
      }

      if (pannerNodeRef.current) {
        if (mode === 'left') {
          pannerNodeRef.current.pan.setValueAtTime(-1, webAudioCtxRef.current?.currentTime || 0);
        } else if (mode === 'right') {
          pannerNodeRef.current.pan.setValueAtTime(1, webAudioCtxRef.current?.currentTime || 0);
        } else {
          pannerNodeRef.current.pan.setValueAtTime(0, webAudioCtxRef.current?.currentTime || 0);
        }
      }
    } catch (err) {
      console.warn('[TeleForgeVideoPlayer] Stereo pan adjustment unavailable:', err);
    }
    setShowLanguageMenu(false);
  };

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Scrub bar click / seek
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newTime = (clickX / rect.width) * duration;
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 1;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  // Change Playback Speed
  const handleSelectRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  // Toggle Fullscreen (Native Container Fullscreen API + Android Immersive Bridge)
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const isCurrentlyFs = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      isFullscreen
    );

    if (!isCurrentlyFs) {
      try {
        (window as any).TeleForgeBridge?.setFullscreen?.(true);
      } catch (e) {}

      if (container) {
        if (typeof container.requestFullscreen === 'function') {
          container.requestFullscreen().catch(() => {
            setIsFullscreen(true);
          });
        } else if (typeof (container as any).webkitRequestFullscreen === 'function') {
          try {
            (container as any).webkitRequestFullscreen();
          } catch (e) {
            setIsFullscreen(true);
          }
        } else if (videoRef.current && typeof (videoRef.current as any).webkitEnterFullscreen === 'function') {
          try {
            (videoRef.current as any).webkitEnterFullscreen();
          } catch (e) {
            setIsFullscreen(true);
          }
        } else {
          setIsFullscreen(true);
        }
      } else {
        setIsFullscreen(true);
      }
    } else {
      try {
        (window as any).TeleForgeBridge?.setFullscreen?.(false);
      } catch (e) {}

      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else if ((document as any).webkitFullscreenElement) {
        try { (document as any).webkitExitFullscreen?.(); } catch (e) {}
      } else if (videoRef.current && typeof (videoRef.current as any).webkitExitFullscreen === 'function') {
        try { (videoRef.current as any).webkitExitFullscreen(); } catch (e) {}
      }
      setIsFullscreen(false);
    }
  };

  // Handle Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = Boolean(
        document.fullscreenElement === containerRef.current ||
        (document as any).webkitFullscreenElement === containerRef.current ||
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );
      setIsFullscreen(isNativeFs);
      if (!isNativeFs) {
        try {
          (window as any).TeleForgeBridge?.setFullscreen?.(false);
        } catch (e) {}
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // Auto-hide controls timer
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!showLanguageMenu && !showSpeedMenu) {
          setShowControls(false);
        }
      }, 2600);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isPlaying]);

  const currentTrackLabel = audioTracks.length > 0
    ? audioTracks[selectedTrackIndex]?.label || `Audio Track ${selectedTrackIndex + 1}`
    : channelMode !== 'both'
      ? `${channelMode === 'left' ? 'Audio 1 (L)' : 'Audio 2 (R)'}`
      : 'Audio';

  const playerContent = (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
      className={`relative group bg-black overflow-hidden flex items-center justify-center select-none ${className} ${
        isFullscreen
          ? 'fixed inset-0 z-[999999] w-screen h-screen max-w-none max-h-none rounded-none'
          : 'w-full rounded-2xl'
      }`}
    >
      {/* Top right floating full screen toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFullscreen();
        }}
        className={`absolute top-3 right-3 z-30 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 shadow-xl transition-opacity duration-200 ${
          showControls || isFullscreen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize size={18} /> : <Maximize size={16} />}
      </button>

      {/* Native Video Element */}
      <video
        ref={videoRef}
        src={activeSrc}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        onClick={togglePlay}
        onWaiting={() => setIsBuffering(true)}
        onLoadStart={() => setIsBuffering(true)}
        onSeeking={() => setIsBuffering(true)}
        onSeeked={() => {
          setIsBuffering(false);
          updateBuffered();
        }}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
          updateBuffered();
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            const d = videoRef.current.duration;
            if (isFinite(d) && d > 0) {
              setDuration(d);
            }
            inspectAudioTracks();
            updateBuffered();
          }
        }}
        onProgress={updateBuffered}
        onCanPlay={() => {
          setIsBuffering(false);
          inspectAudioTracks();
          updateBuffered();
        }}
        onPlay={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onPause={() => {
          setIsBuffering(false);
          setIsPlaying(false);
        }}
        onEnded={() => {
          setIsBuffering(false);
          setIsPlaying(false);
        }}
        onError={(e) => {
          setIsBuffering(false);
          const err = videoRef.current?.error;
          if (err && err.code === 1) {
            // Normal user/browser abort, do not show fatal error overlay
            return;
          }
          console.warn('[TeleForgeVideoPlayer] Playback error on src:', activeSrc, err || e);

          // Auto-fallback: if we haven't tried transcode yet and src is a Telegram stream URL, retry with server-side transcode
          if (!transcodeAttemptedRef.current && src.includes('/api/telegram/media') && !useTranscode) {
            console.log('[TeleForgeVideoPlayer] Auto-retrying with server-side H.264 transcode...');
            transcodeAttemptedRef.current = true;
            setUseTranscode(true);
            setHasError(false);
            return;
          }

          setHasError(true);
          setIsPlaying(false);
        }}
        className={`w-full object-contain ${isFullscreen ? 'h-full max-h-screen' : maxHeightClass}`}
      />

      {/* Buffering Spinner */}
      {isBuffering && !hasError && (
        <div className="absolute z-25 pointer-events-none flex flex-col items-center justify-center gap-2 bg-black/60 px-4 py-3 rounded-2xl backdrop-blur-md border border-white/10 shadow-2xl">
          <div className="w-8 h-8 border-3 border-white/20 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-[11px] font-medium text-white/90 tracking-wide">Buffering...</span>
        </div>
      )}

      {/* Error Fallback Overlay */}
      {hasError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 bg-black/90 text-white p-4 text-center">
          <AlertTriangle size={28} className="text-amber-400" />
          <div className="text-xs sm:text-sm font-semibold text-red-400">The media codec or format could not be decoded</div>
          <div className="text-[11px] text-gray-300 max-w-sm leading-relaxed">
            You can retry or download the video directly.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {/* Play in Compatibility Mode: forces server-side H.264 transcode */}
            {!useTranscode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setHasError(false);
                  transcodeAttemptedRef.current = true;
                  setUseTranscode(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shadow-md"
                title="Re-encode on server to universal H.264 for maximum compatibility"
              >
                <Settings size={14} /> Play in Compatibility Mode
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHasError(false);
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(() => {});
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw size={14} /> Retry
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadFileToDevice(src, title || 'teleforge-video.mp4', 'video/mp4');
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <Download size={14} /> Download
            </button>
          </div>
        </div>
      )}

      {/* Center Big Play Button (when paused and no error) */}
      {!isPlaying && !hasError && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="absolute z-20 w-16 h-16 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-transform transform hover:scale-110 shadow-2xl border border-white/20"
          title="Play video"
        >
          <Play className="w-8 h-8 fill-white ml-1" />
        </button>
      )}

      {/* Title Bar (top overlay) */}
      {title && (
        <div
          className={`absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent text-white text-xs sm:text-sm font-medium truncate pointer-events-none transition-opacity duration-300 z-20 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {title}
        </div>
      )}

      {/* Video Controls Bar (bottom overlay) */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-6 flex flex-col gap-2 transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrub Progress Bar */}
        <div
          ref={progressBarRef}
          onClick={handleSeek}
          className="w-full h-1.5 hover:h-2.5 bg-white/25 hover:bg-white/35 rounded-full cursor-pointer relative transition-all duration-150 group/bar flex items-center"
        >
          {/* Buffering Progress Bar */}
          <div
            className="absolute left-0 top-0 h-full bg-white/30 rounded-full pointer-events-none transition-all duration-200"
            style={{ width: `${bufferedPercent}%` }}
          />
          {/* Played Progress Bar */}
          <div
            className="h-full bg-blue-500 rounded-full relative z-10"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Buttons and status row */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Left: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={18} className="fill-white" /> : <Play size={18} className="fill-white" />}
            </button>

            {/* Volume control */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 sm:w-20 h-1 bg-white/30 accent-blue-500 rounded-lg cursor-pointer hidden md:inline-block transition-all"
                title="Volume"
              />
            </div>

            {/* Time readout */}
            <div className="text-[11px] sm:text-xs font-mono text-gray-200 shrink-0">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Audio Languages Switcher, Speed, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-1.5 relative shrink-0">
            {/* Audio Language Switcher */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  setShowLanguageMenu(!showLanguageMenu);
                  setShowSpeedMenu(false);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  audioTracks.length > 1 || channelMode !== 'both'
                    ? 'bg-blue-600/80 border-blue-400 text-white'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-gray-200'
                }`}
                title="Switch Audio Language"
              >
                <Languages size={15} />
                <span className="hidden sm:inline max-w-[80px] truncate">{currentTrackLabel}</span>
                {audioTracks.length > 1 && (
                  <span className="ml-0.5 px-1 py-0.2 rounded bg-blue-500 text-[10px] font-bold">
                    {audioTracks.length}
                  </span>
                )}
              </button>

              {/* Language Selection Popover */}
              {showLanguageMenu && (
                <div
                  className="absolute bottom-full right-0 mb-2 w-56 p-2 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/20 shadow-2xl text-xs text-white z-30 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                    <span>Audio Languages</span>
                    <Languages size={13} />
                  </div>

                  {/* Multi-Stream Audio Tracks */}
                  {audioTracks.length > 1 ? (
                    <div className="max-h-40 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {audioTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => handleSelectAudioTrack(track.index)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            selectedTrackIndex === track.index
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'hover:bg-white/10 text-gray-200'
                          }`}
                        >
                          <span className="truncate">{track.label}</span>
                          {selectedTrackIndex === track.index && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <button
                        onClick={() => handleSelectAudioTrack(0)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                          selectedTrackIndex === 0
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'hover:bg-white/10 text-gray-200'
                        }`}
                      >
                        <span className="truncate">
                          {audioTracks[0]?.label || 'Audio Track 1 (Primary)'}
                        </span>
                        {selectedTrackIndex === 0 && <Check size={14} />}
                      </button>
                      <button
                        onClick={() => handleSelectAudioTrack(1)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                          selectedTrackIndex === 1
                            ? 'bg-blue-600 text-white font-semibold'
                            : 'hover:bg-white/10 text-gray-200'
                        }`}
                      >
                        <span className="truncate">Audio Track 2 (Alternate Stream)</span>
                        {selectedTrackIndex === 1 && <Check size={14} />}
                      </button>
                    </div>
                  )}

                  {/* Dual-Audio Channel Separation (Left / Right channel audio rips) */}
                  <div className="mt-2 pt-1.5 border-t border-white/10">
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Dual-Audio Channel Mode
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      <button
                        onClick={() => handleSelectChannelMode('both')}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-medium text-center truncate transition-colors ${
                          channelMode === 'both' ? 'bg-blue-600 text-white shadow' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                        }`}
                        title="Stereo (Play both channels)"
                      >
                        Stereo
                      </button>
                      <button
                        onClick={() => handleSelectChannelMode('left')}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-medium text-center truncate transition-colors ${
                          channelMode === 'left' ? 'bg-blue-600 text-white shadow' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                        }`}
                        title="Audio 1 (Left Channel)"
                      >
                        Audio 1 (L)
                      </button>
                      <button
                        onClick={() => handleSelectChannelMode('right')}
                        className={`py-1.5 px-1 rounded-lg text-[10px] font-medium text-center truncate transition-colors ${
                          channelMode === 'right' ? 'bg-blue-600 text-white shadow' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                        }`}
                        title="Audio 2 (Right Channel)"
                      >
                        Audio 2 (R)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Playback Speed Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowLanguageMenu(false);
                }}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-mono transition-colors"
                title="Playback speed"
              >
                {playbackRate}x
              </button>

              {showSpeedMenu && (
                <div
                  className="absolute bottom-full right-0 mb-2 w-24 p-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/20 shadow-2xl text-xs text-white z-30 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handleSelectRate(rate)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded-md text-left transition-colors ${
                        playbackRate === rate ? 'bg-blue-600 text-white font-semibold' : 'hover:bg-white/10 text-gray-200'
                      }`}
                    >
                      <span>{rate}x</span>
                      {playbackRate === rate && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Compatibility Mode / H.264 Toggle */}
            {src.includes('/api/telegram/media') && (
              <button
                onClick={() => {
                  setUseTranscode(!useTranscode);
                  transcodeAttemptedRef.current = true;
                }}
                className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold transition-colors border ${
                  useTranscode
                    ? 'bg-amber-600 border-amber-400 text-white shadow-xs'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-gray-300'
                }`}
                title={useTranscode ? 'Compatibility Mode: Active (H.264)' : 'Video not showing? Click to switch to H.264 Compatibility Mode'}
              >
                {useTranscode ? 'H.264' : 'HQ'}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadFileToDevice(src, title || 'teleforge-video.mp4', 'video/mp4');
              }}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="Download Video"
            >
              <Download size={18} />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return playerContent;
};
