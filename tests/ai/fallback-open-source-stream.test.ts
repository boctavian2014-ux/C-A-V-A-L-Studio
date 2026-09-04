import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FallbackOpenSourceProvider } from "../../ai/providers/fallback-open-source";
import type { ModelDescriptor, ModelRequest } from "../../ai/types";
import { abortRegistry } from "../../src/main/abort/abort-registry";
import {
  abortAllAbortableStreams,
  abortAbortableStream,
  finishAbortableStream,
  resetStreamAbortRootsForTests,
  startAbortableStream,
} from "../../src/main/abort/stream-abort";

const MODEL: ModelDescriptor = {
  id: "qwen2.5-coder:7b",
  displayName: "Qwen 2.5 Coder 7B",
  provider: "open_source",
  capabilities: ["chat", "code"],
  priority: 48,
  contextWindow: 32_000,
  supportsStreaming: true,
  supportsToolCalling: false,
  preferredIntents: ["fallback"],
  endpoint: "http://127.0.0.1:11434/api/chat",
};

const REQUEST: ModelRequest = {
  prompt: "hi",
  capability: "chat",
  intent: "fallback",
};

type ReaderStats = {
  cancelCount: number;
  releaseCount: number;
};

function ndjsonChunk(text: string): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ message: { content: text } })}\n`);
}

function trackedBody(chunks: Uint8Array[], waitBeforeRead?: (index: number) => Promise<void>) {
  const stats: ReaderStats = { cancelCount: 0, releaseCount: 0 };
  let index = 0;
  const reader = {
    async read(): Promise<{ done: boolean; value?: Uint8Array }> {
      const readIndex = index;
      if (waitBeforeRead) {
        await waitBeforeRead(readIndex);
      }
      if (readIndex >= chunks.length) {
        return { done: true, value: undefined };
      }
      index += 1;
      return { done: false, value: chunks[readIndex] };
    },
    async cancel(): Promise<void> {
      stats.cancelCount += 1;
    },
    releaseLock(): void {
      stats.releaseCount += 1;
    },
  };
  return {
    body: { getReader: () => reader },
    stats,
  };
}

async function collect(
  iterable: AsyncIterable<{ kind: string; text: string }>
): Promise<{ chunks: string[]; error?: unknown }> {
  const chunks: string[] = [];
  try {
    for await (const chunk of iterable) {
      if (chunk.kind === "content") chunks.push(chunk.text);
    }
    return { chunks };
  } catch (error) {
    return { chunks, error };
  }
}

describe("FallbackOpenSourceProvider stream abort / reader lock", () => {
  const provider = new FallbackOpenSourceProvider();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    unhandled.length = 0;
    resetStreamAbortRootsForTests();
    abortRegistry.resetForTests();
    vi.unstubAllGlobals();
  });

  it("passes the abort registry signal to fetch and releases the reader after a normal stream", async () => {
    const root = startAbortableStream("ollama-normal");
    const tracked = trackedBody([ndjsonChunk("Hello"), ndjsonChunk(" world")]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: tracked.body });
    vi.stubGlobal("fetch", fetchMock);

    const result = await collect(provider.stream(REQUEST, MODEL, { signal: root.signal }));

    expect(result.error).toBeUndefined();
    expect(result.chunks.join("")).toBe("Hello world");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: root.signal }));
    expect(tracked.stats.cancelCount).toBe(0);
    expect(tracked.stats.releaseCount).toBe(1);
    finishAbortableStream("ollama-normal");
    expect(unhandled).toEqual([]);
  });

  it("cancels and releaseLock on mid-stream abort without a user-facing Ollama error", async () => {
    const root = startAbortableStream("ollama-mid");
    const tracked = trackedBody([ndjsonChunk("partial"), ndjsonChunk("more")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: tracked.body }));

    const chunks: string[] = [];
    for await (const chunk of provider.stream(REQUEST, MODEL, { signal: root.signal })) {
      chunks.push(chunk.text);
      abortAbortableStream("ollama-mid", "app shutdown");
    }

    expect(chunks).toEqual(["partial"]);
    expect(tracked.stats.cancelCount).toBe(1);
    expect(tracked.stats.releaseCount).toBe(1);
    expect(unhandled).toEqual([]);
    finishAbortableStream("ollama-mid");
  });

  it("cancels an in-flight reader.read when shutdown aborts the registry", async () => {
    const root = startAbortableStream("ollama-inflight");
    let blocked: () => void = () => undefined;
    const blockedAtRead = new Promise<void>((resolve) => {
      blocked = resolve;
    });
    const tracked = trackedBody([ndjsonChunk("partial")], async (readIndex) => {
      if (readIndex >= 1) {
        blocked();
        await new Promise<void>((_resolve, reject) => {
          root.signal.addEventListener(
            "abort",
            () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            },
            { once: true }
          );
        });
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: tracked.body }));

    const consume = collect(provider.stream(REQUEST, MODEL, { signal: root.signal }));
    await blockedAtRead;
    expect(abortAllAbortableStreams("app shutdown")).toBe(1);
    const result = await consume;

    expect(result.error).toBeUndefined();
    expect(result.chunks).toEqual(["partial"]);
    expect(tracked.stats.cancelCount).toBe(1);
    expect(tracked.stats.releaseCount).toBe(1);
    expect(unhandled).toEqual([]);
    finishAbortableStream("ollama-inflight");
  });

  it("treats fetch AbortError as a quiet cancel, not Ollama indisponibil", async () => {
    const root = startAbortableStream("ollama-fetch-abort");
    const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
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
    vi.stubGlobal("fetch", fetchMock);

    const pending = collect(provider.stream(REQUEST, MODEL, { signal: root.signal }));
    abortAllAbortableStreams("app shutdown");
    const result = await pending;

    expect(result.error).toBeUndefined();
    expect(result.chunks).toEqual([]);
    expect(unhandled).toEqual([]);
    finishAbortableStream("ollama-fetch-abort");
  });

  it("can stream a second request after the first reader is released", async () => {
    const first = trackedBody([ndjsonChunk("one")]);
    const second = trackedBody([ndjsonChunk("two")]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, body: first.body })
      .mockResolvedValueOnce({ ok: true, body: second.body });
    vi.stubGlobal("fetch", fetchMock);

    const a = await collect(provider.stream(REQUEST, MODEL, {}));
    const b = await collect(provider.stream(REQUEST, MODEL, {}));

    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(a.chunks).toEqual(["one"]);
    expect(b.chunks).toEqual(["two"]);
    expect(first.stats.releaseCount).toBe(1);
    expect(second.stats.releaseCount).toBe(1);
    expect(first.stats.cancelCount).toBe(0);
    expect(second.stats.cancelCount).toBe(0);
  });

  it("does not cancel a reader that already completed, and a later abort is a no-op", async () => {
    const tracked = trackedBody([ndjsonChunk("done")]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: tracked.body }));
    const controller = new AbortController();

    const result = await collect(provider.stream(REQUEST, MODEL, { signal: controller.signal }));
    controller.abort();

    expect(result.error).toBeUndefined();
    expect(tracked.stats.cancelCount).toBe(0);
    expect(tracked.stats.releaseCount).toBe(1);
    expect(unhandled).toEqual([]);
  });

  it("complete() rethrows AbortError before any connectivity rewrite", async () => {
    const root = startAbortableStream("ollama-complete-abort");
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider.complete(REQUEST, MODEL, { signal: root.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    try {
      await provider.complete(REQUEST, MODEL, { signal: root.signal });
      throw new Error("expected AbortError");
    } catch (error) {
      expect(error).toMatchObject({ name: "AbortError" });
      expect(String(error)).not.toMatch(/Ollama indisponibil/);
    }
    finishAbortableStream("ollama-complete-abort");
  });

  it("complete() does not fetch when the registry signal is already aborted", async () => {
    const root = startAbortableStream("ollama-complete-preabort");
    abortAbortableStream("ollama-complete-preabort", "app shutdown");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider.complete(REQUEST, MODEL, { signal: root.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    finishAbortableStream("ollama-complete-preabort");
  });

  it("stream() still reports Ollama indisponibil for non-abort fetch failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await collect(provider.stream(REQUEST, MODEL, {}));
    expect(String(result.error)).toMatch(/Ollama indisponibil/);
    expect(String(result.error)).toMatch(/ECONNREFUSED/);
  });
});
