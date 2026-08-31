/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (key === "ai.fallback.retry") return "Retry";
      if (key === "ai.fallback.retryIn") return `Retry (${vars?.seconds ?? "0"}s)`;
      return key;
    },
  }),
}));

vi.mock("../../ai/composer/ai-store", () => ({
  useAIStore: (select: (s: { agentMode: string; messages: Array<{ role: string; content: string }>; sendMessage: () => Promise<void> }) => unknown) =>
    select({
      agentMode: "agentic",
      messages: [{ role: "user", content: "continue" }],
      sendMessage: async () => undefined,
    }),
}));

import { ChatFallbackStatus } from "../../ai/composer/ChatFallbackStatus";
import { useFallbackStatusStore } from "../../ai/composer/fallback-status-store";

function mount(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  useFallbackStatusStore.getState().resetRoute();
});

describe("ChatFallbackStatus", () => {
  it("shows NVIDIA -> Ollama badge after fallback", () => {
    useFallbackStatusStore.setState({
      activeProvider: "ollama",
      fallbackFrom: "nvidia",
      agenticBlockedProvider: null,
      agenticBlockedUntil: null,
    });
    const { container, unmount } = mount(<ChatFallbackStatus />);
    expect(container.querySelector('[data-testid="chat-fallback-badge"]')?.textContent).toBe(
      "NVIDIA -> Ollama"
    );
    expect(container.querySelector('[data-testid="chat-active-provider"]')?.textContent).toBe(
      "Ollama"
    );
    unmount();
  });

  it("shows Retry countdown when Agentic is unavailable", () => {
    useFallbackStatusStore.setState({
      activeProvider: "nvidia",
      fallbackFrom: null,
      agenticBlockedProvider: "nvidia",
      agenticBlockedUntil: Date.now() + 12_000,
    });
    const { container, unmount } = mount(<ChatFallbackStatus />);
    const retry = container.querySelector('[data-testid="chat-agentic-retry"]') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(retry.disabled).toBe(true);
    expect(retry.textContent).toMatch(/Retry \(/);
    unmount();
  });
});
