/** @vitest-environment jsdom */
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArenaWaitMessage } from '../../ai/composer/use-arena-wait-message';
import type { MultiAgentPhase } from '../../ai/composer/chat-activity-types';
import { formatWaitElapsed } from '../../ai/composer/arena-wait-copy';

type HookArgs = {
  phase?: MultiAgentPhase;
  active: boolean;
  rotateMs?: number;
  detail?: string;
};

type HookState = {
  message: string;
  statusLine: string;
  visible: boolean;
};

function mockSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function renderWaitHook(initial: HookArgs) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);
  let latest: HookState | null = null;
  let setArgs: (updater: (prev: HookArgs) => HookArgs) => void = () => undefined;

  function Probe() {
    const [args, update] = useState(initial);
    setArgs = update;
    latest = useArenaWaitMessage(args.phase, args.active, args.rotateMs, args.detail);
    return null;
  }

  act(() => {
    root?.render(createElement(Probe));
  });

  return {
    get result() {
      if (!latest) throw new Error('hook did not render');
      return latest;
    },
    rerender(patch: Partial<HookArgs>) {
      act(() => {
        setArgs((prev) => ({ ...prev, ...patch }));
      });
    },
    unmount() {
      act(() => {
        root?.unmount();
        root = null;
      });
      container.remove();
    },
  };
}

describe('useArenaWaitMessage', () => {
  let mounted: { unmount: () => void } | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '';
    vi.stubGlobal('sessionStorage', mockSessionStorage());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T10:00:00.000Z'));
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns initial copy state on first render', () => {
    const hook = renderWaitHook({ phase: 'compose', active: false });
    mounted = hook;
    expect(hook.result.message.length).toBeGreaterThan(0);
    expect(hook.result.visible).toBe(true);
    expect(hook.result.statusLine).toBe(formatWaitElapsed(0, 'compose'));
  });

  it('skips rotation and elapsed updates when inactive', () => {
    const hook = renderWaitHook({
      phase: 'compose',
      active: false,
      rotateMs: 1000,
      detail: 'writing files',
    });
    mounted = hook;
    const before = { ...hook.result };

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(hook.result.message).toBe(before.message);
    expect(hook.result.visible).toBe(true);
    expect(hook.result.statusLine).toBe(`${formatWaitElapsed(0, 'compose')} · writing files`);
  });

  it('hides then rotates the message after rotateMs when active', () => {
    const hook = renderWaitHook({ phase: 'compose', active: true, rotateMs: 2000 });
    mounted = hook;
    const first = hook.result.message;
    expect(hook.result.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(hook.result.visible).toBe(false);

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(hook.result.visible).toBe(true);
    expect(hook.result.message.length).toBeGreaterThan(0);
    expect(hook.result.message).not.toBe(first);
  });

  it('advances the elapsed status line once per second while active', () => {
    const hook = renderWaitHook({ phase: 'compose', active: true });
    mounted = hook;

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.statusLine).toBe(formatWaitElapsed(1, 'compose'));

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.statusLine).toBe(formatWaitElapsed(2, 'compose'));
  });

  it('uses Pipeline elapsed copy when phase is missing and omits empty detail', () => {
    const hook = renderWaitHook({ active: true });
    mounted = hook;
    expect(hook.result.statusLine).toBe(formatWaitElapsed(0, undefined));
    expect(hook.result.statusLine).not.toContain(' · · ');
  });

  it('resets elapsed and visibility when the phase changes', () => {
    const hook = renderWaitHook({ phase: 'compose', active: true, rotateMs: 10_000 });
    mounted = hook;

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(hook.result.statusLine).toBe(formatWaitElapsed(2, 'compose'));

    hook.rerender({ phase: 'security' });
    expect(hook.result.visible).toBe(true);
    expect(hook.result.statusLine).toBe(formatWaitElapsed(0, 'security'));
    expect(hook.result.message.length).toBeGreaterThan(0);
  });

  it('clears timers on unmount so later ticks do not throw', () => {
    const hook = renderWaitHook({ phase: 'compose', active: true, rotateMs: 500 });
    const clearInterval = vi.spyOn(window, 'clearInterval');
    hook.unmount();
    mounted = undefined;
    expect(clearInterval).toHaveBeenCalled();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
  });
});
