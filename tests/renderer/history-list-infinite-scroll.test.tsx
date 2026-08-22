/** @vitest-environment jsdom */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HistoryList } from "../../ai/composer/HistoryList";
import type { ConversationSummary } from "../../src/shared/ai-history-contract";

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

function conv(id: string, title: string): ConversationSummary {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 2,
    messageCount: 1,
  };
}

class NoopIntersectionObserver {
  observe() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
  unobserve() {
    /* noop */
  }
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}

describe("7e.4 HistoryList infinite scroll", () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.restoreAllMocks();
  });

  it("renders items and a sentinel when hasMore", () => {
    const onLoadMore = vi.fn();
    const { container, unmount } = mount(
      <HistoryList
        conversations={[conv("a", "A"), conv("b", "B")]}
        activeId="a"
        hasMore
        loadingMore={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );
    mounted = { unmount };
    expect(container.querySelectorAll('[data-testid="ai-history-item"]').length).toBe(2);
    expect(container.querySelector('[data-testid="ai-history-sentinel"]')).toBeTruthy();
  });

  it("hides sentinel when hasMore is false", () => {
    const { container, unmount } = mount(
      <HistoryList
        conversations={[conv("a", "A")]}
        activeId={null}
        hasMore={false}
        loadingMore={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onLoadMore={vi.fn()}
      />
    );
    mounted = { unmount };
    expect(container.querySelector('[data-testid="ai-history-sentinel"]')).toBeFalsy();
  });

  it("invokes onLoadMore when sentinel intersects", () => {
    const onLoadMore = vi.fn();
    let observerCb: IntersectionObserverCallback | null = null;
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        observerCb = cb;
      }
      observe() {
        /* noop */
      }
      disconnect() {
        /* noop */
      }
      unobserve() {
        /* noop */
      }
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);

    const { unmount } = mount(
      <HistoryList
        conversations={[conv("a", "A")]}
        activeId={null}
        hasMore
        loadingMore={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onLoadMore={onLoadMore}
      />
    );
    mounted = { unmount };

    act(() => {
      observerCb?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(onLoadMore).toHaveBeenCalled();
  });
});
