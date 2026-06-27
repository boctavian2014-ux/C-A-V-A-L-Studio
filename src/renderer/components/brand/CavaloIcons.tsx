// ──────────────────────────────────────────────
//  CAVALO — set unitar de iconițe UI
//  3D PNG glossy pentru activity bar; SVG pentru Git + Engineering.
//
//  Folosire:
//    import { IconExplorer, IconSearch } from '../brand/CavaloIcons';
//    <IconExplorer size={18} />
// ──────────────────────────────────────────────

import React from 'react';
import { Cavalo3DIcon, type Cavalo3DIconName } from './Cavalo3DIcon';

type IconProps = {
  size?: number;
  strokeWidth?: number;
};

function PngIcon({ name, size = 18, label }: IconProps & { name: Cavalo3DIconName; label: string }) {
  return (
    <span role="img" aria-label={label} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <Cavalo3DIcon name={name} size={size} />
    </span>
  );
}

function Svg({
  size = 18,
  strokeWidth = 1.6,
  children,
  label,
}: IconProps & { children: React.ReactNode; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={label}
      role="img"
    >
      {children}
    </svg>
  );
}

export function IconExplorer(p: IconProps) {
  return <PngIcon {...p} name="home" label="Explorer" />;
}

export function IconSearch(p: IconProps) {
  return <PngIcon {...p} name="search" label="Căutare" />;
}

export function IconGit(p: IconProps) {
  return (
    <Svg {...p} label="Git">
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="17" cy="12" r="2.2" />
      <path d="M6 7.2v9.6M6 9.5c0 4 8.8 1.8 8.8 2.5" />
    </Svg>
  );
}

export function IconMarketplace(p: IconProps) {
  return <PngIcon {...p} name="shop" label="Marketplace" />;
}

export function IconEngineering(p: IconProps) {
  return (
    <Svg {...p} label="Engineering AI">
      <rect x="7" y="7" width="10" height="10" rx="2.4" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </Svg>
  );
}

export function IconSparkle(p: IconProps) {
  return <PngIcon {...p} name="ai" label="CAVALO AI" />;
}

export function IconSettings(p: IconProps) {
  return <PngIcon {...p} name="settings" label="Setări" />;
}

export function IconAccount(p: IconProps) {
  return <PngIcon {...p} name="profile" label="Cont" />;
}

export function IconSpec(p: IconProps) {
  return (
    <Svg {...p} label="Spec">
      <path d="M6 3.5h7l5 5V20a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" />
      <path d="M13 3.5V8a1 1 0 001 1h4M8.5 13h7M8.5 16.5h7" />
    </Svg>
  );
}

export function IconSchema(p: IconProps) {
  return (
    <Svg {...p} label="Schemă">
      <rect x="3.5" y="9" width="5" height="6" rx="1.4" />
      <rect x="15.5" y="4" width="5" height="5" rx="1.4" />
      <rect x="15.5" y="15" width="5" height="5" rx="1.4" />
      <path d="M8.5 11.5h3.5v-5h3.5M12 12.5v5h3.5" />
    </Svg>
  );
}

export function IconParts(p: IconProps) {
  return (
    <Svg {...p} label="Componente">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </Svg>
  );
}

export function IconBuild(p: IconProps) {
  return (
    <Svg {...p} label="Build">
      <path d="M14.5 6.5a3.5 3.5 0 00-4.6 4.3l-5.4 5.4a1.6 1.6 0 102.3 2.3l5.4-5.4a3.5 3.5 0 004.3-4.6l-2.1 2.1-2-2 2.1-2.1z" />
    </Svg>
  );
}

/** Folder line icon — file tree, toolbar (CAVALO style, not Windows). */
export function IconFolder(p: IconProps & { open?: boolean }) {
  const { open, size = 18, strokeWidth = 1.6 } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Folder"
      role="img"
    >
      <path
        d="M4 8.5V18a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-6.5L10 6.5H6a2 2 0 00-2 2v0z"
        fill={open ? 'currentColor' : 'none'}
        fillOpacity={open ? 0.12 : 0}
      />
    </svg>
  );
}
