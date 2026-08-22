/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { createTranslator } from "../../ai/i18n";
import { SearchPanel } from "../../src/renderer/components/search/SearchPanel";
import { FileTree } from "../../src/renderer/components/sidebar/FileTree";
import { GitPanel } from "../../src/renderer/components/git/GitPanel";
import { ExtensionsHub } from "../../src/renderer/components/extensions/ExtensionsHub";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { useGitStore } from "../../src/renderer/store/git-store";

vi.mock("../../src/renderer/hooks/useOpenWorkspace", () => ({
  useOpenWorkspace: () => ({
    pickAndOpenFolder: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../themes/theme-provider", () => ({
  useCavalTheme: () => ({
    mode: "dark",
    setMode: () => undefined,
    theme: {
      mode: "dark",
      colors: {
        surface: "#111",
        border: "#222",
        textMuted: "#888",
        text: "#eee",
        accent: "#0ef",
        bg: "#0E0E0F",
        surfaceRaised: "#161b22",
      },
    },
  }),
  CavalThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

function wrap(ui: ReactElement, locale: "en" | "ro") {
  return <I18nProvider initialLocale={locale}>{ui}</I18nProvider>;
}

describe("i18n 7g.2 left rail panels", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useEditorStore.setState({
      projectPath: null,
      fileTree: [],
    } as never);
    useGitStore.getState().resetForTests();
    window.caval = {
      locale: {
        get: vi.fn(async () => ({ ok: true, locale: "en", source: "saved" as const })),
        set: vi.fn(async (locale: string) => ({ ok: true, locale })),
      },
      extensions: { list: vi.fn(async () => ({ extensions: [] })) },
      openvsx: {
        popular: vi.fn(async () => ({ ok: true, extensions: [] })),
        search: vi.fn(async () => ({ ok: true, extensions: [] })),
      },
      git: {
        status: vi.fn(async () => ({
          branch: "main",
          ahead: 0,
          behind: 0,
          files: [],
          hasConflicts: false,
          isClean: true,
        })),
        onStatusChange: vi.fn(() => () => undefined),
        onOperationChange: vi.fn(() => () => undefined),
      },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("keeps Ctrl+Enter in commit placeholders for both locales", () => {
    const en = createTranslator("en");
    const ro = createTranslator("ro");
    expect(en("sourceControl.commitPlaceholder")).toContain("Ctrl+Enter");
    expect(ro("sourceControl.commitPlaceholder")).toContain("Ctrl+Enter");
  });

  it("translates Explorer empty state en → ro", () => {
    mounted = mount(wrap(<FileTree />, "en"));
    expect(mounted.container.textContent).toContain("No folder opened");

    mounted.unmount();
    mounted = mount(wrap(<FileTree />, "ro"));
    expect(mounted.container.textContent).toContain("Niciun folder deschis");
  });

  it("translates Search panel chrome en → ro", () => {
    mounted = mount(wrap(<SearchPanel />, "en"));
    expect(mounted.container.querySelector("input")?.placeholder).toBe("Find in Files");

    mounted.unmount();
    mounted = mount(wrap(<SearchPanel />, "ro"));
    expect(mounted.container.querySelector("input")?.placeholder).toBe("Caută în fișiere");
    expect(mounted.container.textContent).toContain("Deschide un folder");
  });

  it("translates Source Control empty / commit placeholder en → ro", async () => {
    mounted = mount(wrap(<GitPanel />, "en"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.querySelector("textarea")?.placeholder).toBe(
      "Message (Ctrl+Enter to commit)"
    );
    expect(mounted.container.textContent).toMatch(/No changes|Working tree/);

    mounted.unmount();
    mounted = mount(wrap(<GitPanel />, "ro"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.querySelector("textarea")?.placeholder).toBe(
      "Mesaj (Ctrl+Enter pentru commit)"
    );
    expect(mounted.container.textContent).toMatch(/Nicio modificare/);
  });

  it("translates Marketplace hub tabs en → ro", async () => {
    mounted = mount(wrap(<ExtensionsHub />, "en"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Extensions");
    expect(mounted.container.textContent).toContain("MCP");

    mounted.unmount();
    mounted = mount(wrap(<ExtensionsHub />, "ro"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Extensii");
    expect(mounted.container.textContent).toContain("MCP");
  });
});
