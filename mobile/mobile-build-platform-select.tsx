import type { MobilePlatform } from "./types";

export interface MobileBuildPlatformSelectProps {
  platform: MobilePlatform;
  onChange: (platform: MobilePlatform) => void;
}

const PLATFORMS: Array<{ id: MobilePlatform; title: string; subtitle: string }> = [
  { id: "android", title: "Android", subtitle: "APK / AAB via Expo EAS" },
  { id: "ios", title: "iOS", subtitle: "IPA via Expo + Apple" },
  { id: "ota", title: "OTA Update", subtitle: "EAS update over-the-air" }
];

export const MobileBuildPlatformSelect = ({ platform, onChange }: MobileBuildPlatformSelectProps) => (
  <div className="cs-mobile-platform">
    <h3>Platform</h3>
    <div className="cs-platform-grid">
      {PLATFORMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`cs-platform-card ${platform === item.id ? "cs-platform-card-active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          <span className="cs-platform-title">{item.title}</span>
          <span className="cs-platform-sub">{item.subtitle}</span>
        </button>
      ))}
    </div>
  </div>
);
