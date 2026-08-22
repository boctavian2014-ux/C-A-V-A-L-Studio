// Shared brand marks for the CAVAL wordmark across light/dark surfaces.

import React from 'react';
import { Cavalo3DIcon } from './Cavalo3DIcon';
import { useCavalTheme } from '../../../../themes/theme-provider';
import cavalWordmarkDarkUrl from '../../../../assets/icons/caval-wordmark-white.png';
import cavalWordmarkLightUrl from '../../../../assets/icons/caval-wordmark-black.png';
import cavalStudioHeroUrl from '../../../../assets/icons/caval-studio-hero.png';

const NEON_LOGO_STYLE: React.CSSProperties = {
  display: 'block',
  objectFit: 'contain',
  flexShrink: 0,
  background: 'transparent',
  filter: [
    'drop-shadow(0 10px 28px rgba(0, 170, 255, 0.72))',
    'drop-shadow(0 4px 14px rgba(0, 210, 255, 0.55))',
    'drop-shadow(0 0 12px rgba(0, 200, 255, 0.45))',
  ].join(' '),
};

function useBrandLogoUrl(): string {
  const { mode } = useCavalTheme();
  return mode === 'light' ? cavalWordmarkLightUrl : cavalWordmarkDarkUrl;
}

function CavalBrandImage({
  width,
  height,
  glowFilter,
}: {
  width: number;
  height: number;
  glowFilter?: string;
}) {
  const brandLogoUrl = useBrandLogoUrl();
  return (
    <img
      src={brandLogoUrl}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={glowFilter ? { ...NEON_LOGO_STYLE, width, height, filter: glowFilter } : { ...NEON_LOGO_STYLE, width, height }}
    />
  );
}

export function CavaloHorseMark({
  size = 48,
  glowFilter,
}: {
  size?: number;
  glowFilter?: string;
}) {
  const width = Math.round(size * 3.2);
  const height = size;
  return <CavalBrandImage width={width} height={height} glowFilter={glowFilter} />;
}

/** AI panel mark — 3D icon with cyan glow. */
export function CavaloAiMark({ size = 48 }: { size?: number }) {
  return <Cavalo3DIcon name="ai" size={size} glow />;
}

export function CavaloSplashMark({ size = 48 }: { size?: number }) {
  const width = Math.round(size * 3.2);
  const height = size;
  return <CavalBrandImage width={width} height={height} />;
}

/** @deprecated Use CavaloHorseMark — same asset. */
export function CavaloNeonMark({ size = 48 }: { size?: number }) {
  return <CavaloHorseMark size={size} />;
}

const NEON_FRAME_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: '2px solid rgba(0, 224, 255, 0.92)',
  boxShadow: [
    '0 0 4px rgba(0, 224, 255, 1)',
    '0 0 14px rgba(0, 224, 255, 0.85)',
    '0 0 28px rgba(0, 190, 255, 0.55)',
    '0 0 52px rgba(0, 150, 255, 0.28)',
    'inset 0 0 22px rgba(0, 224, 255, 0.07)',
  ].join(', '),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function CavaloNeonFrame({
  size = 120,
  iconSize,
  borderRadius = 22,
}: {
  size?: number;
  iconSize?: number;
  borderRadius?: number;
}) {
  const inner = iconSize ?? Math.round(size * 0.82);
  return (
    <div
      style={{
        ...NEON_FRAME_STYLE,
        width: size,
        height: size,
        borderRadius,
      }}
    >
      <CavaloHorseMark size={inner} />
    </div>
  );
}

export function CavaloLogo({ height = 24 }: { height?: number }) {
  const width = Math.round(height * 3.2);
  return <CavalBrandImage width={width} height={height} />;
}

const HERO_ASPECT = 486 / 680;

/** Full CAVAL STUDIO mark for empty/home screens. */
export function CavalStudioHero({ size = 240 }: { size?: number }) {
  const width = size;
  const height = Math.round(size * HERO_ASPECT);
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '8% 16% 22%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,224,255,0.18) 0%, rgba(0,224,255,0.05) 42%, transparent 72%)',
          pointerEvents: 'none',
        }}
      />
      <img
        src={cavalStudioHeroUrl}
        width={width}
        height={height}
        alt="CAVAL STUDIO"
        draggable={false}
        style={{
          position: 'relative',
          display: 'block',
          width,
          height,
          objectFit: 'contain',
          background: 'transparent',
          filter: 'drop-shadow(0 10px 28px rgba(0, 224, 255, 0.22))',
        }}
      />
    </div>
  );
}
