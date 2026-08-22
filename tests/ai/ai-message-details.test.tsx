/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/i18n/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "ai.details.show" ? "Details" : key === "ai.details.hide" ? "Hide details" : key),
  }),
}));

import { AiMessageDetails } from "../../ai/composer/AiMessageDetails";

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

describe("AiMessageDetails", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("returns null when hasContent is false", () => {
    const result = mount(
      <AiMessageDetails hasContent={false}>
        <div>hidden</div>
      </AiMessageDetails>
    );
    mounted = result;
    expect(result.container.querySelector('[data-testid="ai-message-details"]')).toBeNull();
  });

  it("is collapsed by default and expands on click", () => {
    const result = mount(
      <AiMessageDetails hasContent>
        <div data-testid="details-child">pipeline</div>
      </AiMessageDetails>
    );
    mounted = result;
    expect(result.container.querySelector('[data-testid="ai-message-details-body"]')).toBeNull();
    act(() => {
      result.container
        .querySelector('[data-testid="ai-message-details-toggle"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(result.container.querySelector('[data-testid="ai-message-details-body"]')).toBeTruthy();
    expect(result.container.querySelector('[data-testid="details-child"]')).toBeTruthy();
  });
});
