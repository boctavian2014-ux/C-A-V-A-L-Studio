import { afterEach, describe, expect, it, vi } from "vitest";

import { debounce } from "../../../src/renderer/lib/debounce";

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes only the last call after the wait", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced("a");
    debounced("b");
    debounced("c");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("cancel drops a pending invocation", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced("x");
    debounced.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});
