import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  duration?: string;
  isOutgoing?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ duration = '0:18', isOutgoing = false }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 5;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => {
    if (progress >= 100) setProgress(0);
    setIsPlaying(!isPlaying);
  };

  // 24 waveform bar heights for realistic Telegram voice note styling
  const bars = [12, 20, 16, 28, 34, 18, 22, 38, 26, 30, 20, 14, 24, 32, 18, 22, 36, 28, 16, 20, 12, 16, 22, 14];

  return (
    <div className="flex items-center gap-3 py-1 min-w-[220px]">
      <button
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
          isOutgoing
            ? 'bg-telegram-primary text-white hover:bg-telegram-hover'
            : 'bg-telegram-primary text-white hover:bg-telegram-hover'
        }`}
        title={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col justify-center">
        {/* Waveform bars */}
        <div className="flex items-center gap-[2px] h-8 cursor-pointer" onClick={() => setProgress((p) => (p + 25) % 100)}>
          {bars.map((height, i) => {
            const barProgress = (i / bars.length) * 100;
            const isFilled = barProgress <= progress;
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className={`w-[3px] rounded-full transition-colors ${
                  isFilled
                    ? 'bg-telegram-primary'
                    : isOutgoing
                    ? 'bg-emerald-300 dark:bg-sky-400/40'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            );
          })}
        </div>
        <div className="flex justify-between items-center text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          <span>{isPlaying ? `0:${Math.floor((progress / 100) * 18).toString().padStart(2, '0')}` : duration}</span>
          <span>2X</span>
        </div>
      </div>
    </div>
  );
};
