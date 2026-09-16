import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Info,
  Maximize,
  Minimize,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Attachment } from '../types';
import { showToast } from './Toast';

interface MediaModalProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({ attachment, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [immersive, setImmersive] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setZoom(1);
    setImmersive(false);
    setShowInfo(false);
  }, [attachment]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 3));
      if (e.key === '-') setZoom((z) => Math.max(z - 0.25, 0.5));
      if (e.key === '0') setZoom(1);
      if (e.key === 'i' || e.key === 'I') setShowInfo((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[92vh] flex flex-col items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Actions Bar (Hidden in Immersive Mode) */}
        <div
          className={`w-full flex justify-between items-center text-white px-4 py-2.5 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 transition-all duration-200 z-20 ${
            immersive ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-xs sm:text-sm font-semibold truncate max-w-xs sm:max-w-md">
              {attachment.name || 'Photo Viewer'}
            </div>
            {attachment.size && (
              <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">({attachment.size})</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Zoom Controls */}
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-white"
              title="Zoom Out (-)"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono text-gray-300 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-white"
              title="Zoom In (+)"
            >
              <ZoomIn size={16} />
            </button>
            {zoom !== 1 && (
              <button
                onClick={() => setZoom(1)}
                className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-gray-400 hover:text-white"
                title="Reset Zoom (0)"
              >
                <RotateCcw size={14} />
              </button>
            )}

            <div className="w-[1px] h-4 bg-white/20 mx-1" />

            {/* Info Toggle */}
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`p-1.5 rounded-xl transition-colors ${
                showInfo ? 'bg-white/30 text-white' : 'hover:bg-white/20 text-gray-300'
              }`}
              title="Toggle Media Info (I)"
            >
              <Info size={16} />
            </button>

            {/* Download */}
            <a
              href={attachment.url}
              download={attachment.name || 'teleforge-media.jpg'}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-white"
              title="Download"
            >
              <Download size={16} />
            </a>

            {/* Copy Link */}
            <button
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(attachment.url);
                  showToast('Media link copied to clipboard', 'success');
                }
              }}
              className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-white"
              title="Copy link"
            >
              <Share2 size={16} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-red-500/60 transition-colors text-white ml-1"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Media Canvas (Click to Toggle Immersive Mode) */}
        <div
          onClick={() => setImmersive(!immersive)}
          className="flex-1 w-full flex items-center justify-center overflow-hidden cursor-zoom-in relative p-2"
        >
          {attachment.type === 'image' && (
            <img
              src={attachment.url || attachment.thumbUrl}
              alt={attachment.name || 'Preview'}
              style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
              className="max-h-[82vh] max-w-[95%] w-auto object-contain rounded-xl shadow-2xl transition-transform"
            />
          )}

          {attachment.type === 'video' && (
            <video
              src={attachment.url}
              poster={attachment.thumbUrl}
              controls
              autoPlay
              playsInline
              style={{ transform: `scale(${zoom})`, transition: 'transform 0.15s ease-out' }}
              className="max-h-[82vh] max-w-[95%] w-auto object-contain rounded-xl shadow-2xl transition-transform"
            />
          )}

          {/* Info Card Overlay */}
          {showInfo && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 left-4 p-4 rounded-2xl bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs max-w-xs shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <div className="font-bold text-sm mb-1">{attachment.name || 'Media Item'}</div>
              <div className="text-gray-300 space-y-1 text-[11px]">
                <div>Type: <span className="font-mono uppercase">{attachment.type}</span></div>
                {attachment.size && <div>Size: <span className="font-mono">{attachment.size}</span></div>}
                <div>Source: <span className="text-gray-400">Telegram MTProto 2.0</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Hint Bar */}
        <div
          className={`text-[11px] text-gray-400 flex items-center gap-3 transition-opacity duration-200 ${
            immersive ? 'opacity-0 pointer-events-none' : 'opacity-70'
          }`}
        >
          <span>Click media to toggle immersive view</span>
          <span>&bull;</span>
          <span>+/- to zoom</span>
          <span>&bull;</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
};
