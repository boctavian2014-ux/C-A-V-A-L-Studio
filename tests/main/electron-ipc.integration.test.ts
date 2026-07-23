import { beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

const aiMocks = vi.hoisted(() => ({
  stream: vi.fn().mockImplementation(async function* () {
    yield { kind: "content" as const, text: "integration-test-response" };
  }),
  complete: vi.fn().mockResolvedValue({
    content: "integration-test-response",
    model: "qwen2.5-coder:7b",
    provider: "test",
  }),
}));

vi.mock("../../ai/tools/tool-runtime", () => ({
  ensureMcpServersReady: vi.fn().mockResolvedValue(undefined),
  getOrCreateToolRegistry: vi.fn().mockReturnValue({
    listTools: () => [],
    execute: vi.fn(),
    setMcpInvoker: vi.fn(),
    setMcpToolDefinitions: vi.fn(),
  }),
  syncRegistryMcpTools: vi.fn(),
  listAvailableTools: vi.fn().mockReturnValue([]),
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

/** Avoid spawning real context/preload workers (missing .js next to .ts in vitest). */
vi.mock("node:worker_threads", () => {
  const { EventEmitter } = require("node:events") as typeof import("node:events");
  class FakeWorker extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit("online"));
    }
    postMessage(): void {}
    terminate(): Promise<number> {
      return Promise.resolve(0);
    }
  }
  return { Worker: FakeWorker, parentPort: null, workerData: {} };
});

vi.mock("../../ai/ai-client", () => ({
  AIClient: class {
    stream = aiMocks.stream;
    complete = aiMocks.complete;
  },
}));

vi.mock("../../ai/models/auto-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../ai/models/auto-router")>();
  return {
    ...original,
    isOllamaReachable: vi.fn().mockResolvedValue(true),
    resolveModelSelection: vi.fn().mockResolvedValue({
      selectionId: "qwen2.5-coder:7b",
      modelId: "qwen2.5-coder:7b",
      provider: "open_source",
      reason: "integration test",
    }),
    getAutoFreeModelCandidates: vi.fn().mockResolvedValue(["qwen2.5-coder:7b"]),
  };
});

vi.mock("../../ai/preload/preload-manager", () => ({
  preloadManager: {
    getStatus: vi.fn().mockReturnValue({ cache: { entries: [] } }),
    recordUsage: vi.fn(),
    onUserAction: vi.fn(),
    configure: vi.fn(),
    onFilesChanged: vi.fn(),
    onModelSelected: vi.fn(),
    warmModel: vi.fn().mockResolvedValue(true),
    setEnabled: vi.fn(),
  },
}));

vi.mock("../../ai/models/model-preload", () => ({
  preloadModel: vi.fn(),
  ensureModelLoaded: vi.fn().mockResolvedValue({ ready: true }),
}));

describe("Electron main IPC integration", () => {
  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    aiMocks.stream.mockClear();
    aiMocks.stream.mockImplementation(async function* () {
      yield { kind: "content" as const, text: "integration-test-response" };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const { registerModelHandlers } = await import("../../src/main/model-handlers");
    const { registerPreloadHandlers } = await import("../../src/main/preload-handlers");
    registerModelHandlers();
    registerPreloadHandlers(() => "/tmp/caval-workspace");
  }, 30_000);

  it("caval:resolve-model returns resolved selection", async () => {
    const result = await harness.invoke<{ ok: boolean; resolved: { modelId: string } }>(
      "caval:resolve-model",
      { model: "caval-auto/free", intent: "kilocode" }
    );
    expect(result.ok).toBe(true);
    expect(result.resolved.modelId).toBe("qwen2.5-coder:7b");
  });

  it("caval:models-list returns catalog", async () => {
    const result = await harness.invoke<{ ok: boolean; catalog: { auto: unknown[] } }>("caval:models-list");
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.catalog.auto)).toBe(true);
  });

  it("caval:ai-chat-stream starts stream and sends chunks to renderer", async () => {
    const started = await harness.invoke<{ ok: boolean; started: boolean }>("caval:ai-chat-stream", {
      message: "Hello",
      model: "qwen2.5-coder:7b",
      mode: "ask",
      streamId: "stream-1",
    });
    expect(started.ok).toBe(true);
    expect(started.started).toBe(true);

    await vi.waitUntil(
      () => harness.sender.send.mock.calls.some((c) => c[1]?.type === "done"),
      { timeout: 3000 }
    );

    expect(aiMocks.stream).toHaveBeenCalled();

    const types = harness.sender.send.mock.calls.map((c) => c[1]?.type);
    expect(types).toContain("meta");
    expect(types).toContain("delta");
    expect(types).toContain("done");
  });

  it("caval:preload-status and notify handlers work", async () => {
    const status = await harness.invoke("caval:preload-status");
    expect(status).toBeDefined();

    const notify = await harness.invoke<{ ok: boolean }>("caval:preload-notify", {
      action: "files.changed",
      openFiles: ["/tmp/caval-workspace/src/app.ts"],
      activeFile: "/tmp/caval-workspace/src/app.ts",
    });
    expect(notify.ok).toBe(true);
  });

  it("caval:preload-warm returns ok flag", async () => {
    const warm = await harness.invoke<{ ok: boolean }>("caval:preload-warm", {
      modelId: "qwen2.5-coder:7b",
      stage: "chat",
    });
    expect(warm.ok).toBe(true);
  });
});
