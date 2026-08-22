/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityBar } from "../../src/renderer/components/sidebar/ActivityBar";
import { FileTree } from "../../src/renderer/components/sidebar/FileTree";
import { PreviewContentPanel } from "../../src/renderer/components/preview/PreviewContentPanel";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import { useEditorStore } from "../../src/renderer/store/editor-store";

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

function AppShell() {
  return (
    <div className="app-shell">
      <ActivityBar
        active="explorer"
        onChange={() => undefined}
        aiPanelOpen={false}
        onToggleAI={() => undefined}
        gitChangesCount={0}
        engineeringOpen={false}
        onToggleEngineering={() => undefined}
      />
      <div className="explorer-panel">
        <FileTree />
      </div>
      <div className="content-area">
        <PreviewContentPanel />
      </div>
    </div>
  );
}

describe("Preview rail migration smoke", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    usePreviewStore.setState({
      activePreview: null,
      previewUrl: null,
      previewPanelOpen: false,
      previewStatus: { web: "not-configured", mobile: "not-configured" },
    });
    useEditorStore.setState({ projectPath: null, fileTree: [] } as never);
    window.caval = {
      preview: {
        start: vi.fn(async (target: "web" | "mobile") => ({
          target,
          status: "not-configured" as const,
          url: null,
          pid: null,
          startedAt: null,
          lastError: null,
        })),
        getState: vi.fn(async (target: "web" | "mobile") => ({
          target,
          status: "not-configured" as const,
          url: null,
          pid: null,
          startedAt: null,
          lastError: null,
        })),
        onStateChange: vi.fn(() => () => undefined),
        onLog: vi.fn(() => () => undefined),
        stop: vi.fn(),
        restart: vi.fn(),
        getLogs: vi.fn(async () => []),
        openConfig: vi.fn(),
        openUrl: vi.fn(),
      },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    usePreviewStore.getState().clearPreview();
  });

  it("Explorer has zero preview references while ActivityBar exposes Preview", () => {
    const result = mount(<AppShell />);
    mounted = result;
    const explorer = result.container.querySelector(".explorer-panel");
    expect(explorer?.textContent).not.toMatch(/\bPREVIEW\b/);
    expect(explorer?.textContent).not.toMatch(/Open Web/i);

    const rail = result.container.querySelector(".activity-bar");
    expect(rail?.querySelector('[data-testid="activity-preview"]')).toBeTruthy();
  });

  it("full flow: click Preview in rail -> content panel shows web preview state", async () => {
    const result = mount(<AppShell />);
    mounted = result;
    act(() => {
      result.container
        .querySelector('[data-testid="activity-preview"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    const content = result.container.querySelector(".content-area");
    expect(content?.textContent).toMatch(/web preview is not configured/i);
  });
});
