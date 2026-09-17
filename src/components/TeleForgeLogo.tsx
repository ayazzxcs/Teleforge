import React from 'react';

interface TeleForgeLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  withShadow?: boolean;
}

/**
 * TeleForge Official Brand Logo:
 * - Deep red circular background
 * - Warm cream Telegram-style paper-plane silhouette
 * - No T, no F, no extra symbols, authentic paper-plane geometry preserved
 */
export const TeleForgeLogo: React.FC<TeleForgeLogoProps> = ({
  size = 'md',
  className = '',
  withShadow = true,
}) => {
  let dimensionPx = 40;
  if (typeof size === 'number') {
    dimensionPx = size;
  } else {
    switch (size) {
      case 'xs':
        dimensionPx = 24;
        break;
      case 'sm':
        dimensionPx = 32;
        break;
      case 'md':
        dimensionPx = 40;
        break;
      case 'lg':
        dimensionPx = 56;
        break;
      case 'xl':
        dimensionPx = 72;
        break;
    }
  }

  return (
    <div
      style={{ width: dimensionPx, height: dimensionPx }}
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${
        withShadow ? 'shadow-md shadow-red-950/30' : ''
      } ${className}`}
      aria-label="TeleForge"
    >
      <svg
        viewBox="0 0 240 240"
        width={dimensionPx}
        height={dimensionPx}
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Deep Dark Red Brand Gradient */}
          <linearGradient id="teleforgeRedGradient" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#9B1D20" />
            <stop offset="60%" stopColor="#8B1E22" />
            <stop offset="100%" stopColor="#6C1316" />
          </linearGradient>
        </defs>

        {/* Red Circular Background with Signature Cream Outline */}
        <circle cx="120" cy="120" r="114" fill="url(#teleforgeRedGradient)" stroke="#FFF8EE" strokeWidth="8" />

        {/* Warm Cream Paper-Plane Silhouette (Authentic Geometry) */}
        <path
          fill="#FFF8EE"
          d="M54 120c38-16 63-27 75-32 36-15 44-18 48-18 1 0 3 0 4 1s2 2 2 3c0 2-1 9-2 20-5 31-15 72-18 87-1 5-3 7-5 7-4 0-8-3-12-6-8-5-18-12-25-17-2-2-4-3-3-6 1-2 4-5 13-13 13-12 17-17 17-19 0-1-1-2-3-1-3 1-13 7-28 17-5 4-10 7-14 7-5 0-9-2-15-4-8-3-14-5-14-8 0-3 5-6 17-11z"
        />
      </svg>
    </div>
  );
};
