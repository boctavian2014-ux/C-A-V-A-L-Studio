import { afterEach, describe, expect, it, vi } from "vitest";

import { abortRegistry } from "../../../src/main/abort/abort-registry";
import {
  abortAbortableStream,
  finishAbortableStream,
  getStreamAbortRootId,
  parseAbortStreamId,
  resetStreamAbortRootsForTests,
  startAbortableStream,
  streamAbortRootCountForTests,
} from "../../../src/main/abort/stream-abort";
import {
  beginCancelOperation,
  getStreamAbortSignal,
  registerStreamOperation,
  resetOperationRegistryForTests,
} from "../../../src/main/operation-registry";
import { runCompletionWithTools } from "../../../ai/pipeline/tool-agent-loop";
import type { AIClient } from "../../../ai/ai-client";
import type { ToolRegistry } from "../../../ai/tools/tool-registry";

describe("abort wiring", () => {
  afterEach(() => {
    resetStreamAbortRootsForTests();
    abortRegistry.resetForTests();
    resetOperationRegistryForTests();
    vi.restoreAllMocks();
  });

  it("cascades chat → tool-loop and multi-agent when the root is aborted", () => {
    const chat = startAbortableStream("s-1");
    const loop = abortRegistry.create("tool-loop", chat.id);
    const agent = abortRegistry.create("multi-agent", chat.id);

    abortAbortableStream("s-1", "user cancelled");

    expect(chat.isAborted).toBe(true);
    expect(loop.isAborted).toBe(true);
    expect(agent.isAborted).toBe(true);
  });

  it("aborting the chat root aborts the P2 stream controller", () => {
    registerStreamOperation({ streamId: "s-p2", senderId: 1, workspaceRoot: "/ws" });
    const root = startAbortableStream("s-p2");
    expect(getStreamAbortSignal("s-p2")?.aborted).toBe(false);
    root.abort("user cancelled");
    expect(getStreamAbortSignal("s-p2")?.aborted).toBe(true);
  });

  it("multi-agent fetch signal rejects with AbortError when the root is aborted", async () => {
    const chat = startAbortableStream("s-fetch");
    const agent = abortRegistry.create("multi-agent", chat.id);

    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        if (signal.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      });
    });

    const pending = fetchMock("https://example.invalid/v1/chat", { signal: agent.signal });
    abortAbortableStream("s-fetch", "user cancelled");
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("tool-loop does not start a second iteration after abort during the first tool", async () => {
    const chat = abortRegistry.create("chat");
    let completes = 0;
    const aiClient = {
      complete: vi.fn(async () => {
        completes += 1;
        if (completes > 1) {
          throw new Error("second iteration should not run");
        }
        return {
          model: "nex-n2-pro",
          provider: "openrouter",
          content: "",
          toolCalls: [{ id: "c1", name: "read_file", arguments: { path: "a.ts" } }],
        };
      }),
      stream: vi.fn(),
    };

    const tools = {
      listTools: () => [
        { name: "read_file", description: "read", parameters: { type: "object" } },
      ],
      execute: vi.fn(async () => {
        chat.abort("user cancelled");
        return { ok: true, output: "ok" };
      }),
    };

    const result = await runCompletionWithTools({
      aiClient: aiClient as unknown as AIClient,
      registry: tools as unknown as ToolRegistry,
      baseRequest: {
        prompt: "x",
        capability: "chat",
        intent: "kilocode",
      },
      initialMessages: [{ role: "user", content: "x" }],
      modelId: "nex-n2-pro",
      parentAbortId: chat.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Generare anulată.");
    }
    expect(completes).toBe(1);
    expect(tools.execute).toHaveBeenCalledTimes(1);
  });

  it("finishAbortableStream releases streamRoots and registry entries", () => {
    const chat = startAbortableStream("s-done");
    abortRegistry.create("tool-loop", chat.id);
    expect(getStreamAbortRootId("s-done")).toBe(chat.id);
    expect(streamAbortRootCountForTests()).toBe(1);
    expect(abortRegistry.size()).toBe(2);

    finishAbortableStream("s-done");

    expect(getStreamAbortRootId("s-done")).toBeUndefined();
    expect(streamAbortRootCountForTests()).toBe(0);
    expect(abortRegistry.size()).toBe(0);
  });

  it("abort on an unknown streamId is a no-op", () => {
    const other = startAbortableStream("keep-me");
    expect(abortAbortableStream("missing")).toBe(false);
    expect(other.isAborted).toBe(false);
  });

  it("parseAbortStreamId rejects invalid ids without aborting anything", () => {
    const keep = startAbortableStream("keep-valid");
    expect(parseAbortStreamId("")).toEqual({ ok: false, error: "Invalid stream id" });
    expect(parseAbortStreamId(null)).toEqual({ ok: false, error: "Invalid stream id" });
    expect(parseAbortStreamId(12)).toEqual({ ok: false, error: "Invalid stream id" });
    expect(keep.isAborted).toBe(false);
  });

  it("legacy streams without a root still receive beginCancelOperation", () => {
    registerStreamOperation({ streamId: "legacy", senderId: 1 });
    expect(abortAbortableStream("legacy")).toBe(false);
    expect(getStreamAbortSignal("legacy")?.aborted).toBe(false);

    const cancel = beginCancelOperation({ streamId: "legacy", senderId: 1 });
    expect(cancel.ok).toBe(true);
    expect(cancel.signalAborted).toBe(true);
  });
});
