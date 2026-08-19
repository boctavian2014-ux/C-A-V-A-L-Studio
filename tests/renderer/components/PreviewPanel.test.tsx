/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewPanel } from "../../../src/renderer/components/sidebar/PreviewPanel";
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
    getState: vi.fn(async (target) => initial[target]),
    start: vi.fn(async (target) => initial[target]),
    stop: vi.fn(async (target) => idle(target, "stopped")),
    restart: vi.fn(async (target) => initial[target]),
    getLogs: vi.fn(async () => []),
    openConfig: vi.fn(async () => undefined),
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
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
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

  it("renders not-configured copy and the config button", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "not-configured"),
      mobile: idle("mobile", "not-configured"),
    });
    const { container } = await renderPanel(api);
    expect(container.textContent).toContain("Web preview is not configured.");
    expect(container.textContent).toContain("Configure in caval.jsonc");
    const configButtons = Array.from(container.querySelectorAll("button")).filter((btn) =>
      btn.textContent?.includes("Configure in caval.jsonc")
    );
    expect(configButtons.length).toBeGreaterThan(0);
  });

  it("calls window.caval.preview.start('web') when Start is clicked", async () => {
    const { api } = createPreviewMock({
      web: idle("web", "stopped"),
      mobile: idle("mobile", "stopped"),
    });
    const { container } = await renderPanel(api);
    const startWeb = container.querySelector('[aria-label="Start Web preview"]');
    expect(startWeb).toBeTruthy();
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
    const link = container.querySelector("a.preview-target-url");
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("http://127.0.0.1:5173");
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
    const link = container.querySelector("a.preview-target-url");
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
});
