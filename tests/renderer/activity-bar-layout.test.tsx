/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityBar } from "../../src/renderer/components/sidebar/ActivityBar";
import { ConnectionStatusIndicator } from "../../src/renderer/components/workbench/ConnectionStatusIndicator";
import { WorkbenchHeader } from "../../src/renderer/components/workbench/WorkbenchHeader";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { CavalThemeProvider } from "../../themes/theme-provider";

function wrap(ui: ReactElement) {
  return (
    <CavalThemeProvider>
      <I18nProvider initialLocale="en">{ui}</I18nProvider>
    </CavalThemeProvider>
  );
}

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  act(() => {
    root?.render(wrap(ui));
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

describe("ActivityBar layout", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    usePreviewStore.setState({
      activePreview: null,
      previewUrl: null,
      previewPanelOpen: false,
      previewStatus: { web: "idle", mobile: "idle" },
    });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
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
        engineeringOpen={false}
        onToggleEngineering={() => undefined}
      />
    );
    mounted = result;
    return result;
  }

  it("renders main activities in VS Code order", () => {
    const { container } = renderBar();
    const ids = Array.from(container.querySelectorAll("[data-testid^='activity-']")).map((el) =>
      el.getAttribute("data-testid")
    );
    expect(ids.indexOf("activity-explorer")).toBeLessThan(ids.indexOf("activity-search"));
    expect(ids.indexOf("activity-search")).toBeLessThan(ids.indexOf("activity-git"));
    expect(ids.indexOf("activity-git")).toBeLessThan(ids.indexOf("activity-extensions"));
  });

  it("renders workflow group after separator (AI, preview, engineering)", () => {
    const { container } = renderBar();
    const separators = container.querySelectorAll('[data-testid="activity-bar-separator"]');
    expect(separators.length).toBeGreaterThanOrEqual(2);

    const ids = Array.from(container.querySelectorAll("button")).map((el) =>
      el.getAttribute("data-testid")
    );
    const extIdx = ids.indexOf("activity-extensions");
    const aiIdx = ids.indexOf("activity-ai");
    const webIdx = ids.indexOf("activity-preview-web");
    const engIdx = ids.indexOf("activity-engineering");
    const settingsIdx = ids.indexOf("activity-settings");

    expect(aiIdx).toBeGreaterThan(extIdx);
    expect(webIdx).toBeGreaterThan(aiIdx);
    expect(engIdx).toBeGreaterThan(webIdx);
    expect(settingsIdx).toBeGreaterThan(engIdx);
  });

  it("anchors Settings at the bottom after the second separator", () => {
    const { container } = renderBar();
    const buttons = Array.from(container.querySelectorAll("button"));
    const settingsBtn = buttons.find((b) => b.getAttribute("data-testid") === "activity-settings");
    expect(settingsBtn).toBeTruthy();
    expect(buttons.at(-1)).toBe(settingsBtn);
  });

  it("does not render account or connection controls in the activity bar", () => {
    const { container } = renderBar();
    expect(container.textContent).not.toContain("OB");
    expect(container.querySelector(".glass-status-dot")).toBeNull();
  });
});

describe("ConnectionStatusIndicator", () => {
  it("renders with accessible connected label", () => {
    const { container, unmount } = mount(<ConnectionStatusIndicator />);
    const dot = container.querySelector('[data-testid="statusbar-connection-indicator"]');
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("aria-label")).toMatch(/Connected|Conectat/i);
    unmount();
  });
});

describe("WorkbenchHeader account control", () => {
  it("renders Accounts & Credits after Robotics AI and preserves click handler", () => {
    const onOpenAccount = vi.fn();
    const { container, unmount } = mount(
      <WorkbenchHeader
        engineeringOpen={false}
        onToggleEngineering={() => undefined}
        sidebarOpen
        onToggleSidebar={() => undefined}
        onOpenAccount={onOpenAccount}
      />
    );
    const accountBtn = container.querySelector('[data-testid="header-account-credits"]');
    expect(accountBtn).toBeTruthy();
    const navButtons = Array.from(container.querySelectorAll("nav button"));
    const roboticsIdx = navButtons.findIndex((b) => b.textContent?.includes("Robotics AI"));
    const accountIdx = navButtons.indexOf(accountBtn as HTMLButtonElement);
    expect(accountIdx).toBe(roboticsIdx + 1);

    act(() => {
      accountBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
    unmount();
  });
});
