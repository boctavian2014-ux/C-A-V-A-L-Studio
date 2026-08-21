/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiProvidersPanel } from "../../ai/composer/AiProvidersPanel";
import type { AiProviderEntry } from "../../src/shared/ai-provider-contract";
import type { LocalAiStatus } from "../../src/shared/local-ai-contract";
import { OLLAMA_LOOPBACK_URL } from "../../src/shared/local-ai-contract";

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

const PROVIDERS: AiProviderEntry[] = [
  {
    id: "ollama",
    label: "Local & Free",
    description: "local",
    status: "starting",
    selectable: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "cloud",
    status: "not-configured",
    selectable: true,
    secretKey: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "cloud",
    status: "not-configured",
    selectable: true,
    secretKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "cloud",
    status: "not-configured",
    selectable: true,
    secretKey: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "hub",
    status: "not-configured",
    selectable: true,
    secretKey: "OPENROUTER_API_KEY",
  },
  {
    id: "custom",
    label: "Custom",
    description: "soon",
    status: "not-configured",
    selectable: false,
    comingSoon: true,
  },
];

describe("7f.2 AiProvidersPanel live status", () => {
  let mounted: { unmount: () => void } | undefined;
  let statusListener: ((status: LocalAiStatus) => void) | null = null;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    statusListener = null;
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("subscribes to localAiOnStatusChanged and unsubscribes on unmount", async () => {
    const unsubscribe = vi.fn();
    const list = vi.fn(async () => ({
      ok: true as const,
      providers: PROVIDERS,
      preferredProviderId: "ollama" as const,
      encryptionAvailable: true,
    }));
    window.caval = {
      aiProvidersList: list,
      localAiOnStatusChanged: (listener) => {
        statusListener = listener;
        return unsubscribe;
      },
    } as Window["caval"];

    const { unmount } = mount(<AiProvidersPanel />);
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(list).toHaveBeenCalled();
    expect(statusListener).toBeTruthy();

    list.mockClear();
    list.mockResolvedValue({
      ok: true as const,
      providers: PROVIDERS.map((p) =>
        p.id === "ollama" ? { ...p, status: "configured" as const } : p
      ),
      preferredProviderId: "ollama" as const,
      encryptionAvailable: true,
    });

    await act(async () => {
      statusListener?.({
        phase: "ready",
        installed: true,
        reachable: true,
        managedByCaval: true,
        defaultModel: "qwen2.5-coder:7b",
        defaultModelReady: true,
        endpoint: OLLAMA_LOOPBACK_URL,
        updatedAt: Date.now(),
        supported: true,
        platform: "win32",
        running: true,
        configuredUrl: OLLAMA_LOOPBACK_URL,
        models: ["qwen2.5-coder:7b"],
        inProgress: false,
        policy: "test",
      });
      await Promise.resolve();
    });
    expect(list).toHaveBeenCalled();

    unmount();
    mounted = undefined;
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("stays functional when localAiOnStatusChanged is missing", async () => {
    window.caval = {
      aiProvidersList: vi.fn(async () => ({
        ok: true as const,
        providers: PROVIDERS,
        preferredProviderId: "ollama" as const,
        encryptionAvailable: true,
      })),
    } as Window["caval"];
    const { container, unmount } = mount(<AiProvidersPanel />);
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="ai-providers-panel"]')).toBeTruthy();
    expect(container.textContent).toContain("Local & Free");
  });
});
