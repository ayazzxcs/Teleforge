import React, { useState, useEffect, useRef } from 'react';

interface AvatarProps {
  src?: string;
  previewSrc?: string;
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  previewSrc,
  name,
  color = '#2AABEE',
  size = 'md',
  className = '',
}) => {
  const [hasError, setHasError] = useState(!src && !previewSrc);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setHasError(!src && !previewSrc);
    setIsLoaded(false);
    if (src && imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [src, previewSrc]);

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

  if ((!src && !previewSrc) || (hasError && !previewSrc)) {
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

      {/* Instant low-res preview thumbnail (shown while high-res loads) */}
      {previewSrc && !isLoaded && (
        <img
          src={previewSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover rounded-full filter blur-[1px] transform scale-105"
        />
      )}

      {/* Real High-Resolution Avatar Image */}
      {src && !hasError && (
        <img
          ref={imgRef}
          src={src}
          alt={name}
          decoding="async"
          loading={src.startsWith('data:') ? undefined : 'lazy'}
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
