import React, { useState, useEffect, useRef } from 'react';
import { avatarService } from '../services/avatarService';
import { resolveApiUrl, isAndroidApp } from '../services/telegramApi';

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
  
  // Small data URLs (< 8KB) are stripped thumbnails from Telegram metadata — blurry previews.
  // Large data URLs (>= 8KB), blob URLs, and http URLs are real high-res images.
  const isDataUrl = Boolean(src && src.startsWith('data:image/'));
  const isStrippedThumb = isDataUrl && src!.length < 8000;
  const isHighResDataUrl = isDataUrl && !isStrippedThumb;
  const isHttpUrl = Boolean(src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')));
  // Only treat genuinely high-res sources as directSrc (skips background download)
  const directSrc = (isHighResDataUrl || isHttpUrl) ? src : undefined;
  // Stripped thumbnails are shown immediately as blurry preview while high-res loads
  const effectivePreviewSrc = previewSrc || (isStrippedThumb ? src : undefined);

  const fallbackAvatarUrl = (!isAndroidApp() && effectivePeerId)
    ? resolveApiUrl(`/api/telegram/avatar?id=${encodeURIComponent(effectivePeerId)}`)
    : undefined;

  const [highResSrc, setHighResSrc] = useState<string | null>(() => {
    if (directSrc) return directSrc;
    if (effectivePeerId) {
      const cached = avatarService.get(effectivePeerId);
      if (cached) return cached;
    }
    return fallbackAvatarUrl || null;
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Subscribe to live high-res avatar updates and trigger background download
  useEffect(() => {
    // If we already have a genuinely high-res directSrc (large base64 or blob/http), use it directly
    if (directSrc) {
      setHighResSrc(directSrc);
      return;
    }

    if (!effectivePeerId) {
      setHighResSrc(null);
      return;
    }

    // 1. Check if avatar is already in memory cache (high-res from previous download)
    const existing = avatarService.get(effectivePeerId);
    if (existing) {
      setHighResSrc(existing);
    } else if (fallbackAvatarUrl) {
      setHighResSrc(fallbackAvatarUrl);
    }

    // 2. Subscribe to background download updates — when high-res arrives, replace the blurry thumb
    const unsubscribe = avatarService.subscribe(effectivePeerId, (newUrl) => {
      if (newUrl) {
        setHighResSrc(newUrl);
        setHasError(false);
      }
    });

    // 3. Trigger high-res MTProto download if not already loaded
    if (!existing) {
      avatarService.loadAvatar(effectivePeerId, size === 'xl' || size === 'lg').then((url) => {
        if (url) {
          setHighResSrc(url);
          setHasError(false);
        }
      }).catch(() => {});
    }

    return () => {
      unsubscribe();
    };
  }, [effectivePeerId, directSrc, size, fallbackAvatarUrl]);

  // Active high-resolution source
  const activeSrc = highResSrc || directSrc || (effectivePeerId ? avatarService.get(effectivePeerId) : undefined) || fallbackAvatarUrl;

  useEffect(() => {
    setIsLoaded(false);
    setHasError(!activeSrc && !effectivePreviewSrc);
    if (activeSrc && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [activeSrc, effectivePreviewSrc]);

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

  const hasAnyPhoto = Boolean(activeSrc || effectivePreviewSrc);

  if (!hasAnyPhoto || (hasError && !effectivePreviewSrc)) {
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

      {/* Preview thumbnail (shown while high-res loads or if high-res failed) */}
      {effectivePreviewSrc && (!isLoaded || hasError) && (
        <img
          src={effectivePreviewSrc}
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
