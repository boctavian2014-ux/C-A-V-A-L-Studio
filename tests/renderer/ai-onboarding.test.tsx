/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIOnboarding, AI_ONBOARDING_SUGGESTIONS } from "../../ai/composer/AIOnboarding";
import { FeatureFirstUseTip } from "../../src/renderer/components/ai/FeatureFirstUseTip";
import {
  ONBOARDING_SEEN_KEY,
  hasSeenFeature,
  markFeatureSeen,
  resetOnboardingSeenForTests,
} from "../../src/renderer/store/onboarding-store";

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

describe("7e.1 AI onboarding", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    resetOnboardingSeenForTests();
    localStorage.clear();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    resetOnboardingSeenForTests();
    vi.restoreAllMocks();
  });

  it("hasSeenFeature / markFeatureSeen persist in localStorage once", () => {
    expect(hasSeenFeature("quick-fix")).toBe(false);
    markFeatureSeen("quick-fix");
    expect(hasSeenFeature("quick-fix")).toBe(true);
    const raw = localStorage.getItem(ONBOARDING_SEEN_KEY);
    expect(raw).toContain("quick-fix");
    markFeatureSeen("quick-fix");
    expect(JSON.parse(localStorage.getItem(ONBOARDING_SEEN_KEY)!)).toEqual({
      "quick-fix": true,
    });
  });

  it("renders empty-state suggestions and tools expand", () => {
    const onStartChat = vi.fn();
    const { container } = mount(<AIOnboarding onStartChat={onStartChat} />);
    mounted = { unmount: () => undefined };
    expect(container.querySelector('[data-testid="ai-onboarding"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="ai-onboarding-tools"]')).toBeTruthy();
    for (const s of AI_ONBOARDING_SUGGESTIONS) {
      expect(container.querySelector(`[data-testid="ai-onboarding-suggestion-${s.id}"]`)).toBeTruthy();
    }
  });

  it("clicking a prompt suggestion starts chat with that prompt", () => {
    const onStartChat = vi.fn();
    const { container, unmount } = mount(<AIOnboarding onStartChat={onStartChat} />);
    mounted = { unmount };
    const fix = container.querySelector(
      '[data-testid="ai-onboarding-suggestion-fix"]'
    ) as HTMLButtonElement | null;
    expect(fix).toBeTruthy();
    act(() => {
      fix?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartChat).toHaveBeenCalledWith("Fix the errors in my current file");
  });

  it("explain suggestion shows hint instead of starting chat", () => {
    const onStartChat = vi.fn();
    const { container, unmount } = mount(<AIOnboarding onStartChat={onStartChat} />);
    mounted = { unmount };
    const explain = container.querySelector(
      '[data-testid="ai-onboarding-suggestion-explain"]'
    ) as HTMLButtonElement | null;
    act(() => {
      explain?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onStartChat).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="ai-onboarding-hint"]')?.textContent).toMatch(
      /Explain/i
    );
  });

  it("feature tip appears once then stays dismissed", () => {
    const first = mount(<FeatureFirstUseTip feature="quick-fix" active />);
    expect(first.container.querySelector('[data-testid="onboarding-tip-quick-fix"]')).toBeTruthy();
    act(() => {
      first.container
        .querySelector('[data-testid="onboarding-tip-dismiss-quick-fix"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(first.container.querySelector('[data-testid="onboarding-tip-quick-fix"]')).toBeFalsy();
    expect(hasSeenFeature("quick-fix")).toBe(true);
    first.unmount();

    const second = mount(<FeatureFirstUseTip feature="quick-fix" active />);
    mounted = { unmount: second.unmount };
    expect(second.container.querySelector('[data-testid="onboarding-tip-quick-fix"]')).toBeFalsy();
  });
});
