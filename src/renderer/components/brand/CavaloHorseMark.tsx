// ──────────────────────────────────────────────
//  CAVALO — emblema brand (neon horse, fundal transparent)
// ──────────────────────────────────────────────

import React from 'react';
import { Cavalo3DIcon } from './Cavalo3DIcon';
import cavaloSplashUrl from '../../../../assets/cavalo-splash.png';
import cavaloNeonHorseUrl from '../../../../assets/cavalo-neon-horse.png';

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

/** Logo oficial CAVALO — cal neon, fundal transparent. */
export function CavaloHorseMark({
  size = 48,
  glowFilter,
}: {
  size?: number;
  glowFilter?: string;
}) {
  return (
    <img
      src={cavaloNeonHorseUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={glowFilter ? { ...NEON_LOGO_STYLE, filter: glowFilter } : NEON_LOGO_STYLE}
    />
  );
}

/** AI panel mark — 3D icon with cyan glow. */
export function CavaloAiMark({ size = 48 }: { size?: number }) {
  return <Cavalo3DIcon name="ai" size={size} glow />;
}

export function CavaloSplashMark({ size = 48 }: { size?: number }) {
  return (
    <img
      src={cavaloSplashUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        display: 'block',
        objectFit: 'contain',
        flexShrink: 0,
      }}
    />
  );
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
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.35 }}>
      <CavaloHorseMark size={height} />
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 800,
          fontSize: height * 0.62,
          letterSpacing: '0.10em',
          color: '#D8DEE6',
          textShadow: '0 0 6px rgba(0,224,255,0.45)',
          lineHeight: 1,
        }}
      >
        CAVALO
      </span>
    </span>
  );
}
