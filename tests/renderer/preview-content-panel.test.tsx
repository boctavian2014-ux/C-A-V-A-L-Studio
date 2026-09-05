/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewContentPanel } from "../../src/renderer/components/preview/PreviewContentPanel";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import type {
  PreviewApi,
  PreviewLogLine,
  PreviewState,
  PreviewTarget,
} from "../../src/shared/preview-contract";

function idle(target: PreviewTarget, status: PreviewState["status"] = "not-configured"): PreviewState {
  return {
    target,
    status,
    url: null,
    pid: null,
    startedAt: null,
    lastError: null,
  };
}

function createPreviewMock(initial: Record<PreviewTarget, PreviewState>) {
  const stateListeners: Array<(state: PreviewState) => void> = [];
  const logListeners: Array<(line: PreviewLogLine) => void> = [];
  const unsubscribeState = vi.fn();
  const unsubscribeLog = vi.fn();

  const api: PreviewApi = {
    getState: vi.fn(async (target: PreviewTarget) => initial[target]),
    start: vi.fn(async (target: PreviewTarget) => initial[target]),
    stop: vi.fn(async (target: PreviewTarget) => idle(target, "stopped")),
    restart: vi.fn(async (target: PreviewTarget) => initial[target]),
    getLogs: vi.fn(async () => []),
    openConfig: vi.fn(async () => undefined),
    openUrl: vi.fn(async () => undefined),
    onStateChange: vi.fn((cb) => {
      stateListeners.push(cb);
      return unsubscribeState;
    }),
    onLog: vi.fn((cb) => {
      logListeners.push(cb);
      return unsubscribeLog;
    }),
  };

  return { api, stateListeners, logListeners, unsubscribeState, unsubscribeLog };
}

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

describe("PreviewContentPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    useEditorStore.setState({ projectPath: "/tmp/caval-preview-test" });
    usePreviewStore.setState({
      activePreview: "web",
      previewUrl: null,
      previewPanelOpen: true,
      previewStatus: { web: "not-configured", mobile: "not-configured" },
    });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    usePreviewStore.getState().clearPreview();
    vi.restoreAllMocks();
  });

  async function renderPanel(api: PreviewApi) {
    window.caval = { preview: api } as Window["caval"];
    const result = mount(<PreviewContentPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
    });
    return result;
  }

  it("renders nothing when no preview is active", () => {
    usePreviewStore.getState().clearPreview();
    const { container, unmount } = mount(<PreviewContentPanel />);
    expect(container.querySelector('[data-testid="preview-content-panel"]')).toBeNull();
    unmount();
  });

  it("keeps Open Web visible when preview is not configured", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "not-configured"),
      mobile: idle("mobile", "not-configured"),
    });
    const { container } = await renderPanel(api);
    expect(container.textContent).toMatch(/web preview is not configured/i);
    expect(container.textContent).toContain("Configure in caval.jsonc");
    expect(container.querySelector('[data-testid="preview-web-start"]')?.textContent).toContain(
      "Open Web"
    );
  });

  it("shows not-configured message for mobile", async () => {
    usePreviewStore.setState({
      activePreview: "mobile",
      previewPanelOpen: true,
      previewUrl: null,
    });
    const { api } = createPreviewMock({
      web: idle("web", "not-configured"),
      mobile: idle("mobile", "not-configured"),
    });
    const { container } = await renderPanel(api);
    expect(container.textContent).toMatch(/mobile preview is not configured/i);
    expect(container.querySelector('[data-testid="preview-mobile-start"]')?.textContent).toContain(
      "Open Mobile"
    );
  });

  it("calls window.caval.preview.start('web') when Open Web is clicked", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    const startWeb = container.querySelector('[data-testid="preview-web-start"]');
    act(() => {
      startWeb?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.start).toHaveBeenCalledWith("web");
  });

  it("shows Restart, Stop, and a clickable URL when state becomes running", async () => {
    const { api, stateListeners } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    act(() => {
      for (const listener of stateListeners) {
        listener({
          target: "web",
          status: "running",
          url: "http://127.0.0.1:5173",
          pid: 42,
          startedAt: Date.now(),
          lastError: null,
        });
      }
    });
    expect(container.querySelector('[aria-label="Restart Web preview"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Stop Web preview"]')).toBeTruthy();
    const link = container.querySelector('[data-testid="preview-web-url"]');
    expect(link?.textContent).toBe("http://127.0.0.1:5173");
  });

  it("renders iframe with correct class when preview is running", async () => {
    const { api, stateListeners } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    act(() => {
      for (const listener of stateListeners) {
        listener({
          target: "web",
          status: "running",
          url: "http://127.0.0.1:5173",
          pid: 42,
          startedAt: Date.now(),
          lastError: null,
        });
      }
    });
    const iframe = container.querySelector('[data-testid="preview-iframe"]') as HTMLIFrameElement | null;
    expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:5173");
    expect(iframe?.className).toContain("preview-frame-web");
  });

  it("renders mobile-sized frame for mobile preview", async () => {
    usePreviewStore.setState({
      activePreview: "mobile",
      previewPanelOpen: true,
      previewUrl: "http://localhost:8081",
    });
    const { api } = createPreviewMock({
      web: idle("web", "not-configured"),
      mobile: { ...idle("mobile", "running"), url: "http://localhost:8081", pid: 1, startedAt: 1 },
    });
    const { container } = await renderPanel(api);
    const iframe = container.querySelector('[data-testid="preview-iframe"]') as HTMLIFrameElement | null;
    expect(iframe?.className).toContain("preview-frame-mobile");
  });

  it("shows a checklist when no folder is open", async () => {
    useEditorStore.setState({ projectPath: null });
    const { api } = createPreviewMock({
      web: idle("web", "failed"),
      mobile: idle("mobile", "not-configured"),
    });
    const { container } = await renderPanel(api);
    expect(container.querySelector('[data-testid="preview-frame-no-folder"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="preview-checklist"]')?.textContent).toMatch(
      /open a project folder/i
    );
  });

  it("unsubscribes state and log listeners on unmount", async () => {
    const { api, unsubscribeState, unsubscribeLog } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { unmount } = await renderPanel(api);
    unmount();
    mounted = undefined;
    expect(unsubscribeState).toHaveBeenCalled();
    expect(unsubscribeLog).toHaveBeenCalled();
  });
});
