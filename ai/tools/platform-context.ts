/**
 * Platform-specific UI/OS guidance for Caval AI (offline corpus).
 */

export type SoftwarePlatform =
  | "ios"
  | "android"
  | "windows"
  | "macos"
  | "linux"
  | "cross-platform";

export interface PlatformContextPack {
  platform: SoftwarePlatform;
  label: string;
  guidelines: string[];
  uiPatterns: string[];
  keywords: string[];
}

export const PLATFORM_CONTEXT: Record<SoftwarePlatform, PlatformContextPack> = {
  ios: {
    platform: "ios",
    label: "iOS (Human Interface Guidelines / SwiftUI)",
    keywords: ["ios", "iphone", "ipad", "swiftui", "swift", "app store", "uikit", "hig"],
    guidelines: [
      "Follow Apple HIG: clarity, deference, depth; SF symbols where appropriate.",
      "NavigationStack / TabView conventions; large titles sparingly.",
      "Respect Dynamic Type and VoiceOver labels.",
      "Privacy: purpose strings for camera/mic/location; App Tracking if needed.",
    ],
    uiPatterns: [
      "SwiftUI declarative layouts; prefer system list styles.",
      "Sheet / fullScreenCover for modal flows.",
      "Haptics for confirmations; not continuous noise.",
    ],
  },
  android: {
    platform: "android",
    label: "Android (Material Design / Jetpack Compose)",
    keywords: [
      "android",
      "material design",
      "material you",
      "jetpack compose",
      "kotlin",
      "play store",
    ],
    guidelines: [
      "Material 3 / Material You: dynamic color optional, not mandatory branding.",
      "Predictive back; edge-to-edge with inset padding.",
      "Runtime permissions with rationale before system dialog.",
      "Adaptive layouts for phone/tablet/foldables.",
    ],
    uiPatterns: [
      "Compose Scaffold + Navigation; single activity.",
      "Snackbar for transient feedback; Dialog for blocking choices.",
      "Prefer vector icons; density-aware spacing.",
    ],
  },
  windows: {
    platform: "windows",
    label: "Windows (Fluent Design / WinUI)",
    keywords: ["windows", "winui", "fluent", "uwp", "wpf", "win32", "microsoft store"],
    guidelines: [
      "Fluent: acrylic/mica sparingly; system accent color awareness.",
      "Snap layouts friendly window min sizes; DPI awareness.",
      "Standard title bar / custom title bar with drag regions careful.",
      "Settings in a dedicated page; honor system dark mode.",
    ],
    uiPatterns: [
      "NavigationView / pivot for app chrome.",
      "Command bar for primary actions.",
      "Keyboard accelerators documented in UI.",
    ],
  },
  macos: {
    platform: "macos",
    label: "macOS (HIG / SwiftUI)",
    keywords: ["macos", "mac os", "osx", "swiftui", "appkit", "catalyst", "menubar"],
    guidelines: [
      "Native menu bar; keyboard shortcuts with Cmd.",
      "Toolbar + sidebar split views common for productivity apps.",
      "Prefer system Settings-style preferences window.",
      "Sandbox entitlements minimal; notarization for distribution.",
    ],
    uiPatterns: [
      "SwiftUI NavigationSplitView for three-column apps.",
      "Sheets for short tasks; separate windows for documents.",
      "Traffic-light spacing respected on custom titlebars.",
    ],
  },
  linux: {
    platform: "linux",
    label: "Linux (GTK / Qt)",
    keywords: ["linux", "gtk", "gnome", "kde", "qt", "wayland", "x11", "flatpak", "appimage"],
    guidelines: [
      "Prefer Flatpak/AppImage/deb clarity for distribution.",
      "GTK4 or Qt6 patterns; follow desktop portal dialogs for files.",
      "Wayland-first; don't assume X11-only APIs.",
      "Honor free-desktop dark style preference.",
    ],
    uiPatterns: [
      "HeaderBar / Adwaita patterns for GNOME-like apps.",
      "Qt: QMainWindow + docks for IDEs/tools.",
      "Keyboard-first navigation for power users.",
    ],
  },
  "cross-platform": {
    platform: "cross-platform",
    label: "Cross-platform",
    keywords: [
      "cross-platform",
      "cross platform",
      "react native",
      "flutter",
      "electron",
      "tauri",
      "multiplatform",
    ],
    guidelines: [
      "Share business logic; fork UI only where platform HIG diverges.",
      "Feature-detect capabilities (biometrics, notifications).",
      "One design language with platform affordances (nav, typography).",
      "CI matrix for each target OS early.",
    ],
    uiPatterns: [
      "RN/Flutter: Platform.* branches minimal and documented.",
      "Electron/Tauri: native menus per OS.",
      "Shared tokens; platform spacing multipliers.",
    ],
  },
};

export interface DetectedPlatform {
  platform: SoftwarePlatform;
  score: number;
}

/** Score platforms mentioned in the user prompt (0–1 relative). */
export function detectPlatforms(userText: string): DetectedPlatform[] {
  const t = userText.toLowerCase();
  const scored: DetectedPlatform[] = [];
  for (const pack of Object.values(PLATFORM_CONTEXT)) {
    let hits = 0;
    for (const kw of pack.keywords) {
      if (t.includes(kw)) hits += 1;
    }
    if (hits > 0) {
      scored.push({
        platform: pack.platform,
        score: Math.min(1, hits / Math.max(2, pack.keywords.length * 0.25)),
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score);
}

export function formatPlatformContextBlock(platforms: DetectedPlatform[], limit = 2): string {
  const top = platforms.filter((p) => p.score >= 0.15).slice(0, limit);
  if (!top.length) return "";
  const parts: string[] = ["Platform-specific guidance (auto):"];
  for (const { platform } of top) {
    const pack = PLATFORM_CONTEXT[platform];
    parts.push(`### ${pack.label}`);
    for (const g of pack.guidelines.slice(0, 4)) parts.push(`- ${g}`);
    for (const u of pack.uiPatterns.slice(0, 3)) parts.push(`- UI: ${u}`);
  }
  return parts.join("\n");
}
