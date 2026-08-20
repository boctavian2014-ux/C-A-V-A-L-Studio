import { afterEach, describe, expect, it, vi } from "vitest";

import { AbortRegistry } from "../../../src/main/abort/abort-registry";

describe("AbortRegistry", () => {
  const registry = new AbortRegistry();

  afterEach(() => {
    registry.resetForTests();
    vi.restoreAllMocks();
  });

  it("create without parent works", () => {
    const handle = registry.create("chat");
    expect(handle.scope).toBe("chat");
    expect(handle.parentId).toBeNull();
    expect(handle.isAborted).toBe(false);
    expect(handle.signal.aborted).toBe(false);
    expect(registry.isAborted(handle.id)).toBe(false);
    expect(registry.getSignal(handle.id)).toBe(handle.signal);
  });

  it("create with parent links correctly", () => {
    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);
    const agent = registry.create("multi-agent", loop.id);

    expect(loop.parentId).toBe(chat.id);
    expect(agent.parentId).toBe(loop.id);
    expect(loop.isAborted).toBe(false);
    expect(agent.isAborted).toBe(false);
  });

  it("abort on parent cascades to children", () => {
    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);
    const agent = registry.create("multi-agent", loop.id);

    chat.abort("user cancelled");

    expect(chat.isAborted).toBe(true);
    expect(loop.isAborted).toBe(true);
    expect(agent.isAborted).toBe(true);
    expect(registry.isAborted(chat.id)).toBe(true);
    expect(registry.isAborted(loop.id)).toBe(true);
    expect(registry.isAborted(agent.id)).toBe(true);
  });

  it("abort on child does not affect parent", () => {
    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);

    loop.abort("tool failed");

    expect(loop.isAborted).toBe(true);
    expect(chat.isAborted).toBe(false);
    expect(registry.isAborted(chat.id)).toBe(false);
  });

  it("create under an already-aborted parent aborts the child immediately", () => {
    const chat = registry.create("chat");
    chat.abort("already stopped");
    const loop = registry.create("tool-loop", chat.id);
    expect(loop.isAborted).toBe(true);
  });

  it("release cleans up correctly", () => {
    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);

    registry.release(loop.id);
    expect(registry.getSignal(loop.id)).toBeUndefined();
    expect(registry.isAborted(loop.id)).toBe(false);

    chat.abort("user cancelled");
    expect(chat.isAborted).toBe(true);
    expect(loop.isAborted).toBe(false);
  });

  it("onAbort emits events for parent and cascaded children", () => {
    const events: Array<{ id: string; scope: string; reason?: string }> = [];
    const stop = registry.onAbort((id, scope, reason) => {
      events.push({ id, scope, reason });
    });

    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);
    registry.abort(chat.id, "user cancelled");

    expect(events).toEqual([
      { id: loop.id, scope: "tool-loop", reason: "user cancelled" },
      { id: chat.id, scope: "chat", reason: "user cancelled" },
    ]);

    stop();
    const extra = registry.create("chat");
    extra.abort("ignored");
    expect(events).toHaveLength(2);
  });

  it("isAborted is live on the handle, not a snapshot from create", () => {
    const chat = registry.create("chat");
    expect(chat.isAborted).toBe(false);
    registry.abort(chat.id);
    expect(chat.isAborted).toBe(true);
  });

  it("abort of an unknown id is a no-op", () => {
    expect(() => registry.abort("missing")).not.toThrow();
    expect(registry.isAborted("missing")).toBe(false);
  });

  it("releaseTree drops parent and descendants without leaving entries", () => {
    const chat = registry.create("chat");
    const loop = registry.create("tool-loop", chat.id);
    registry.create("multi-agent", loop.id);
    expect(registry.size()).toBe(3);
    registry.releaseTree(chat.id);
    expect(registry.size()).toBe(0);
    expect(registry.getSignal(chat.id)).toBeUndefined();
    expect(registry.getSignal(loop.id)).toBeUndefined();
  });
});
