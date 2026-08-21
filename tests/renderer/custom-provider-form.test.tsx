/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CustomProviderForm,
  validateCustomProviderDraft,
} from "../../ai/composer/CustomProviderForm";

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

describe("7f.4 CustomProviderForm", () => {
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

  it("validateCustomProviderDraft requires modelId", () => {
    expect(
      validateCustomProviderDraft({
        baseUrl: "http://localhost:1234/v1",
        modelId: "",
      })
    ).toMatch(/Model ID is required/i);
  });

  it("Save without modelId shows error and skips IPC", async () => {
    const secretsSet = vi.fn();
    window.caval = {
      secretsGet: vi.fn(async () => ({ ok: true, configured: {} })),
      secretsSet,
    } as Window["caval"];

    const { container, unmount } = mount(
      <CustomProviderForm
        initialDraft={{ baseUrl: "http://localhost:1234/v1", modelId: "" }}
      />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });

    const saveBtn = container.querySelector(
      '[data-testid="custom-provider-save-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      saveBtn.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="custom-provider-error"]')?.textContent).toMatch(
      /Model ID is required/i
    );
    expect(secretsSet).not.toHaveBeenCalled();
  });

  it("Test connection does not require Save", async () => {
    const secretsSet = vi.fn();
    const testProviderKey = vi.fn(async () => ({
      ok: true as const,
      result: "valid" as const,
    }));
    window.caval = {
      secretsGet: vi.fn(async () => ({ ok: true, configured: {} })),
      secretsSet,
      testProviderKey,
    } as Window["caval"];

    const { container, unmount } = mount(
      <CustomProviderForm
        initialDraft={{
          baseUrl: "http://localhost:1234/v1",
          modelId: "local-model",
        }}
      />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });

    const testBtn = container.querySelector(
      '[data-testid="custom-provider-test-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      testBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(testProviderKey).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "custom",
        draft: expect.objectContaining({
          baseUrl: "http://localhost:1234/v1",
        }),
      })
    );
    expect(secretsSet).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="custom-provider-message"]')?.textContent).toMatch(
      /successful/i
    );
  });
});
