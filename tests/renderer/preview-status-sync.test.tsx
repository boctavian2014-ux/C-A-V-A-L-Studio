/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewStatusSync } from "../../src/renderer/components/preview/PreviewStatusSync";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import type { PreviewState, PreviewTarget } from "../../src/shared/preview-contract";

function idle(target: PreviewTarget): PreviewState {
  return {
    target,
    status: "stopped",
    url: null,
    pid: null,
    startedAt: null,
    lastError: null,
  };
}

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(ui);
  });
  return {
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe("PreviewStatusSync", () => {
  let unmount: (() => void) | undefined;
  let listeners: Array<(state: PreviewState) => void>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    listeners = [];
    usePreviewStore.setState({
      activePreview: null,
      previewUrl: null,
      previewPanelOpen: false,
      previewStatus: { web: "not-configured", mobile: "not-configured" },
    });
    window.caval = {
      preview: {
        getState: vi.fn(async (target: PreviewTarget) => idle(target)),
        onStateChange: (cb: (state: PreviewState) => void) => {
          listeners.push(cb);
          return () => undefined;
        },
      },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    usePreviewStore.getState().clearPreview();
    vi.restoreAllMocks();
  });

  it("updates rail status without opening Preview when Explorer is showing", async () => {
    const view = mount(<PreviewStatusSync />);
    unmount = view.unmount;
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      for (const listener of listeners) {
        listener({
          target: "web",
          status: "starting",
          url: null,
          pid: null,
          startedAt: Date.now(),
          lastError: null,
        });
      }
    });
    expect(usePreviewStore.getState().previewStatus.web).toBe("starting");
    expect(usePreviewStore.getState().previewPanelOpen).toBe(false);
    expect(usePreviewStore.getState().activePreview).toBeNull();
  });

  it("does not switch away from another visible preview target", async () => {
    usePreviewStore.setState({
      activePreview: "mobile",
      previewPanelOpen: true,
      previewUrl: "http://127.0.0.1:8081",
    });
    const view = mount(<PreviewStatusSync />);
    unmount = view.unmount;
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      for (const listener of listeners) {
        listener({
          target: "web",
          status: "running",
          url: "http://127.0.0.1:5173",
          pid: 12,
          startedAt: Date.now(),
          lastError: null,
        });
      }
    });
    expect(usePreviewStore.getState().previewStatus.web).toBe("running");
    expect(usePreviewStore.getState().activePreview).toBe("mobile");
    expect(usePreviewStore.getState().previewUrl).toBe("http://127.0.0.1:8081");
  });

  it("binds the URL when the visible target becomes running", async () => {
    usePreviewStore.setState({
      activePreview: "web",
      previewPanelOpen: true,
      previewUrl: null,
    });
    const view = mount(<PreviewStatusSync />);
    unmount = view.unmount;
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      for (const listener of listeners) {
        listener({
          target: "web",
          status: "running",
          url: "http://127.0.0.1:5173",
          pid: 12,
          startedAt: Date.now(),
          lastError: null,
        });
      }
    });
    expect(usePreviewStore.getState().previewUrl).toBe("http://127.0.0.1:5173");
    expect(usePreviewStore.getState().previewPanelOpen).toBe(true);
    expect(usePreviewStore.getState().activePreview).toBe("web");
  });
});
