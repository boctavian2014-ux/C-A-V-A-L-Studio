/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CavalModelCatalog } from "../../src/main/preload";

const setModel = vi.fn();

const aiState = {
  selectedModel: "openrouter:minimax/minimax-m3",
  setModel,
  activeResolvedModel: null as string | null,
  modelLabels: {
    "openrouter:minimax/minimax-m3": "MiniMax: MiniMax M3 (free)",
    "caval-auto/free": "Auto Free",
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
  ],
  paid: [],
  coding: [],
  all: [],
  fetchedAt: Date.now(),
};

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

describe("ChatModelSelect", () => {
  afterEach(() => {
    document.body.replaceChildren();
    setModel.mockClear();
  });

  it("renders model names in a dark custom menu, not a native select", () => {
    const view = mount(<ChatModelSelect catalog={catalog} loading={false} variant="compact" />);
    expect(document.querySelector("select")).toBeNull();

    const trigger = document.querySelector('[data-testid="chat-model-select"]') as HTMLButtonElement;
    expect(trigger.textContent).toContain("MiniMax: MiniMax M3 (free)");

    act(() => {
      trigger.click();
    });

    const menu = document.querySelector(".caval-model-menu");
    expect(menu).toBeTruthy();
    expect(menu?.textContent).toContain("DeepSeek V4 Flash");
    expect(menu?.textContent).toContain("MiniMax: MiniMax M3 (free)");
    expect(menu?.textContent).toContain("Auto Free");
    view.unmount();
  });
});
