/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ChatUnifiedTimeline,
  labelForTimelineType,
} from "../../ai/composer/ChatUnifiedTimeline";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";

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

const events: TimelineEvent[] = [
  {
    id: "e1",
    type: "tool_call",
    timestamp: Date.now(),
    label: "get_problems",
    detail: "scanned workspace",
  },
  {
    id: "e2",
    type: "error",
    timestamp: Date.now() + 1,
    label: "failed",
    detail: "boom",
  },
];

describe("7e.4 timeline a11y", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  it("exposes role=log, aria-live, and labeled events", () => {
    const { container, unmount } = mount(
      <ChatUnifiedTimeline
        message={{ timelineEvents: events, isStreaming: true, timelineExpanded: true }}
      />
    );
    mounted = { unmount };
    const log = container.querySelector('[data-testid="ai-unified-timeline"]');
    expect(log?.getAttribute("role")).toBe("log");
    expect(log?.getAttribute("aria-live")).toBe("polite");
    expect(log?.getAttribute("aria-label")).toBe("AI activity");
    const items = container.querySelectorAll('[data-testid="ai-timeline-event"]');
    expect(items.length).toBe(2);
    expect(items[0]?.getAttribute("aria-label")).toContain("Tool call");
    expect(items[0]?.getAttribute("tabindex")).toBe("0");
  });

  it("toggles detail with Enter/Space", () => {
    const { container, unmount } = mount(
      <ChatUnifiedTimeline
        message={{
          timelineEvents: [events[0]!],
          isStreaming: false,
          timelineExpanded: true,
        }}
      />
    );
    mounted = { unmount };
    const item = container.querySelector(
      '[data-testid="ai-timeline-event"]'
    ) as HTMLElement;
    expect(item.textContent).not.toContain("scanned workspace");
    act(() => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(item.textContent).toContain("scanned workspace");
    act(() => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    expect(item.textContent).not.toContain("scanned workspace");
  });

  it("maps timeline types to accessible labels", () => {
    expect(labelForTimelineType("tool_call")).toBe("Tool call");
    expect(labelForTimelineType("file_write")).toBe("File written");
    expect(labelForTimelineType("error")).toBe("Error");
  });
});
