/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivityBar,
  mergePreviewRailStatus,
} from "../../src/renderer/components/sidebar/ActivityBar";
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

describe("ActivityBar — preview rail", () => {
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

  function renderBar(overrides?: Partial<React.ComponentProps<typeof ActivityBar>>) {
    const result = mount(
      <ActivityBar
        active="explorer"
        onChange={() => undefined}
        aiPanelOpen={false}
        onToggleAI={() => undefined}
        gitChangesCount={0}
        engineeringOpen={false}
        onToggleEngineering={() => undefined}
        {...overrides}
      />
    );
    mounted = result;
    return result;
  }

  it("renders a single Preview activity button", () => {
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="activity-preview"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="activity-preview-web"]')).toBeNull();
    expect(container.querySelector('[data-testid="activity-preview-mobile"]')).toBeNull();
  });

  it("places Coding Arena before Preview in DOM order", () => {
    const { container } = renderBar();
    const items = Array.from(container.querySelectorAll("button"));
    const aiIdx = items.findIndex((el) => el.getAttribute("data-testid") === "activity-ai");
    const previewIdx = items.findIndex((el) => el.getAttribute("data-testid") === "activity-preview");
    expect(aiIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(aiIdx);
  });

  it("shows small dot badge when preview is not configured", () => {
    const { container } = renderBar();
    const badge = container.querySelector('[data-testid="activity-preview-badge-muted"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).not.toBe("!");
  });

  it("shows live dot badge when preview is running", () => {
    usePreviewStore.setState({
      previewStatus: { web: "running", mobile: "not-configured" },
    });
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="activity-preview-badge-live"]')).toBeTruthy();
  });

  it("clicking Preview sets activePreview to web by default and opens panel", () => {
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBe("web");
    expect(usePreviewStore.getState().previewPanelOpen).toBe(true);
  });

  it("clicking active preview again toggles it off", () => {
    usePreviewStore.setState({ activePreview: "web", previewPanelOpen: true });
    const { container } = renderBar();
    act(() => {
      container
        .querySelector('[data-testid="activity-preview"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePreviewStore.getState().activePreview).toBeNull();
    expect(usePreviewStore.getState().previewPanelOpen).toBe(false);
  });

  it("uses neutral settings 3D icon instead of purple settings png", () => {
    const { container } = renderBar();
    const settings = container.querySelector('[data-testid="activity-settings"]');
    const img = settings?.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src") ?? "").toContain("icon_settings_neutral");
  });
});

describe("mergePreviewRailStatus", () => {
  it("prefers running over not-configured", () => {
    expect(mergePreviewRailStatus("running", "not-configured")).toBe("running");
  });

  it("surfaces not-configured when either target needs setup", () => {
    expect(mergePreviewRailStatus("stopped", "not-configured")).toBe("not-configured");
  });
});
