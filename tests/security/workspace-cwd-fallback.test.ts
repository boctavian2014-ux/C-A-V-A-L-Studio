import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../main/ipc-harness";
import { NO_BOUND_WORKSPACE_ERROR } from "../../src/shared/workspace-isolation";
import { WORKSPACE_NOT_BOUND_CODE } from "../../src/main/bound-workspace";
import { normalizeWorkspaceRoot } from "../../src/main/path-security";

const harness = createIpcHarness();

const completionMocks = vi.hoisted(() => ({
  completeModelText: vi.fn(),
  executeModelCompletion: vi.fn().mockResolvedValue({
    ok: true,
    text: "ok",
    resolvedModel: "qwen2.5-coder:7b",
    provider: "test",
  }),
}));

const mcpMocks = vi.hoisted(() => ({
  ensureMcpServersReady: vi.fn().mockResolvedValue(undefined),
  getOrCreateToolRegistry: vi.fn().mockReturnValue({
    listTools: () => [],
    execute: vi.fn(),
    setMcpInvoker: vi.fn(),
    setMcpToolDefinitions: vi.fn(),
    enableWriteGate: vi.fn(),
    grantWriteTurn: vi.fn(),
    revokeWriteTurn: vi.fn(),
    grantedWriteTurnId: vi.fn().mockReturnValue(null),
  }),
}));

const warmMock = vi.hoisted(() => ({
  warmOpenRouterConnection: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

vi.mock("../../ai/pipeline/model-completion", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../ai/pipeline/model-completion")>();
  return {
    ...original,
    completeModelText: completionMocks.completeModelText,
    executeModelCompletion: completionMocks.executeModelCompletion,
  };
});

vi.mock("../../src/main/mcp-handlers.js", () => mcpMocks);

vi.mock("../../ai/models/openrouter-warm", () => ({
  warmOpenRouterConnection: warmMock.warmOpenRouterConnection,
}));

vi.mock("../../ai/tools/tool-runtime", () => ({
  ensureMcpServersReady: vi.fn().mockResolvedValue(undefined),
  getOrCreateToolRegistry: vi.fn().mockReturnValue({
    listTools: () => [],
    execute: vi.fn(),
    setMcpInvoker: vi.fn(),
    setMcpToolDefinitions: vi.fn(),
    enableWriteGate: vi.fn(),
    grantWriteTurn: vi.fn(),
    revokeWriteTurn: vi.fn(),
    grantedWriteTurnId: vi.fn().mockReturnValue(null),
  }),
  syncRegistryMcpTools: vi.fn(),
  listAvailableTools: vi.fn().mockReturnValue([]),
}));

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

vi.mock("../../ai/models/auto-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../ai/models/auto-router")>();
  return {
    ...original,
    isOllamaReachable: vi.fn().mockResolvedValue(true),
    resolveModelSelection: vi.fn().mockResolvedValue({
      selectionId: "qwen2.5-coder:7b",
      modelId: "qwen2.5-coder:7b",
      provider: "open_source",
      reason: "cwd-fallback test",
    }),
    getAutoFreeModelCandidates: vi.fn().mockResolvedValue(["qwen2.5-coder:7b"]),
  };
});

describe("P0.1 workspace cwd fallback refusal", () => {
  const boundRoots = new Map<number, string>();
  const workspace = os.tmpdir();

  async function register(bound: boolean): Promise<void> {
    harness.reset();
    boundRoots.clear();
    completionMocks.completeModelText.mockReset();
    completionMocks.executeModelCompletion.mockReset();
    completionMocks.executeModelCompletion.mockResolvedValue({
      ok: true,
      text: "ok",
      resolvedModel: "qwen2.5-coder:7b",
      provider: "test",
    });
    mcpMocks.ensureMcpServersReady.mockClear();
    mcpMocks.getOrCreateToolRegistry.mockClear();
    warmMock.warmOpenRouterConnection.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.resetModules();
    const { registerModelHandlers } = await import("../../src/main/model-handlers.js");
    if (bound) {
      boundRoots.set(harness.sender.id, workspace);
    }
    registerModelHandlers((id) => boundRoots.get(id));
  }

  afterEach(() => {
    boundRoots.clear();
  });

  it("caval:ai-chat-stream without bound root returns workspace_not_bound and does not fetch or execute tools", async () => {
    await register(false);
    const result = await harness.invoke<{ ok: boolean; error?: string; code?: string }>(
      "caval:ai-chat-stream",
      {
        message: "Hello",
        model: "qwen2.5-coder:7b",
        mode: "ask",
        streamId: "unbound-stream",
        workspaceRoot: process.cwd(),
      }
    );
    expect(result).toEqual({
      ok: false,
      error: NO_BOUND_WORKSPACE_ERROR,
      code: WORKSPACE_NOT_BOUND_CODE,
    });
    expect(warmMock.warmOpenRouterConnection).not.toHaveBeenCalled();
    expect(completionMocks.executeModelCompletion).not.toHaveBeenCalled();
    expect(mcpMocks.getOrCreateToolRegistry).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.sender.send).not.toHaveBeenCalled();
  });

  it("caval:ai-complete without bound root returns workspace_not_bound and does not touch disk tools", async () => {
    await register(false);
    const result = await harness.invoke<{ ok: boolean; error?: string; code?: string }>(
      "caval:ai-complete",
      {
        messages: [{ role: "user", content: "Hello" }],
        model: "qwen2.5-coder:7b",
        workspaceRoot: process.cwd(),
      }
    );
    expect(result).toEqual({
      ok: false,
      error: NO_BOUND_WORKSPACE_ERROR,
      code: WORKSPACE_NOT_BOUND_CODE,
    });
    expect(completionMocks.completeModelText).not.toHaveBeenCalled();
    expect(mcpMocks.ensureMcpServersReady).not.toHaveBeenCalled();
    expect(mcpMocks.getOrCreateToolRegistry).not.toHaveBeenCalled();
  });

  it("caval:ai-chat-stream with a bound root ignores renderer cwd and starts", async () => {
    await register(true);
    const started = await harness.invoke<{ ok: boolean; started?: boolean }>("caval:ai-chat-stream", {
      message: "Hello",
      model: "qwen2.5-coder:7b",
      mode: "ask",
      streamId: "bound-stream",
      workspaceRoot: process.cwd(),
    });
    expect(started.ok).toBe(true);
    expect(started.started).toBe(true);
    expect(warmMock.warmOpenRouterConnection).toHaveBeenCalled();
    await vi.waitUntil(
      () => completionMocks.executeModelCompletion.mock.calls.length > 0 || harness.sender.send.mock.calls.length > 0,
      { timeout: 3000 }
    );
  });

  it("caval:ai-complete with a bound root uses that root, not process.cwd()", async () => {
    await register(true);
    completionMocks.completeModelText.mockResolvedValue({
      ok: true,
      text: "ok",
      model: "qwen2.5-coder:7b",
    });
    const result = await harness.invoke("caval:ai-complete", {
      messages: [{ role: "user", content: "Hello" }],
      model: "ollama-local",
      intent: "chat",
      workspaceRoot: process.cwd(),
    });
    expect(result).toMatchObject({ ok: true });
    expect(completionMocks.completeModelText).toHaveBeenCalledTimes(1);
    const arg = completionMocks.completeModelText.mock.calls[0]?.[0] as { workspaceRoot: string };
    expect(normalizeWorkspaceRoot(arg.workspaceRoot)).toBe(normalizeWorkspaceRoot(workspace));
    expect(normalizeWorkspaceRoot(arg.workspaceRoot)).not.toBe(normalizeWorkspaceRoot(process.cwd()));
  });
});
