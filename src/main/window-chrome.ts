/**
 * Native + renderer window chrome — graphite black to match `--caval-bg`.
 * Windows otherwise paints a light caption/menu and a navy `#090B12` flash.
 */
import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron";

import { colors } from "../../themes/tokens/colors";

/** Same token as `--caval-bg` / graphiteBlack. */
export const WINDOW_CHROME_BACKGROUND = colors.graphiteBlack;

export function applyNativeWindowChrome(): void {
  nativeTheme.themeSource = "dark";
}

export function usesInRendererMenuBar(platform = process.platform): boolean {
  return platform === "win32" || platform === "linux";
}

/** Chromium's Win/Linux menu bar is stuck at system gray (~#333); hide it for a themed bar. */
export function hideNativeMenuBar(window: BrowserWindow): void {
  if (!usesInRendererMenuBar()) return;
  window.setAutoHideMenuBar(false);
  window.setMenuBarVisibility(false);
}

export function browserWindowChromeOptions(): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    backgroundColor: WINDOW_CHROME_BACKGROUND,
  };
  if (process.platform === "win32") {
    options.backgroundMaterial = "none";
  }
  return options;
}
