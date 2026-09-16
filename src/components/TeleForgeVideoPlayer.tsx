import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Languages,
  RotateCcw,
  Check,
  ChevronUp,
  Settings,
} from 'lucide-react';

export interface TeleForgeVideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  maxHeightClass?: string;
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

function formatLanguageLabel(track: { label?: string; language?: string; index: number }): string {
  const langKey = (track.language || '').toLowerCase().trim();
  const knownName = LANGUAGE_NAMES[langKey];
  if (track.label && track.label.trim()) {
    return track.label;
  }
  if (knownName) {
    return `${knownName} (${langKey.toUpperCase()})`;
  }
  if (track.language) {
    return `Audio: ${track.language.toUpperCase()}`;
  }
  return `Audio Track ${track.index + 1}`;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Audio track switching state
  const [audioTracks, setAudioTracks] = useState<AudioTrackItem[]>([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number>(0);

  // Dual-channel stereo mode (Stereo, Left-only, Right-only for dual language audio rips)
  const [channelMode, setChannelMode] = useState<'both' | 'left' | 'right'>('both');
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);

  const controlsTimeoutRef = useRef<any>(null);

  // Inspect and extract audio tracks from HTMLMediaElement
  const inspectAudioTracks = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const rawList = (video as any).audioTracks;
    if (rawList && rawList.length > 0) {
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
    }
  }, []);

  // Switch active audio track
  const handleSelectAudioTrack = (index: number) => {
    const video = videoRef.current;
    if (!video) return;
    const rawList = (video as any).audioTracks;
    if (rawList && rawList.length > 0) {
      for (let i = 0; i < rawList.length; i++) {
        rawList[i].enabled = i === index;
      }
      setSelectedTrackIndex(index);
      setAudioTracks((prev) =>
        prev.map((t, i) => ({ ...t, enabled: i === index }))
      );
    } else {
      setSelectedTrackIndex(index);
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

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Handle Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

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
    ? audioTracks[selectedTrackIndex]?.label || `Track ${selectedTrackIndex + 1}`
    : channelMode !== 'both'
      ? `${channelMode === 'left' ? 'Left Audio' : 'Right Audio'}`
      : 'Audio';

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
      className={`relative group bg-black overflow-hidden flex items-center justify-center select-none ${className} ${
        isFullscreen ? 'w-screen h-screen' : 'w-full rounded-2xl'
      }`}
    >
      {/* Native Video Element */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        onClick={togglePlay}
        onTimeUpdate={() => {
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration || 0);
            inspectAudioTracks();
          }
        }}
        onCanPlay={inspectAudioTracks}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        className={`w-full object-contain ${isFullscreen ? 'h-full max-h-screen' : maxHeightClass}`}
      />

      {/* Center Big Play Button (when paused) */}
      {!isPlaying && (
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
          <div
            className="h-full bg-blue-500 rounded-full relative"
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
                className="w-14 sm:w-20 h-1 bg-white/30 accent-blue-500 rounded-lg cursor-pointer hidden group-hover/vol:inline-block sm:inline-block transition-all"
                title="Volume"
              />
            </div>

            {/* Time readout */}
            <div className="text-[11px] sm:text-xs font-mono text-gray-200">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Audio Languages Switcher, Speed, Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2 relative">
            {/* Audio Language Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowLanguageMenu(!showLanguageMenu);
                  setShowSpeedMenu(false);
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  audioTracks.length > 1 || channelMode !== 'both'
                    ? 'bg-blue-600/80 border-blue-400 text-white'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-gray-200'
                }`}
                title="Switch Audio Language"
              >
                <Languages size={15} />
                <span className="hidden xs:inline max-w-[90px] truncate">{currentTrackLabel}</span>
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

                  {/* Detected Multi-Stream Audio Tracks */}
                  {audioTracks.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-0.5 custom-scrollbar">
                      {audioTracks.map((track) => (
                        <button
                          key={track.id}
                          onClick={() => handleSelectAudioTrack(track.index)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors ${
                            track.enabled || selectedTrackIndex === track.index
                              ? 'bg-blue-600 text-white font-semibold'
                              : 'hover:bg-white/10 text-gray-200'
                          }`}
                        >
                          <span className="truncate">{track.label}</span>
                          {(track.enabled || selectedTrackIndex === track.index) && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-1 text-[11px] text-gray-400">
                      Single audio track container
                    </div>
                  )}

                  {/* Dual-Audio Channel Separation (Left / Right channel audio rips) */}
                  <div className="mt-2 pt-1 border-t border-white/10">
                    <div className="px-2 py-0.5 text-[10px] font-semibold text-gray-400 uppercase">
                      Channel Balance
                    </div>
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      <button
                        onClick={() => handleSelectChannelMode('both')}
                        className={`py-1 px-1.5 rounded text-[10px] font-medium text-center truncate ${
                          channelMode === 'both' ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        Stereo
                      </button>
                      <button
                        onClick={() => handleSelectChannelMode('left')}
                        className={`py-1 px-1.5 rounded text-[10px] font-medium text-center truncate ${
                          channelMode === 'left' ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20'
                        }`}
                        title="Left audio channel only (Track 1)"
                      >
                        Left (L)
                      </button>
                      <button
                        onClick={() => handleSelectChannelMode('right')}
                        className={`py-1 px-1.5 rounded text-[10px] font-medium text-center truncate ${
                          channelMode === 'right' ? 'bg-blue-600 text-white' : 'bg-white/10 hover:bg-white/20'
                        }`}
                        title="Right audio channel only (Track 2)"
                      >
                        Right (R)
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

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
