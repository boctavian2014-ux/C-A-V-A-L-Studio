/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn(async () => undefined);
const retryLastTurn = vi.fn(async () => undefined);

let aiState = {
  agentMode: "agentic" as string,
  messages: [{ role: "user" as const, content: "continue", id: "u1", multiAgentStatus: undefined as string | undefined, isStreaming: false }],
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
import { ChatStoppedRetry } from "../../ai/composer/ChatStoppedRetry";
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

const stoppedMessages = [
  { role: "user" as const, content: "long agentic job", id: "u-stop", multiAgentStatus: undefined as string | undefined, isStreaming: false },
  {
    id: "a-stop",
    role: "assistant" as const,
    content: "■ Oprit. Conversația de mai sus rămâne ca context — poți continua sau reformula cererea.",
    multiAgentStatus: "Oprit",
    isStreaming: false,
  },
];

afterEach(() => {
  sendMessage.mockClear();
  retryLastTurn.mockClear();
  aiState = {
    agentMode: "agentic",
    messages: [{ role: "user", content: "continue", id: "u1", multiAgentStatus: undefined, isStreaming: false }],
    isStreaming: false,
    sendMessage,
    retryLastTurn,
  };
  useFallbackStatusStore.getState().resetRoute();
});

describe("Retry single surface", () => {
  it("keeps header Retry for Agentic cooldown only", () => {
    useFallbackStatusStore.setState({
      activeProvider: "nvidia",
      fallbackFrom: null,
      agenticBlockedProvider: "nvidia",
      agenticBlockedUntil: Date.now() - 1,
    });
    const { container, unmount } = mount(<ChatFallbackStatus />);
    const retry = container.querySelector('[data-testid="chat-agentic-retry"]') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(retry.disabled).toBe(false);
    act(() => {
      retry.click();
    });
    expect(retryLastTurn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("does not put Stop Retry in the header", () => {
    aiState = {
      agentMode: "code",
      isStreaming: false,
      sendMessage,
      retryLastTurn,
      messages: stoppedMessages,
    };
    const { container, unmount } = mount(<ChatFallbackStatus />);
    expect(container.querySelector('[data-testid="chat-agentic-retry"]')).toBeNull();
    unmount();
  });

  it("shows Stop Retry only on the interrupted bubble and calls retryLastTurn", () => {
    aiState = {
      agentMode: "code",
      isStreaming: false,
      sendMessage,
      retryLastTurn,
      messages: stoppedMessages,
    };
    const { container, unmount } = mount(
      <>
        <ChatFallbackStatus />
        <ChatStoppedRetry messageId="a-stop" />
      </>
    );
    const retries = container.querySelectorAll('[data-testid="chat-agentic-retry"]');
    expect(retries).toHaveLength(1);
    expect(retries[0]?.closest(".chat-fallback-status")).toBeNull();
    act(() => {
      (retries[0] as HTMLButtonElement).click();
    });
    expect(retryLastTurn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows NVIDIA -> Ollama badge after fallback without a Retry", () => {
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
    expect(container.querySelector('[data-testid="chat-agentic-retry"]')).toBeNull();
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
