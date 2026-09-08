/** @vitest-environment jsdom */
import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tFn = (key: string) => key;

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({ t: tFn }),
}));

vi.mock("../../themes/theme-provider", () => ({
  useCavalTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

const settingsState = {
  activeSection: "subscription" as const,
  setActiveSection: vi.fn(),
  app: { theme: "dark" as const, fontSize: 14, tabSize: 2, wordWrap: false, minimap: true },
  updateApp: vi.fn(),
};

vi.mock("../../src/renderer/store/settings-store", () => ({
  useSettingsStore: Object.assign(
    (selector?: (s: typeof settingsState) => unknown) =>
      typeof selector === "function" ? selector(settingsState) : settingsState,
    {
      getState: () => settingsState,
    }
  ),
}));

vi.mock("../../src/renderer/store/editor-store", () => ({
  useEditorStore: (selector: (s: { projectPath: string | null }) => unknown) =>
    selector({ projectPath: null }),
}));

vi.mock("../../ai/composer/ai-store", () => ({
  useAIStore: () => ({ strictReview: false, setStrictReview: vi.fn() }),
}));

vi.mock("../../ai/composer/ApiKeysForm", () => ({
  ApiKeysForm: () => null,
}));

vi.mock("../../ai/composer/AiProvidersPanel", () => ({
  AiProvidersPanel: () => null,
}));

vi.mock("../../src/renderer/components/brand/CavaloHorseMark", () => ({
  CavaloHorseMark: () => null,
}));

vi.mock("../../src/renderer/components/health/ProjectHealthPanel", () => ({
  ProjectHealthPanel: () => null,
}));

vi.mock("../../src/renderer/commands/workbench-toast", () => ({
  showWorkbenchToast: vi.fn(),
}));

import { SettingsPanel } from "../../src/renderer/components/settings/SettingsPanel";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  root.render(ui);
  return {
    container,
    unmount() {
      root?.unmount();
      root = null;
      container.remove();
    },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(
  container: HTMLElement,
  selector: string,
  timeoutMs = 2000
): Promise<Element> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = container.querySelector(selector);
    if (el) return el;
    await flush();
  }
  throw new Error(`timeout waiting for ${selector}`);
}

describe("Settings subscription section", () => {
  let view: ReturnType<typeof mount> | null = null;
  const openUpgrade = vi.fn(async () => ({
    ok: true,
    url: "https://checkout.revolut.com/pay/***",
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { caval: Record<string, unknown> }).caval = {
      subscriptionsMe: vi.fn(async () => ({
        ok: true,
        subscription: {
          plan: "free",
          status: "active",
          currentPeriodStart: "2026-09-01T00:00:00.000Z",
          currentPeriodEnd: "2026-10-01T00:00:00.000Z",
        },
        limits: {
          chatTokens: 50000,
          cadJobs: 3,
          zooBudgetUsd: 0,
          allowedModelTiers: ["fast"],
        },
        usage: {
          chatTokensUsed: 0,
          cadJobsUsed: 0,
          zooCostAccrued: 0,
          requestsUsed: 0,
        },
        modelUsage: [],
      })),
      subscriptionsOpenUpgrade: openUpgrade,
    };
  });

  afterEach(() => {
    view?.unmount();
    view = null;
  });

  it("renders free plan with zero usage and upgrade actions", async () => {
    view = mount(createElement(SettingsPanel));
    const plan = await waitFor(view.container, '[data-testid="subscription-plan"]');
    expect(plan.getAttribute("data-plan")).toBe("free");
    expect(view.container.querySelector('[data-testid="usage-chat-tokens"]')?.textContent).toContain(
      "0 / 50000"
    );
    expect(view.container.querySelector('[data-testid="subscription-upgrade-pro"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="subscription-upgrade-ultra"]')).toBeTruthy();
  });

  it("invokes openUpgrade for Pro", async () => {
    view = mount(createElement(SettingsPanel));
    const btn = (await waitFor(
      view.container,
      '[data-testid="subscription-upgrade-pro"]'
    )) as HTMLButtonElement;
    btn.click();
    await flush();
    expect(openUpgrade).toHaveBeenCalledWith({ plan: "pro" });
  });
});
