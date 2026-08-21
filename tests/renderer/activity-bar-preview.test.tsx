/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityBar } from "../../src/renderer/components/sidebar/ActivityBar";
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

describe("ActivityBar — web/mobile preview icons", () => {
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
    window.caval = {
      preview: {
        start: vi.fn(async () => ({
          target: "web",
          status: "starting",
          url: null,
          pid: null,
          startedAt: null,
          lastError: null,
        })),
      },
    } as unknown as Window["caval"];
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    usePreviewStore.getState().clearPreview();
    vi.restoreAllMocks();
  });

  function renderBar() {
    const result = mount(
      <ActivityBar
        active="explorer"
        onChange={() => undefined}
        aiPanelOpen={false}
        onToggleAI={() => undefined}
        gitChangesCount={0}
        onOpenAccount={() => undefined}
      />
    );
    mounted = result;
    return result;
  }

  it("renders Web and Mobile preview buttons", () => {
    const { container } = renderBar();
    expect(container.querySelector('[title^="Web Preview"]')).toBeTruthy();
    expect(container.querySelector('[title^="Mobile Preview"]')).toBeTruthy();
  });

  it("places Web/Mobile icons before AI icon in DOM order", () => {
    const { container } = renderBar();
    const items = Array.from(container.querySelectorAll("button"));
    const webIdx = items.findIndex((el) => el.getAttribute("data-testid") === "activity-preview-web");
    const mobileIdx = items.findIndex(
      (el) => el.getAttribute("data-testid") === "activity-preview-mobile"
    );
    const aiIdx = items.findIndex((el) => el.getAttribute("data-testid") === "activity-ai");
    expect(webIdx).toBeGreaterThan(-1);
    expect(mobileIdx).toBeGreaterThan(webIdx);
    expect(aiIdx).toBeGreaterThan(mobileIdx);
  });

  it("shows not-configured badge when preview is not configured", () => {
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="activity-preview-web-badge-muted"]')).toBeTruthy();
  });

  it("shows live badge when preview is running", () => {
    usePreviewStore.setState({
      previewStatus: { web: "running", mobile: "not-configured" },
    });
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="activity-preview-web-badge-live"]')).toBeTruthy();
  });

  it("clicking Web icon sets activePreview and opens preview panel", () => {
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview-web"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBe("web");
    expect(usePreviewStore.getState().previewPanelOpen).toBe(true);
  });

  it("clicking Mobile icon sets activePreview to mobile", () => {
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview-mobile"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBe("mobile");
    expect(usePreviewStore.getState().previewPanelOpen).toBe(true);
  });

  it("clicking active preview icon again toggles it off", () => {
    usePreviewStore.setState({ activePreview: "web", previewPanelOpen: true });
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview-web"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBeNull();
    expect(usePreviewStore.getState().previewPanelOpen).toBe(false);
  });

  it("switching from Web to Mobile updates activePreview correctly", () => {
    usePreviewStore.setState({ activePreview: "web", previewPanelOpen: true });
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview-mobile"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBe("mobile");
  });
});
