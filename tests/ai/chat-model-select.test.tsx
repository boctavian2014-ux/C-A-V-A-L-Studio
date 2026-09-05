/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CavalModelCatalog } from "../../src/main/preload";
import { zIndex } from "../../themes/tokens/z-index";

const setModel = vi.fn();

const aiState = {
  selectedModel: "openrouter:minimax/minimax-m3",
  setModel,
  activeResolvedModel: null as string | null,
  modelLabels: {
    "openrouter:minimax/minimax-m3": "MiniMax: MiniMax M3 (free)",
    "caval-auto/free": "Auto Free",
    "openrouter:deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
    "ollama:qwen2.5-coder": "Qwen2.5 Coder",
  },
  agentMode: "code" as const,
};

vi.mock("../../ai/composer/ai-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/composer/ai-store")>();
  return {
    ...actual,
    useAIStore: (select?: (s: typeof aiState) => unknown) =>
      select ? select(aiState) : aiState,
  };
});

import { ChatModelSelect } from "../../ai/composer/ChatModelSelect";

const catalog: CavalModelCatalog = {
  auto: [
    {
      id: "caval-auto/free",
      label: "Auto Free",
      tier: "auto",
      source: "caval",
      provider: "caval",
      contextWindow: 0,
      color: "#2FBF71",
      isAuto: true,
    },
  ],
  free: [
    {
      id: "openrouter:minimax/minimax-m3",
      label: "MiniMax: MiniMax M3 (free)",
      tier: "free",
      source: "openrouter",
      provider: "minimax",
      contextWindow: 0,
      color: "#61AFEF",
    },
    {
      id: "openrouter:deepseek/deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      tier: "free",
      source: "openrouter",
      provider: "deepseek",
      contextWindow: 0,
      color: "#61AFEF",
    },
    {
      id: "ollama:qwen2.5-coder",
      label: "Qwen2.5 Coder",
      tier: "free",
      source: "local",
      provider: "ollama",
      contextWindow: 0,
      color: "#61AFEF",
    },
    {
      id: "ollama:llama3",
      label: "Llama 3",
      tier: "free",
      source: "local",
      provider: "ollama",
      contextWindow: 0,
      color: "#61AFEF",
    },
  ],
  paid: [],
  coding: [],
  all: [],
  fetchedAt: Date.now(),
};

let healthById: Record<string, string> = {};

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

async function flushHealth() {
  await act(async () => {
    await Promise.resolve();
  });
}

function trigger(): HTMLButtonElement {
  return document.querySelector('[data-testid="chat-model-select"]') as HTMLButtonElement;
}

function openMenu() {
  act(() => {
    trigger().click();
  });
}

function option(id: string): HTMLElement {
  return document.querySelector(`[data-model-id="${id}"]`) as HTMLElement;
}

function press(key: string, target: EventTarget = trigger()) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("ChatModelSelect", () => {
  beforeEach(() => {
    healthById = {};
    window.caval = {
      modelsHealth: vi.fn(async () => ({ models: healthById })),
    } as unknown as Window["caval"];
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  });

  afterEach(() => {
    document.body.replaceChildren();
    setModel.mockClear();
    vi.restoreAllMocks();
  });

  it("renders model names in a custom menu, not a native select", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    expect(document.querySelector("select")).toBeNull();

    const button = trigger();
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toContain("MiniMax: MiniMax M3 (free)");
    expect(button.textContent).not.toMatch(/[●○◌]/);

    openMenu();

    const menu = document.querySelector('[data-testid="chat-model-menu"]');
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain("DeepSeek V4 Flash");
    expect(menu?.textContent).toContain("MiniMax: MiniMax M3 (free)");
    expect(menu?.textContent).toContain("Auto Free");
    view.unmount();
  });

  it("keeps the trigger label free of health prefixes and puts status in the tooltip", async () => {
    healthById = { "openrouter:minimax/minimax-m3": "missing_key" };
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    const button = trigger();
    expect(button.textContent?.trim()).toBe("MiniMax: MiniMax M3 (free)");
    expect(button.getAttribute("title")).toContain("Cheie lipsă");
    expect(button.getAttribute("aria-label")).toContain("Cheie lipsă");
    view.unmount();
  });

  it("shows unavailable models with a reason and does not select them", async () => {
    healthById = {
      "openrouter:deepseek/deepseek-v4-flash": "missing_key",
      "ollama:qwen2.5-coder": "not_installed",
      "ollama:llama3": "ollama_down",
    };
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();

    const missing = option("openrouter:deepseek/deepseek-v4-flash");
    expect(missing.getAttribute("aria-disabled")).toBe("true");
    expect(missing.textContent).toContain("DeepSeek V4 Flash");
    expect(missing.textContent).toContain("Cheie lipsă");
    expect(missing.getAttribute("title")).toContain("Cheie lipsă");
    expect(missing.getAttribute("aria-label")).toContain("Cheie lipsă");

    act(() => {
      missing.click();
    });
    expect(setModel).not.toHaveBeenCalled();

    const unpulled = option("ollama:qwen2.5-coder");
    expect(unpulled.getAttribute("aria-disabled")).toBe("true");
    expect(unpulled.textContent).toContain("Nepullat în Ollama");

    const offline = option("ollama:llama3");
    expect(offline.getAttribute("aria-disabled")).toBe("true");
    expect(offline.textContent).toContain("Ollama offline");
    view.unmount();
  });

  it("keeps Auto routes selectable even when health is negative", async () => {
    healthById = { "caval-auto/free": "missing_key" };
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();
    const auto = option("caval-auto/free");
    expect(auto.getAttribute("aria-disabled")).toBeNull();
    act(() => {
      auto.click();
    });
    expect(setModel).toHaveBeenCalledWith("caval-auto/free");
    view.unmount();
  });

  it("treats unknown health as selectable", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();
    const deepseek = option("openrouter:deepseek/deepseek-v4-flash");
    expect(deepseek.getAttribute("aria-disabled")).toBeNull();
    act(() => {
      deepseek.click();
    });
    expect(setModel).toHaveBeenCalledWith("openrouter:deepseek/deepseek-v4-flash");
    view.unmount();
  });

  it("places the portal below modal overlays", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();
    const menu = document.querySelector('[data-testid="chat-model-menu"]') as HTMLElement;
    expect(menu.style.zIndex).toBe(String(zIndex.dropdown));
    expect(Number(menu.style.zIndex)).toBe(400);
    expect(Number(menu.style.zIndex)).toBeLessThan(zIndex.modalOverlay);
    expect(Number(menu.style.zIndex)).toBeLessThan(zIndex.modal);
    view.unmount();
  });

  it("opens the menu upward when there is little space below", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.getAttribute("data-testid") === "chat-model-select") {
        return {
          x: 8,
          y: 500,
          top: 500,
          bottom: 524,
          left: 8,
          right: 168,
          width: 160,
          height: 24,
          toJSON() {
            return {};
          },
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON() {
          return {};
        },
      } as DOMRect;
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 560 });

    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();
    const menu = document.querySelector('[data-testid="chat-model-menu"]') as HTMLElement;
    expect(menu.getAttribute("data-placement")).toBe("up");
    view.unmount();
  });

  it("navigates with arrows, confirms with Enter, and restores focus", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    const button = trigger();
    button.focus();
    openMenu();
    expect(document.activeElement).toBe(button);

    press("Home");
    expect(button.getAttribute("aria-activedescendant")).toBe("caval-model-option-caval-auto_free");

    press("ArrowDown");
    const active = button.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    expect(active).not.toBe("caval-model-option-caval-auto_free");

    const activeOption = document.getElementById(active ?? "");
    const activeModelId = activeOption?.getAttribute("data-model-id");
    press("Enter");
    expect(setModel).toHaveBeenCalledWith(activeModelId);
    expect(document.querySelector('[data-testid="chat-model-menu"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    view.unmount();
  });

  it("does not select an unavailable model with Enter", async () => {
    healthById = { "openrouter:deepseek/deepseek-v4-flash": "missing_key" };
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    trigger().focus();
    openMenu();
    const ids = [...document.querySelectorAll("[data-model-id]")].map((el) => el.getAttribute("data-model-id"));
    const deepseekIndex = ids.indexOf("openrouter:deepseek/deepseek-v4-flash");
    press("Home");
    for (let i = 0; i < deepseekIndex; i += 1) {
      press("ArrowDown");
    }
    expect(trigger().getAttribute("aria-activedescendant")).toContain("deepseek");
    press("Enter");
    expect(setModel).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="chat-model-menu"]')).toBeTruthy();
    view.unmount();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    const button = trigger();
    button.focus();
    openMenu();
    press("Escape");
    expect(document.querySelector('[data-testid="chat-model-menu"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    view.unmount();
  });

  it("closes when clicking outside the menu", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    await flushHealth();
    openMenu();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(document.querySelector('[data-testid="chat-model-menu"]')).toBeNull();
    view.unmount();
  });

  it("disables the trigger while the catalog is loading", async () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading variant="compact" />);
    await flushHealth();
    const button = trigger();
    expect(button.disabled).toBe(true);
    openMenu();
    expect(document.querySelector('[data-testid="chat-model-menu"]')).toBeNull();
    view.unmount();
  });
});
