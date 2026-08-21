/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { translate } from "../../ai/i18n/index";
import { en, type MessageKey } from "../../ai/i18n/locales/en";
import { ro } from "../../ai/i18n/locales/ro";
import { setActiveLocale, tActive } from "../../ai/i18n/active-locale";
import { SettingsPanel } from "../../src/renderer/components/settings/SettingsPanel";
import { CavalThemeProvider } from "../../themes/theme-provider";
import { usePreviewStore } from "../../src/renderer/store/preview-store";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

function wrap(ui: ReactElement, initialLocale?: "en" | "ro") {
  return (
    <CavalThemeProvider defaultMode="dark">
      <I18nProvider initialLocale={initialLocale}>{ui}</I18nProvider>
    </CavalThemeProvider>
  );
}

describe("i18n 7g.5 settings + dialog polish", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    usePreviewStore.setState({
      activePreview: null,
      previewUrl: null,
      previewPanelOpen: false,
      previewStatus: { web: "not-configured", mobile: "not-configured" },
    });
    window.caval = {
      locale: {
        get: vi.fn(async () => ({ ok: true, locale: "en", source: "saved" as const })),
        set: vi.fn(async (locale: string) => ({ ok: true, locale })),
      },
    } as unknown as Window["caval"];
  });

  it("catalog parity: every en key exists in ro", () => {
    const enKeys = Object.keys(en).sort();
    const roKeys = Object.keys(ro).sort();
    expect(roKeys).toEqual(enKeys);
    for (const key of enKeys as MessageKey[]) {
      expect(ro[key].length).toBeGreaterThan(0);
    }
  });

  it("Settings nav labels switch en → ro (including About CAVAL)", () => {
    mounted = mount(wrap(<SettingsPanel />, "en"));
    expect(mounted.container.textContent).toContain("About CAVAL");
    expect(mounted.container.textContent).toContain("Shortcuts");
    expect(mounted.container.textContent).toContain("Project Health");
    expect(mounted.container.textContent).not.toContain("Despre CAVALLO");
    expect(mounted.container.textContent).not.toContain("Scurtături");

    mounted.unmount();
    mounted = mount(wrap(<SettingsPanel />, "ro"));
    expect(mounted.container.textContent).toContain("Despre CAVAL");
    expect(mounted.container.textContent).toContain("Scurtături");
    expect(mounted.container.textContent).toContain("Project Health");
    expect(mounted.container.textContent).not.toContain("CAVALLO");
  });

  it("keeps shortcuts identical across locales", () => {
    expect(translate("en", "palette.placeholder")).toContain("Ctrl+Shift+P");
    expect(translate("ro", "palette.placeholder")).toContain("Ctrl+Shift+P");
    expect(translate("en", "sourceControl.commitPlaceholder")).toContain("Ctrl+Enter");
    expect(translate("ro", "sourceControl.commitPlaceholder")).toContain("Ctrl+Enter");
    expect(translate("en", "preview.openFolderHint")).toContain("Ctrl+Shift+O");
    expect(translate("ro", "preview.openFolderHint")).toContain("Ctrl+Shift+O");
  });

  it("dialog/toast keys exist and tActive follows setActiveLocale", () => {
    setActiveLocale("en");
    expect(tActive("dialog.deleteConversation")).toMatch(/Delete this conversation/i);
    expect(tActive("toast.about")).toContain("CAVAL™");
    setActiveLocale("ro");
    expect(tActive("dialog.deleteConversation")).toMatch(/Ștergi/i);
    expect(tActive("toast.about")).toContain("CAVAL™");
    expect(tActive("toast.about")).not.toContain("CAVALLO");
  });

  it("RO prefers folder terminology for explorer new-folder", () => {
    expect(translate("ro", "explorer.newFolder")).toBe("Folder nou");
    expect(translate("ro", "explorer.newFolderPrompt")).toMatch(/folder/i);
    expect(translate("ro", "explorer.newFolder")).not.toMatch(/director/i);
  });
});
