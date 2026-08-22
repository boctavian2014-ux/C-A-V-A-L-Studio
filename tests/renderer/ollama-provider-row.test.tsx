/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OllamaProviderRow } from "../../ai/composer/AiProvidersPanel";
import {
  DEFAULT_OLLAMA_MODEL_ID,
  formatApproxBytes,
  OLLAMA_LOOPBACK_URL,
  OLLAMA_MODEL_SIZES,
  type LocalAiStatus,
} from "../../src/shared/local-ai-contract";

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

function status(partial: Partial<LocalAiStatus>): LocalAiStatus {
  return {
    phase: "not-installed",
    installed: false,
    reachable: false,
    managedByCaval: false,
    defaultModel: DEFAULT_OLLAMA_MODEL_ID,
    defaultModelReady: false,
    endpoint: OLLAMA_LOOPBACK_URL,
    updatedAt: 1,
    supported: true,
    platform: "win32",
    running: false,
    configuredUrl: OLLAMA_LOOPBACK_URL,
    models: [],
    inProgress: false,
    policy: "test",
    ...partial,
  };
}

describe("7f.3 OllamaProviderRow", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("shows Install button and disables it while installing", async () => {
    let resolveInstall: ((v: { success: boolean }) => void) | undefined;
    window.caval = {
      localAiInstall: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveInstall = resolve;
          })
      ),
    } as Window["caval"];

    const { container, unmount } = mount(
      <OllamaProviderRow status={status({ phase: "not-installed" })} providerStatus="not-installed" />
    );
    mounted = { unmount };

    const btn = container.querySelector('[data-testid="ollama-install-btn"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);

    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toMatch(/Installing/i);

    await act(async () => {
      resolveInstall?.({ success: true });
      await Promise.resolve();
    });
  });

  it("Download button shows size from OLLAMA_MODEL_SIZES", () => {
    window.caval = {} as Window["caval"];
    const { container, unmount } = mount(
      <OllamaProviderRow
        status={status({ phase: "model-missing", installed: true, reachable: true })}
        providerStatus="model-missing"
      />
    );
    mounted = { unmount };
    const btn = container.querySelector('[data-testid="ollama-download-model-btn"]');
    expect(btn?.textContent).toContain(OLLAMA_MODEL_SIZES[DEFAULT_OLLAMA_MODEL_ID]!.label);
    expect(btn?.textContent).toContain(
      formatApproxBytes(OLLAMA_MODEL_SIZES[DEFAULT_OLLAMA_MODEL_ID]!.approxBytes)
    );
  });

  it("does not call install when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const install = vi.fn();
    window.caval = { localAiInstall: install } as Window["caval"];
    const { container, unmount } = mount(
      <OllamaProviderRow status={status({ phase: "not-installed" })} providerStatus="not-installed" />
    );
    mounted = { unmount };
    const btn = container.querySelector('[data-testid="ollama-install-btn"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(install).not.toHaveBeenCalled();
  });
});
