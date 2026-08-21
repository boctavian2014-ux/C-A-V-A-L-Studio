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

  it("renders suggestion grid without intro title/copy; tools stay collapsed", () => {
    const onStartChat = vi.fn();
    const { container } = mount(<AIOnboarding onStartChat={onStartChat} />);
    mounted = { unmount: () => undefined };
    expect(container.querySelector('[data-testid="ai-onboarding"]')).toBeTruthy();
    expect(container.textContent).not.toContain("What can AI help with?");
    expect(container.textContent).not.toContain(
      "Chat, quick fix, inline Tab, explain, refactor, and preview"
    );
    const tools = container.querySelector(
      '[data-testid="ai-onboarding-tools"]'
    ) as HTMLDetailsElement | null;
    expect(tools).toBeTruthy();
    expect(tools?.hasAttribute("open")).toBe(false);
    expect(tools?.open).toBe(false);
    for (const s of AI_ONBOARDING_SUGGESTIONS) {
      expect(container.querySelector(`[data-testid="ai-onboarding-suggestion-${s.id}"]`)).toBeTruthy();
    }
  });

  it("clicking prompt suggestions starts chat with the associated prompts", () => {
    const onStartChat = vi.fn();
    const { container, unmount } = mount(<AIOnboarding onStartChat={onStartChat} />);
    mounted = { unmount };

    const promptCards = AI_ONBOARDING_SUGGESTIONS.filter((s) => s.prompt);
    for (const s of promptCards) {
      onStartChat.mockClear();
      const card = container.querySelector(
        `[data-testid="ai-onboarding-suggestion-${s.id}"]`
      ) as HTMLButtonElement | null;
      expect(card).toBeTruthy();
      act(() => {
        card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onStartChat).toHaveBeenCalledWith(s.prompt);
    }
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
