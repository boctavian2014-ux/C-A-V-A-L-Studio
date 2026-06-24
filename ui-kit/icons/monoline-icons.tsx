import type { SVGProps } from "react";

export type MonolineIconName = "file" | "folder" | "search" | "ai" | "settings" | "marketplace" | "debug" | "run";
export type MonolineIconProps = SVGProps<SVGSVGElement> & { title?: string };

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

export const FileIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></svg>
);

export const FolderIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);

export const SearchIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
);

export const AIIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><path d="M8 8h8v8H8z" /><path d="M10 13.5 12 9l2 4.5M10.7 12.2h2.6" /></svg>
);

export const SettingsIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z" /></svg>
);

export const MarketplaceIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M4 8h16l-1 12H5z" /><path d="M8 8a4 4 0 0 1 8 0" /><path d="M9 13h6M9 16h4" /></svg>
);

export const DebugIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M8 8h8v7a4 4 0 0 1-8 0z" /><path d="M9 4l2 4M15 4l-2 4M4 13h4M16 13h4M5 19l3-2M19 19l-3-2" /></svg>
);

export const RunIcon = (props: MonolineIconProps) => (
  <svg {...baseProps} {...props}><path d="M8 5v14l11-7z" /></svg>
);

export const monolineIcons = {
  file: FileIcon,
  folder: FolderIcon,
  search: SearchIcon,
  ai: AIIcon,
  settings: SettingsIcon,
  marketplace: MarketplaceIcon,
  debug: DebugIcon,
  run: RunIcon
} as const;
