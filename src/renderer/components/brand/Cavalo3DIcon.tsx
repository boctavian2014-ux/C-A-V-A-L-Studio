import React from 'react';

// ── 256px tier (UI: activity bar, sidebar) ──
import iconLogoHorse256 from '../../../../assets/icons/3d/png_256/icon_logo_horse.png';
import iconAi256 from '../../../../assets/icons/3d/png_256/icon_ai.png';
import iconHome256 from '../../../../assets/icons/3d/png_256/icon_home.png';
import iconSearch256 from '../../../../assets/icons/3d/png_256/icon_search.png';
import iconShop256 from '../../../../assets/icons/3d/png_256/icon_shop.png';
import iconSettings256 from '../../../../assets/icons/3d/png_256/icon_settings.png';
import iconProfile256 from '../../../../assets/icons/3d/png_256/icon_profile.png';
import iconChat256 from '../../../../assets/icons/3d/png_256/icon_chat.png';
import iconNotifications256 from '../../../../assets/icons/3d/png_256/icon_notifications.png';
import iconStats256 from '../../../../assets/icons/3d/png_256/icon_stats.png';
import iconTrading256 from '../../../../assets/icons/3d/png_256/icon_trading.png';
import iconVideo256 from '../../../../assets/icons/3d/png_256/icon_video.png';
import iconWallet256 from '../../../../assets/icons/3d/png_256/icon_wallet.png';

// ── 1024px tier (large marks, settings logo) ──
import iconLogoHorse1024 from '../../../../assets/icons/3d/png_1024/icon_logo_horse.png';
import iconAi1024 from '../../../../assets/icons/3d/png_1024/icon_ai.png';
import iconHome1024 from '../../../../assets/icons/3d/png_1024/icon_home.png';
import iconSearch1024 from '../../../../assets/icons/3d/png_1024/icon_search.png';
import iconShop1024 from '../../../../assets/icons/3d/png_1024/icon_shop.png';
import iconSettings1024 from '../../../../assets/icons/3d/png_1024/icon_settings.png';
import iconProfile1024 from '../../../../assets/icons/3d/png_1024/icon_profile.png';
import iconChat1024 from '../../../../assets/icons/3d/png_1024/icon_chat.png';
import iconNotifications1024 from '../../../../assets/icons/3d/png_1024/icon_notifications.png';
import iconStats1024 from '../../../../assets/icons/3d/png_1024/icon_stats.png';
import iconTrading1024 from '../../../../assets/icons/3d/png_1024/icon_trading.png';
import iconVideo1024 from '../../../../assets/icons/3d/png_1024/icon_video.png';
import iconWallet1024 from '../../../../assets/icons/3d/png_1024/icon_wallet.png';

export type Cavalo3DIconName =
  | 'logo_horse'
  | 'ai'
  | 'home'
  | 'search'
  | 'shop'
  | 'settings'
  | 'profile'
  | 'chat'
  | 'notifications'
  | 'stats'
  | 'trading'
  | 'video'
  | 'wallet';

const ICONS_256: Record<Cavalo3DIconName, string> = {
  logo_horse: iconLogoHorse256,
  ai: iconAi256,
  home: iconHome256,
  search: iconSearch256,
  shop: iconShop256,
  settings: iconSettings256,
  profile: iconProfile256,
  chat: iconChat256,
  notifications: iconNotifications256,
  stats: iconStats256,
  trading: iconTrading256,
  video: iconVideo256,
  wallet: iconWallet256,
};

const ICONS_1024: Record<Cavalo3DIconName, string> = {
  logo_horse: iconLogoHorse1024,
  ai: iconAi1024,
  home: iconHome1024,
  search: iconSearch1024,
  shop: iconShop1024,
  settings: iconSettings1024,
  profile: iconProfile1024,
  chat: iconChat1024,
  notifications: iconNotifications1024,
  stats: iconStats1024,
  trading: iconTrading1024,
  video: iconVideo1024,
  wallet: iconWallet1024,
};

export function cavalo3DIconUrl(name: Cavalo3DIconName, size = 24): string {
  return size > 64 ? ICONS_1024[name] : ICONS_256[name];
}

export function Cavalo3DIcon({
  name,
  size = 24,
  className,
  style,
  glow,
}: {
  name: Cavalo3DIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Subtle cyan glow — for AI marks */
  glow?: boolean;
}) {
  return (
    <img
      src={cavalo3DIconUrl(name, size)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{
        display: 'block',
        objectFit: 'contain',
        flexShrink: 0,
        filter: glow ? 'drop-shadow(0 0 8px rgba(0, 224, 255, 0.55))' : undefined,
        ...style,
      }}
    />
  );
}
