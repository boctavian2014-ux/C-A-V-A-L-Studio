import { beforeEach, describe, expect, it, vi } from "vitest";

import { colors } from "../../themes/tokens/colors";

const nativeTheme = { themeSource: "system" as string };

vi.mock("electron", () => ({
  nativeTheme,
}));

describe("window chrome", () => {
  beforeEach(() => {
    nativeTheme.themeSource = "system";
  });

  it("forces dark native theme so Windows caption/menu follow graphite chrome", async () => {
    const { applyNativeWindowChrome } = await import("../../src/main/window-chrome");
    applyNativeWindowChrome();
    expect(nativeTheme.themeSource).toBe("dark");
  });

  it("uses the same graphite token as --caval-bg for the BrowserWindow", async () => {
    const { browserWindowChromeOptions, WINDOW_CHROME_BACKGROUND } = await import(
      "../../src/main/window-chrome"
    );
    expect(WINDOW_CHROME_BACKGROUND).toBe(colors.graphiteBlack);
    const options = browserWindowChromeOptions();
    expect(options.backgroundColor).toBe(colors.graphiteBlack);
    if (process.platform === "win32") {
      expect(options.backgroundMaterial).toBe("none");
    }
  });

  it("hides the unthemeable Chromium menu bar on Windows and Linux", async () => {
    const { hideNativeMenuBar, usesInRendererMenuBar } = await import("../../src/main/window-chrome");
    expect(usesInRendererMenuBar("win32")).toBe(true);
    expect(usesInRendererMenuBar("linux")).toBe(true);
    expect(usesInRendererMenuBar("darwin")).toBe(false);
    const window = {
      setAutoHideMenuBar: vi.fn(),
      setMenuBarVisibility: vi.fn(),
    };
    hideNativeMenuBar(window as never);
    if (usesInRendererMenuBar()) {
      expect(window.setAutoHideMenuBar).toHaveBeenCalledWith(false);
      expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
    } else {
      expect(window.setMenuBarVisibility).not.toHaveBeenCalled();
    }
  });
});
