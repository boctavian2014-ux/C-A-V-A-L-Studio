/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityBar, arenaStatusMotionMode } from "../../src/renderer/components/sidebar/ActivityBar";
import { ConnectionStatusIndicator } from "../../src/renderer/components/workbench/ConnectionStatusIndicator";
import { WorkbenchHeader } from "../../src/renderer/components/workbench/WorkbenchHeader";
import { useEditorStore } from "../../src/renderer/store/editor-store";
import { usePreviewStore } from "../../src/renderer/store/preview-store";
import { I18nProvider } from "../../ai/i18n/I18nProvider";
import { CavalThemeProvider } from "../../themes/theme-provider";
import type { ConnectionHealthSnapshot } from "../../src/shared/connection-health-contract";

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
    rerender(next: ReactElement) {
      act(() => {
        root?.render(wrap(next));
      });
    },
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && /prefers-reduced-motion:\s*reduce/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const BAR_DEFAULTS = {
  active: "explorer" as const,
  onChange: () => undefined,
  aiPanelOpen: false,
  onToggleAI: () => undefined,
  gitChangesCount: 0,
  engineeringOpen: false,
  onToggleEngineering: () => undefined,
};

describe("ActivityBar layout", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    stubMatchMedia(false);
    usePreviewStore.setState({
      activePreview: null,
      previewUrl: null,
      previewPanelOpen: false,
      previewStatus: { web: "stopped", mobile: "stopped" },
    });
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  function renderBar(overrides?: Partial<React.ComponentProps<typeof ActivityBar>>) {
    const result = mount(<ActivityBar {...BAR_DEFAULTS} {...overrides} />);
    mounted = result;
    return {
      ...result,
      setProps(next?: Partial<React.ComponentProps<typeof ActivityBar>>) {
        result.rerender(<ActivityBar {...BAR_DEFAULTS} {...next} />);
      },
    };
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
    const previewIdx = ids.indexOf("activity-preview");
    const engIdx = ids.indexOf("activity-engineering");
    const settingsIdx = ids.indexOf("activity-settings");

    expect(aiIdx).toBeGreaterThan(extIdx);
    expect(previewIdx).toBeGreaterThan(aiIdx);
    expect(engIdx).toBeGreaterThan(previewIdx);
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
    expect(container.querySelector('[data-testid="header-account-credits"]')).toBeNull();
    expect(container.querySelector(".glass-status-dot")).toBeNull();
  });

  it("mounts one arena status icon wrapper in the Coding Arena activity", () => {
    const { container } = renderBar();
    const ai = container.querySelector('[data-testid="activity-ai"]');
    const wrappers = container.querySelectorAll('[data-testid="arena-status-icon"]');
    const robots = container.querySelectorAll('[data-testid="arena-status-robot"]');

    expect(wrappers).toHaveLength(1);
    expect(robots).toHaveLength(1);
    expect(ai?.contains(wrappers[0])).toBe(true);
    expect(wrappers[0]?.contains(robots[0])).toBe(true);
    expect(wrappers[0]?.getAttribute("data-state")).toBe("idle");
    expect(container.querySelector('[data-testid="arena-status-icon-core"]')).toBeTruthy();
    expect(robots[0]?.querySelector(".arena-robot-ear-left")).toBeTruthy();
    expect(robots[0]?.querySelector(".arena-robot-ear-right")).toBeTruthy();
    expect(robots[0]?.querySelector(".arena-robot-head")).toBeTruthy();
  });

  it("updates the arena status wrapper from panel-open to active", () => {
    const open = renderBar({ aiPanelOpen: true, arenaStatus: "idle" });
    expect(
      open.container
        .querySelector('[data-testid="arena-status-icon"]')
        ?.getAttribute("data-state")
    ).toBe("open");
    open.unmount();
    mounted = undefined;

    const active = renderBar({ aiPanelOpen: true, arenaStatus: "active" });
    const wrapper = active.container.querySelector('[data-testid="arena-status-icon"]');
    expect(wrapper?.getAttribute("data-state")).toBe("active");
    expect(
      active.container
        .querySelector('[data-testid="arena-status-icon-core"]')
        ?.getAttribute("data-active")
    ).toBe("true");
  });

  it("keeps the arena icon static at rest", () => {
    const idle = renderBar();
    const idleWrap = idle.container.querySelector('[data-testid="arena-status-icon"]');
    expect(idleWrap?.getAttribute("data-state")).toBe("idle");
    expect(idleWrap?.getAttribute("data-motion")).toBe("static");
    expect(idleWrap?.getAttribute("data-reduced")).toBe("false");
    expect(idleWrap?.getAttribute("style")).toMatch(/width:\s*24px/);
    expect(idleWrap?.getAttribute("style")).toMatch(/height:\s*24px/);
    expect(
      idle.container.querySelector('[data-testid="activity-ai"]')?.getAttribute("style")
    ).toMatch(/width:\s*38px/);
    expect(idle.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(idleWrap?.getAttribute("data-motion")).toBe("static");
    idle.unmount();
    mounted = undefined;

    const open = renderBar({ aiPanelOpen: true, arenaStatus: "open" });
    expect(
      open.container
        .querySelector('[data-testid="arena-status-icon"]')
        ?.getAttribute("data-motion")
    ).toBe("static");
    expect(
      open.container
        .querySelector('[data-testid="arena-status-icon-core"]')
        ?.getAttribute("data-active")
    ).toBe("false");
  });

  it("starts motion once for an active turn and stops immediately on cancel", () => {
    const view = renderBar({ aiPanelOpen: true, arenaStatus: "open" });
    expect(view.container.querySelectorAll('[data-testid="arena-status-icon"]')).toHaveLength(1);
    expect(
      view.container
        .querySelector('[data-testid="arena-status-icon"]')
        ?.getAttribute("data-motion")
    ).toBe("static");

    view.setProps({ aiPanelOpen: true, arenaStatus: "active" });
    const activeWrap = view.container.querySelector('[data-testid="arena-status-icon"]');
    expect(view.container.querySelectorAll('[data-testid="arena-status-icon"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(activeWrap?.getAttribute("data-state")).toBe("active");
    expect(activeWrap?.getAttribute("data-motion")).toBe("active");
    expect(
      view.container
        .querySelector('[data-testid="arena-status-icon-core"]')
        ?.getAttribute("data-active")
    ).toBe("true");

    view.setProps({ aiPanelOpen: true, arenaStatus: "open" });
    const restWrap = view.container.querySelector('[data-testid="arena-status-icon"]');
    expect(view.container.querySelectorAll('[data-testid="arena-status-icon"]')).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(restWrap?.getAttribute("data-state")).toBe("open");
    expect(restWrap?.getAttribute("data-motion")).toBe("static");
    expect(
      view.container
        .querySelector('[data-testid="arena-status-icon-core"]')
        ?.getAttribute("data-active")
    ).toBe("false");
    expect(restWrap?.querySelectorAll('[class*="arena-robot-"]')).toHaveLength(
      view.container.querySelectorAll('[class*="arena-robot-"]').length
    );
  });

  it("does not stack motion or duplicate wrappers across consecutive turns", () => {
    const view = renderBar({ aiPanelOpen: true, arenaStatus: "open" });
    view.setProps({ aiPanelOpen: true, arenaStatus: "active" });
    view.setProps({ aiPanelOpen: true, arenaStatus: "open" });
    view.setProps({ aiPanelOpen: true, arenaStatus: "active" });

    const wrappers = view.container.querySelectorAll('[data-testid="arena-status-icon"]');
    expect(wrappers).toHaveLength(1);
    expect(view.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(wrappers[0]?.getAttribute("data-state")).toBe("active");
    expect(wrappers[0]?.getAttribute("data-motion")).toBe("active");
    expect(wrappers[0]?.getAttribute("data-reduced")).toBe("false");
    expect(
      view.container.querySelectorAll('[data-testid="arena-status-icon"][data-motion="active"]')
    ).toHaveLength(1);

    view.setProps({ aiPanelOpen: true, arenaStatus: "open" });
    const rest = view.container.querySelector('[data-testid="arena-status-icon"]');
    expect(view.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(rest?.getAttribute("data-motion")).toBe("static");
    expect(rest?.getAttribute("data-state")).toBe("open");
    expect(
      view.container.querySelectorAll('[data-testid="arena-status-icon"][data-motion="active"]')
    ).toHaveLength(0);
  });

  it("keeps the arena icon static when reduced motion is preferred", () => {
    stubMatchMedia(true);
    const view = renderBar({ aiPanelOpen: true, arenaStatus: "active" });
    const wrap = view.container.querySelector('[data-testid="arena-status-icon"]');
    expect(wrap?.getAttribute("data-state")).toBe("active");
    expect(wrap?.getAttribute("data-reduced")).toBe("true");
    expect(wrap?.getAttribute("data-motion")).toBe("static");
    expect(view.container.querySelectorAll('[data-testid="arena-status-robot"]')).toHaveLength(1);
    expect(
      view.container
        .querySelector('[data-testid="arena-status-icon-core"]')
        ?.getAttribute("data-active")
    ).toBe("true");
    expect(
      view.container.querySelectorAll('[data-testid="arena-status-icon"][data-motion="active"]')
    ).toHaveLength(0);
  });

  it("maps motion only for active turns without reduced motion", () => {
    expect(arenaStatusMotionMode("idle", false)).toBe("static");
    expect(arenaStatusMotionMode("open", false)).toBe("static");
    expect(arenaStatusMotionMode("active", false)).toBe("active");
    expect(arenaStatusMotionMode("active", true)).toBe("static");
  });

  it("gates active animation behind prefers-reduced-motion in CSS", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../../src/renderer/styles/arena-status-icon-motion.css"),
      "utf8"
    );
    expect(css).toContain("@keyframes caval-arena-robot-pose");
    expect(css).toContain("@keyframes caval-arena-robot-head");
    expect(css).toContain("@keyframes caval-arena-robot-ear-left");
    expect(css).toContain("@keyframes caval-arena-robot-ear-right");
    expect(css).toContain("@keyframes caval-arena-robot-antenna");
    expect(css).toContain('[data-motion="active"]');
    expect(css).toContain(".arena-robot-ear-left");
    expect(css).toContain("rotate(");
    expect(css).not.toContain("caval-arena-status-active");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("transform: none !important");

    const entry = fs.readFileSync(
      path.join(__dirname, "../../src/renderer/workbench-app.tsx"),
      "utf8"
    );
    expect(entry).toContain("arena-status-icon-motion.css");
  });
});

function snapshot(overall: ConnectionHealthSnapshot["overall"]): ConnectionHealthSnapshot {
  return {
    overall,
    railway: overall,
    mcp: "skipped",
    checkedAt: Date.now(),
  };
}

function stubConnectionHealth(impl: () => Promise<ConnectionHealthSnapshot>) {
  Object.assign(window, {
    caval: { connectionHealth: impl },
  });
}

async function flushAct() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ConnectionStatusIndicator", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useEditorStore.setState({ projectPath: null });
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    stubConnectionHealth(async () => snapshot("unknown"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders unknown until a verified check succeeds", () => {
    stubConnectionHealth(() => new Promise(() => undefined));
    const { container, unmount } = mount(<ConnectionStatusIndicator />);
    const dot = container.querySelector('[data-testid="statusbar-connection-indicator"]');
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("aria-label")).toMatch(/status unavailable|status conexiune indisponibil/i);
    expect(dot?.getAttribute("data-connection-state")).toBe("unknown");
    expect(fetchSpy).not.toHaveBeenCalled();
    unmount();
  });

  it("renders healthy, degraded, and unavailable from the preload snapshot", async () => {
    const cases: Array<{ overall: ConnectionHealthSnapshot["overall"]; label: RegExp }> = [
      { overall: "healthy", label: /healthy|sănătoase/i },
      { overall: "degraded", label: /degraded|degradată/i },
      { overall: "unavailable", label: /^Connection unavailable$|^Conexiune indisponibilă$/ },
    ];

    for (const { overall, label } of cases) {
      stubConnectionHealth(async () => snapshot(overall));
      const { container, unmount } = mount(<ConnectionStatusIndicator />);
      await flushAct();
      const dot = container.querySelector('[data-testid="statusbar-connection-indicator"]');
      expect(dot?.getAttribute("data-connection-state")).toBe(overall);
      expect(dot?.getAttribute("aria-label")).toMatch(label);
      expect(fetchSpy).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("keeps status-bar order Problems → Connection → Branch", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/renderer/WorkbenchRoot.tsx"),
      "utf8"
    );
    const problems = src.indexOf("statusBar.problemsSummary");
    const connection = src.indexOf("<ConnectionStatusIndicator");
    const branch = src.indexOf("statusBar.noGit");
    expect(problems).toBeGreaterThan(-1);
    expect(connection).toBeGreaterThan(problems);
    expect(branch).toBeGreaterThan(connection);

    const connectionItem = src.slice(Math.max(0, connection - 160), connection);
    expect(connectionItem).not.toContain("connectionUnavailableTooltip");
    expect(connectionItem).not.toMatch(/title=\{t\(/);
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
