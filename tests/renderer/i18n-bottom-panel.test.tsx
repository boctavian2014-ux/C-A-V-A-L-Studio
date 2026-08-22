/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { createTranslator } from "../../ai/i18n";
import { ProblemsPanel } from "../../src/renderer/components/problems/ProblemsPanel";
import { TasksPanel } from "../../src/renderer/components/tasks/TasksPanel";
import { TerminalSessions } from "../../src/renderer/components/terminal/TerminalPanel";
import { PreviewContentPanel } from "../../src/renderer/components/preview/PreviewContentPanel";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import { useProblemsStore } from "../../src/renderer/store/problems-store";

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

describe("i18n 7g.3 bottom panel", () => {
  let mounted: { unmount: () => void; container: HTMLElement } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useEditorStore.setState({ projectPath: null, fileTree: [] } as never);
    useProblemsStore.getState().clearProblems();
    usePreviewStore.setState({
      activePreview: "web",
      previewUrl: null,
      previewPanelOpen: true,
      previewStatus: { web: "not-configured", mobile: "not-configured" },
    });
    window.caval = {
      locale: {
        get: vi.fn(async () => ({ ok: true, locale: "en", source: "saved" as const })),
        set: vi.fn(async (locale: string) => ({ ok: true, locale })),
      },
      terminal: {
        list: vi.fn(async () => []),
        create: vi.fn(),
        destroy: vi.fn(),
        write: vi.fn(),
        onOutput: vi.fn(() => () => undefined),
        onExit: vi.fn(() => () => undefined),
      },
      problems: {
        getProblems: vi.fn(async () => []),
        getSummary: vi.fn(async () => ({ total: 0, errors: 0, warnings: 0, infos: 0, hints: 0 })),
        refresh: vi.fn(async () => undefined),
        onProblemsChanged: vi.fn(() => () => undefined),
        onSummaryChanged: vi.fn(() => () => undefined),
      },
      tasks: {
        list: vi.fn(async () => []),
        getRuns: vi.fn(async () => []),
        run: vi.fn(),
        stop: vi.fn(),
        onRunChanged: vi.fn(() => () => undefined),
        onOutput: vi.fn(() => () => undefined),
      },
      preview: {
        getState: vi.fn(async (target: "web" | "mobile") => ({
          target,
          status: "not-configured",
          url: null,
          pid: null,
          startedAt: null,
          lastError: null,
        })),
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        getLogs: vi.fn(async () => []),
        openConfig: vi.fn(),
        openUrl: vi.fn(),
        onStateChange: vi.fn(() => () => undefined),
        onLog: vi.fn(() => () => undefined),
      },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("keeps Ctrl+Shift+O in preview open-folder hint for both locales", () => {
    const en = createTranslator("en");
    const ro = createTranslator("ro");
    expect(en("preview.openFolderHint")).toContain("Ctrl+Shift+O");
    expect(ro("preview.openFolderHint")).toContain("Ctrl+Shift+O");
  });

  it("translates Terminal empty state en → ro", async () => {
    mounted = mount(wrap(<TerminalSessions isPanelActive={false} />, "en"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("No terminal");

    mounted.unmount();
    mounted = mount(wrap(<TerminalSessions isPanelActive={false} />, "ro"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Niciun terminal");
  });

  it("translates Problems empty state en → ro", async () => {
    mounted = mount(wrap(<ProblemsPanel />, "en"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toMatch(/No problems detected/i);

    mounted.unmount();
    mounted = mount(wrap(<ProblemsPanel />, "ro"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toMatch(/Nicio problemă detectată/i);
  });

  it("translates Tasks empty state en → ro", async () => {
    mounted = mount(wrap(<TasksPanel />, "en"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toMatch(/No tasks configured/i);

    mounted.unmount();
    mounted = mount(wrap(<TasksPanel />, "ro"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toMatch(/Nicio sarcină configurată/i);
  });

  it("translates Preview chrome en → ro", async () => {
    mounted = mount(wrap(<PreviewContentPanel />, "en"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Web Preview");
    expect(mounted.container.textContent).toMatch(/Open Web/i);

    mounted.unmount();
    mounted = mount(wrap(<PreviewContentPanel />, "ro"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mounted.container.textContent).toContain("Previzualizare Web");
    expect(mounted.container.textContent).toMatch(/Deschide Web/i);
  });
});
