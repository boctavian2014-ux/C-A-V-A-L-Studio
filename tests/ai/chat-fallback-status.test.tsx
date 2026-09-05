/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn(async () => undefined);
const retryLastTurn = vi.fn(async () => undefined);

let aiState = {
  agentMode: "agentic" as string,
  messages: [{ role: "user" as const, content: "continue", multiAgentStatus: undefined as string | undefined, isStreaming: false }],
  isStreaming: false,
  sendMessage,
  retryLastTurn,
};

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (key === "ai.fallback.retry") return "Retry";
      if (key === "ai.fallback.retryIn") return `Retry (${vars?.seconds ?? "0"}s)`;
      return key;
    },
  }),
}));

vi.mock("../../ai/composer/ai-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../ai/composer/ai-store")>();
  return {
    ...actual,
    useAIStore: (select: (s: typeof aiState) => unknown) => select(aiState),
  };
});

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
  sendMessage.mockClear();
  retryLastTurn.mockClear();
  aiState = {
    agentMode: "agentic",
    messages: [{ role: "user", content: "continue", multiAgentStatus: undefined, isStreaming: false }],
    isStreaming: false,
    sendMessage,
    retryLastTurn,
  };
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

  it("shows native Retry after Stop and resends without a new typed prompt", () => {
    aiState = {
      agentMode: "code",
      isStreaming: false,
      sendMessage,
      retryLastTurn,
      messages: [
        { role: "user", content: "long agentic job", multiAgentStatus: undefined, isStreaming: false },
        {
          role: "assistant",
          content: "■ Oprit. Conversația de mai sus rămâne ca context — poți continua sau reformula cererea.",
          multiAgentStatus: "Oprit",
          isStreaming: false,
        },
      ],
    };
    const { container, unmount } = mount(<ChatFallbackStatus />);
    const retry = container.querySelector('[data-testid="chat-agentic-retry"]') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(retry.disabled).toBe(false);
    expect(retry.textContent).toBe("Retry");
    act(() => {
      retry.click();
    });
    expect(retryLastTurn).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    unmount();
  });
});
