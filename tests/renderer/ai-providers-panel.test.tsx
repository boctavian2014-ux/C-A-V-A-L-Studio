/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiProvidersPanel } from "../../ai/composer/AiProvidersPanel";
import type { AiProviderEntry } from "../../src/shared/ai-provider-contract";

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
    status: "configured",
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
    label: "Custom OpenAI-compatible",
    description: "soon",
    status: "not-configured",
    selectable: false,
    comingSoon: true,
  },
];

describe("7f.1 AiProvidersPanel", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("renders Ollama first as Local & Free and disables custom without network", async () => {
    const list = vi.fn(async () => ({
      ok: true as const,
      providers: PROVIDERS,
      preferredProviderId: "ollama" as const,
      encryptionAvailable: true,
    }));
    const secretsSet = vi.fn();
    window.caval = {
      aiProvidersList: list,
      aiProvidersSetPreferred: vi.fn(),
      secretsSet,
      secretsGet: vi.fn(async () => ({
        ok: true,
        configured: { OPENAI_API_KEY: false },
      })),
    } as Window["caval"];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));

    const { container } = mount(<AiProvidersPanel />);
    mounted = { unmount: () => undefined };
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="ai-providers-panel"]')).toBeTruthy();
    expect(container.textContent).toContain("Local & Free");
    const rows = Array.from(container.querySelectorAll("[data-testid^='ai-provider-row-']"));
    expect(rows[0]?.getAttribute("data-testid")).toBe("ai-provider-row-ollama");
    const customRadio = container.querySelector(
      '[data-testid="ai-provider-radio-custom"]'
    ) as HTMLInputElement | null;
    expect(customRadio?.disabled).toBe(true);
    expect(container.textContent).toContain("Coming soon");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(secretsSet).not.toHaveBeenCalled();
  });

  it("shows encryption warning when safeStorage is unavailable", async () => {
    window.caval = {
      aiProvidersList: vi.fn(async () => ({
        ok: true as const,
        providers: PROVIDERS,
        preferredProviderId: "ollama" as const,
        encryptionAvailable: false,
      })),
    } as Window["caval"];

    const { container, unmount } = mount(<AiProvidersPanel />);
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="ai-providers-encryption-warning"]')?.textContent).toContain(
      "Key storage is not encrypted on this system."
    );
  });
});
