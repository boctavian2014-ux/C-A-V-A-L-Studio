// ──────────────────────────────────────────────
//  CAVALO — set unitar de iconițe UI
//  Stil: SF Symbols / Apple — linie rotunjită, caldă, "human".
//  Toate folosesc `currentColor`, deci moștenesc culoarea butonului
//  (inclusiv starea activă / hover din WorkbenchRoot).
//
//  Folosire:
//    import { IconExplorer, IconSearch } from '../brand/CavaloIcons';
//    <IconExplorer size={18} />
// ──────────────────────────────────────────────

import React from 'react';

type IconProps = {
  size?: number;
  strokeWidth?: number;
};

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
  return (
    <Svg {...p} label="Explorer">
      <path d="M3 6.5a2 2 0 012-2h3.6a2 2 0 011.5.7l1 1.1a2 2 0 001.5.7H19a2 2 0 012 2v6.8a2 2 0 01-2 2H5a2 2 0 01-2-2V6.5z" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p} label="Căutare">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19 19l-3.6-3.6" />
    </Svg>
  );
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
  return (
    <Svg {...p} label="Marketplace">
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <path d="M16.5 13.5v6M13.5 16.5h6" />
    </Svg>
  );
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
  return (
    <Svg {...p} label="CAVALO AI">
      <path d="M12 4.5c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5z" />
      <path d="M18.5 4.5c.2 1.2.7 1.7 1.9 1.9-1.2.2-1.7.7-1.9 1.9-.2-1.2-.7-1.7-1.9-1.9 1.2-.2 1.7-.7 1.9-1.9z" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p} label="Setări">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8l1.3 2.4a7.4 7.4 0 012.4 1l2.7-.5.9 2.5-2 1.9c.1.5.1 1.3 0 1.8l2 1.9-.9 2.5-2.7-.5a7.4 7.4 0 01-2.4 1L12 21.2l-1.3-2.4a7.4 7.4 0 01-2.4-1l-2.7.5-.9-2.5 2-1.9a7.6 7.6 0 010-1.8l-2-1.9.9-2.5 2.7.5a7.4 7.4 0 012.4-1L12 2.8z" />
    </Svg>
  );
}

export function IconAccount(p: IconProps) {
  return (
    <Svg {...p} label="Cont">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0113 0" />
    </Svg>
  );
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
