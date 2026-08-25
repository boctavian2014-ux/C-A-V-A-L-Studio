/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageFeedbackButtons } from "../../ai/composer/MessageFeedback";

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

describe("7e.2 MessageFeedback UI", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
    delete (window as { caval?: unknown }).caval;
  });

  function mockAiHistory(overrides?: Partial<{
    getFeedback: ReturnType<typeof vi.fn>;
    setFeedback: ReturnType<typeof vi.fn>;
    clearFeedback: ReturnType<typeof vi.fn>;
  }>) {
    const getFeedback =
      overrides?.getFeedback ??
      vi.fn(async () => ({ ok: true, feedback: null }));
    const setFeedback =
      overrides?.setFeedback ??
      vi.fn(async (_id: string, rating: "positive" | "negative", comment?: string) => ({
        ok: true,
        feedback: {
          id: "fb-1",
          messageId: "msg-1",
          rating,
          comment,
          createdAt: Date.now(),
        },
      }));
    const clearFeedback =
      overrides?.clearFeedback ?? vi.fn(async () => ({ ok: true }));
    (window as unknown as { caval: { aiHistory: unknown } }).caval = {
      aiHistory: { getFeedback, setFeedback, clearFeedback },
    };
    return { getFeedback, setFeedback, clearFeedback };
  }

  it("renders thumbs only for the feedback control", async () => {
    mockAiHistory();
    const { container, unmount } = mount(
      <MessageFeedbackButtons messageId="msg-1" streamId="s1" />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="message-feedback"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="message-feedback-up"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="message-feedback-down"]')).toBeTruthy();
  });

  it("hides controls when the assistant message is not persisted", async () => {
    const getFeedback = vi.fn(async () => ({ ok: false, error: "Message not found" }));
    mockAiHistory({ getFeedback });
    const { container, unmount } = mount(
      <MessageFeedbackButtons messageId="transient-msg" streamId="stopped-stream" />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="message-feedback"]')).toBeNull();
  });

  it("sets positive feedback on click", async () => {
    const { setFeedback } = mockAiHistory();
    const { container, unmount } = mount(
      <MessageFeedbackButtons messageId="msg-1" streamId="s1" />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector('[data-testid="message-feedback-up"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(setFeedback).toHaveBeenCalledWith("msg-1", "positive", undefined, "s1");
  });

  it("opens optional comment on negative and submits", async () => {
    const { setFeedback } = mockAiHistory();
    const { container, unmount } = mount(
      <MessageFeedbackButtons messageId="msg-1" />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector('[data-testid="message-feedback-down"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="message-feedback-comment"]')).toBeTruthy();
    const area = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(area, "missed the bug");
      area.dispatchEvent(new Event("input", { bubbles: true }));
      container
        .querySelector('[data-testid="message-feedback-comment-submit"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(setFeedback).toHaveBeenCalledWith(
      "msg-1",
      "negative",
      "missed the bug",
      undefined
    );
  });

  it("toggles off when clicking the same rating", async () => {
    const clearFeedback = vi.fn(async () => ({ ok: true }));
    const getFeedback = vi.fn(async () => ({
      ok: true,
      feedback: {
        id: "fb-1",
        messageId: "msg-1",
        rating: "positive" as const,
        createdAt: 1,
      },
    }));
    mockAiHistory({ getFeedback, clearFeedback });
    const { container, unmount } = mount(
      <MessageFeedbackButtons messageId="msg-1" />
    );
    mounted = { unmount };
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector('[data-testid="message-feedback-up"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(clearFeedback).toHaveBeenCalledWith("msg-1", undefined);
  });
});
