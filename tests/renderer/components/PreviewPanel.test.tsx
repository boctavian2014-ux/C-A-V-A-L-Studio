/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "../../../src/renderer/components/sidebar/PreviewPanel";
import { usePreviewStore } from "../../../src/renderer/store/preview-store";
import type { PreviewApi, PreviewLogLine, PreviewState, PreviewTarget } from "../../../src/shared/preview-contract";

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

describe("PreviewPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    usePreviewStore.getState().clearPreview();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    usePreviewStore.getState().clearPreview();
    vi.restoreAllMocks();
  });

  async function renderPanel(api: PreviewApi) {
    window.caval = { preview: api } as Window["caval"];
    const result = mount(<PreviewPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
    });
    return result;
  }

  it("keeps Open Web / Open Mobile visible when preview is not configured", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "not-configured"),
      mobile: idle("mobile", "not-configured"),
    });
    const { container } = await renderPanel(api);
    expect(container.textContent).toContain("Web preview is not configured.");
    expect(container.textContent).toContain("Configure in caval.jsonc");
    expect(container.querySelector('[data-testid="preview-web-config"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="preview-web-status"]')?.textContent).toBe(
      "Not configured"
    );
    expect(container.querySelector('[data-testid="preview-web-start"]')?.textContent).toContain(
      "Open Web"
    );
    expect(container.querySelector('[data-testid="preview-mobile-start"]')?.textContent).toContain(
      "Open Mobile"
    );
    const configButtons = Array.from(container.querySelectorAll("button")).filter((btn) =>
      btn.textContent?.includes("Configure in caval.jsonc")
    );
    expect(configButtons.length).toBeGreaterThan(0);
  });

  it("still renders Open Web when the preview API is missing", async () => {
    window.caval = {} as Window["caval"];
    const result = mount(<PreviewPanel />);
    mounted = result;
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.container.querySelector('[data-testid="preview-web-start"]')?.textContent).toContain(
      "Open Web"
    );
    expect(result.container.querySelector('[data-testid="preview-mobile-start"]')?.textContent).toContain(
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
    expect(startWeb).toBeTruthy();
    expect(startWeb?.textContent).toContain("Open Web");
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
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("http://127.0.0.1:5173");
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.openUrl).toHaveBeenCalledWith("web");
  });

  it("sets target=_blank and rel=noopener noreferrer on the preview URL", async () => {
    const { api } = createPreviewMock({
      web: {
        ...idle("web", "running"),
        url: "http://127.0.0.1:5173",
        pid: 42,
        startedAt: 1,
      },
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    const link = container.querySelector('[data-testid="preview-web-url"]');
    expect(link?.getAttribute("href")).toBe("http://127.0.0.1:5173");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
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

  it("shows lastError with role=alert", async () => {
    const { api } = createPreviewMock({
      web: {
        ...idle("web", "failed"),
        lastError: "Process exited with code 1",
      },
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toBe("Process exited with code 1");
  });

  it("starts web preview from sidebar icon and marks it active", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    const icon = container.querySelector('[data-testid="preview-icon-web"]');
    expect(icon).toBeTruthy();
    act(() => {
      icon?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(api.start).toHaveBeenCalledWith("web");
    expect(usePreviewStore.getState().activePreview).toBe("web");
    expect(icon?.classList.contains("active")).toBe(true);
  });

  it("renders iframe when preview store has a running URL", async () => {
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
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:5173");
    expect(iframe?.className).toContain("preview-frame-web");
    expect(usePreviewStore.getState().previewUrl).toBe("http://127.0.0.1:5173");
  });
});
