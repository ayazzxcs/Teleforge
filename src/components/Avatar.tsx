import React, { useState, useEffect, useRef } from 'react';
import { avatarService } from '../services/avatarService';

interface AvatarProps {
  src?: string;
  previewSrc?: string;
  peerId?: string;
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

function extractPeerIdFromSrc(src?: string): string | null {
  if (!src) return null;
  try {
    const match = src.match(/[?&]id=([^&#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch (e) {}
  return null;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  previewSrc,
  peerId,
  name,
  color = '#2AABEE',
  size = 'md',
  className = '',
}) => {
  const effectivePeerId = peerId || extractPeerIdFromSrc(src) || undefined;
  
  // Check if src is already a direct high-res data URL or blob URL (> 500 bytes)
  const isDirectHighRes = Boolean(
    src &&
    (src.startsWith('blob:') || (src.startsWith('data:image/') && src.length > 500))
  );

  const [highResSrc, setHighResSrc] = useState<string | null>(() => {
    if (isDirectHighRes) return src!;
    if (effectivePeerId) {
      return avatarService.get(effectivePeerId);
    }
    return null;
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Subscribe to live high-res avatar updates
  useEffect(() => {
    if (isDirectHighRes && src) {
      setHighResSrc(src);
      return;
    }

    if (!effectivePeerId) {
      setHighResSrc(null);
      return;
    }

    // 1. Check if avatar is already in memory cache
    const existing = avatarService.get(effectivePeerId);
    if (existing) {
      setHighResSrc(existing);
    }

    // 2. Subscribe to background download updates
    const unsubscribe = avatarService.subscribe(effectivePeerId, (newUrl) => {
      if (newUrl) {
        setHighResSrc(newUrl);
        setHasError(false);
      }
    });

    // 3. Trigger load if not already loaded
    if (!existing) {
      avatarService.loadAvatar(effectivePeerId, size === 'xl' || size === 'lg').then((url) => {
        if (url) {
          setHighResSrc(url);
          setHasError(false);
        }
      });
    }

    return () => {
      unsubscribe();
    };
  }, [effectivePeerId, src, isDirectHighRes, size]);

  // Reset load state when image source changes
  const activeSrc = highResSrc || (isDirectHighRes ? src : undefined);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(!activeSrc && !previewSrc);
    if (activeSrc && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [activeSrc, previewSrc]);

  const getInitials = (text: string) => {
    if (!text) return '?';
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return text.slice(0, 2).toUpperCase();
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
  }[size];

  const isGradient = color.includes('from-') || color.includes('to-');
  const isClassColor = isGradient || color.startsWith('bg-');
  const bgStyle = isClassColor ? undefined : { backgroundColor: color };
  const bgClass = isGradient ? `bg-gradient-to-br ${color}` : isClassColor ? color : '';

  const hasAnyPhoto = Boolean(activeSrc || previewSrc);

  if (!hasAnyPhoto || (hasError && !previewSrc)) {
    return (
      <div
        style={bgStyle}
        className={`${sizeClasses} ${bgClass} rounded-full flex items-center justify-center font-bold text-white shadow-xs shrink-0 select-none ${className}`}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      style={bgStyle}
      className={`relative ${sizeClasses} ${bgClass} rounded-full shrink-0 select-none overflow-hidden flex items-center justify-center font-bold text-white shadow-xs ${className}`}
    >
      {/* Fallback colored initials behind image */}
      <span>{getInitials(name)}</span>

      {/* Low-res preview thumbnail (shown while high-res loads) */}
      {previewSrc && !isLoaded && (
        <img
          src={previewSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover rounded-full"
        />
      )}

      {/* Real High-Resolution Avatar Image */}
      {activeSrc && !hasError && (
        <img
          ref={imgRef}
          src={activeSrc}
          alt={name}
          decoding="async"
          onLoad={() => {
            setIsLoaded(true);
            setHasError(false);
          }}
          onError={() => {
            setHasError(true);
          }}
          className={`absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
