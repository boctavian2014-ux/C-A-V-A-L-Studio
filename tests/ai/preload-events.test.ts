import { describe, expect, it, vi } from "vitest";
import { PreloadEventBus } from "../../ai/preload/preload-events";

describe("PreloadEventBus", () => {
  it("emits frozen events with timestamp", () => {
    const bus = new PreloadEventBus();
    const received: unknown[] = [];
    bus.on((e) => received.push(e));

    bus.emit({ type: "preload.started", modelId: "qwen2.5-coder:7b" });

    expect(received).toHaveLength(1);
    const event = received[0] as { type: string; timestamp: number; modelId: string };
    expect(event.type).toBe("preload.started");
    expect(event.modelId).toBe("qwen2.5-coder:7b");
    expect(typeof event.timestamp).toBe("number");
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("unsubscribes via on() return value", () => {
    const bus = new PreloadEventBus();
    const listener = vi.fn();
    const off = bus.on(listener);
    off();
    bus.emit({ type: "preload.completed" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates listener errors", () => {
    const bus = new PreloadEventBus();
    bus.on(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    bus.on(ok);

    expect(() => bus.emit({ type: "preload.failed", message: "x" })).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });
});
