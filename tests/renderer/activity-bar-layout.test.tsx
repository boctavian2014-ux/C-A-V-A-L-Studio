/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityBar } from "../../src/renderer/components/sidebar/ActivityBar";
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
      previewStatus: { web: "stopped", mobile: "stopped" },
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
