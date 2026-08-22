/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { useTranslation } from "../../ai/i18n/useTranslation";
import { ActivityBar } from "../../src/renderer/components/sidebar/ActivityBar";
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

function LocaleProbe() {
  const { t, locale } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="save-label">{t("common.save")}</span>
      <span data-testid="lang-label">{t("settings.displayLanguage")}</span>
    </div>
  );
}

function wrap(ui: ReactElement, initialLocale?: "en" | "ro") {
  return (
    <CavalThemeProvider defaultMode="dark">
      <I18nProvider initialLocale={initialLocale}>{ui}</I18nProvider>
    </CavalThemeProvider>
  );
}

describe("i18n UI foundation", () => {
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

  it("changes Settings and nav labels instantly en → ro", async () => {
    function Harness() {
      const { setLocale } = useTranslation();
      return (
        <>
          <button type="button" data-testid="to-ro" onClick={() => void setLocale("ro")}>
            ro
          </button>
          <ActivityBar
            active="explorer"
            onChange={() => undefined}
            aiPanelOpen={false}
            onToggleAI={() => undefined}
            gitChangesCount={0}
            engineeringOpen={false}
            onToggleEngineering={() => undefined}
          />
          <SettingsPanel />
          <LocaleProbe />
        </>
      );
    }

    mounted = mount(wrap(<Harness />, "en"));

    const search = mounted.container.querySelector('[data-testid="activity-search"]');
    expect(search?.getAttribute("title")).toMatch(/Search/i);
    expect(mounted.container.querySelector('[data-testid="lang-label"]')?.textContent).toBe(
      "Display language"
    );
    expect(mounted.container.querySelector('[data-testid="save-label"]')?.textContent).toBe("Save");

    await act(async () => {
      mounted!.container.querySelector<HTMLButtonElement>('[data-testid="to-ro"]')?.click();
    });

    expect(mounted.container.querySelector('[data-testid="locale"]')?.textContent).toBe("ro");
    expect(
      mounted.container.querySelector('[data-testid="activity-search"]')?.getAttribute("title")
    ).toMatch(/Căutare/i);
    expect(mounted.container.querySelector('[data-testid="lang-label"]')?.textContent).toBe(
      "Limba afișată"
    );
    expect(mounted.container.querySelector('[data-testid="save-label"]')?.textContent).toBe(
      "Salvează"
    );
    expect(mounted.container.textContent).toContain("Se aplică imediat.");
  });

  it("rehydrates persisted locale on remount", async () => {
    const get = vi.fn(async () => ({ ok: true, locale: "ro", source: "saved" as const }));
    window.caval = {
      locale: {
        get,
        set: vi.fn(async (locale: string) => ({ ok: true, locale })),
      },
    } as unknown as Window["caval"];

    mounted = mount(
      <CavalThemeProvider defaultMode="dark">
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>
      </CavalThemeProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mounted.container.querySelector('[data-testid="locale"]')?.textContent).toBe("ro");
    expect(mounted.container.querySelector('[data-testid="save-label"]')?.textContent).toBe(
      "Salvează"
    );
    mounted.unmount();

    mounted = mount(
      <CavalThemeProvider defaultMode="dark">
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>
      </CavalThemeProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.querySelector('[data-testid="locale"]')?.textContent).toBe("ro");
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to navigator.language when locale API missing", async () => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      get: () => "ro-RO",
    });
    window.caval = {} as unknown as Window["caval"];

    mounted = mount(
      <CavalThemeProvider defaultMode="dark">
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>
      </CavalThemeProvider>
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mounted.container.querySelector('[data-testid="locale"]')?.textContent).toBe("ro");
  });

  it("does not render raw keys or [object Object] in scope", () => {
    mounted = mount(
      wrap(
        <>
          <ActivityBar
            active="explorer"
            onChange={() => undefined}
            aiPanelOpen={false}
            onToggleAI={() => undefined}
            gitChangesCount={0}
            engineeringOpen={false}
            onToggleEngineering={() => undefined}
          />
          <SettingsPanel />
        </>,
        "ro"
      )
    );

    expect(mounted.container.textContent).not.toContain("[object Object]");
    expect(mounted.container.textContent).not.toContain("settings.displayLanguage");
    expect(mounted.container.textContent).not.toContain("nav.explorerShortcut");
    expect(mounted.container.textContent).toContain("Limba afișată");
  });
});
