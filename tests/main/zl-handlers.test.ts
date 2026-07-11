import { describe, expect, it, vi, beforeEach } from "vitest";
import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

const zlMocks = vi.hoisted(() => ({
  prepare: vi.fn().mockReturnValue("token-1"),
  cancel: vi.fn(),
  peekWarmContext: vi.fn().mockReturnValue("warm"),
}));

vi.mock("electron", () => ({ ipcMain: harness.ipcMain }));

vi.mock("../../ai/composer/zero-latency/zl-fusion", () => ({
  zeroLatencyFusion: zlMocks,
  injectWarmContextIntoMessages: vi.fn((msgs) => msgs),
  peekWarmContext: zlMocks.peekWarmContext,
  buildWarmContextBlock: vi.fn(() => "warm-block"),
}));

vi.mock("../../ai/composer/zero-latency/zl-composer", () => ({
  zeroLatencyComposer: { compose: vi.fn(), getCached: vi.fn(() => null) },
}));

vi.mock("../../ai/composer/zero-latency/zl-plan-format", () => ({
  formatPartialPlanPreview: vi.fn(() => "plan-preview"),
}));

vi.mock("../../ai/composer/zero-latency/zl-config", () => ({
  loadZeroLatencyConfig: vi.fn(() => ({
    enabled: true,
    frontierPrewarm: false,
    maxWarmFiles: 8,
    maxWarmChars: 4000,
  })),
  isFrontierSelection: vi.fn(() => false),
}));

vi.mock("../../ai/model-profiles", () => ({ getModelProfile: vi.fn(() => null) }));
vi.mock("../../ai/models/openrouter-warm", () => ({ warmOpenRouterConnection: vi.fn() }));
vi.mock("../../ai/models/auto-router", () => ({
  resolveModelSelection: vi.fn().mockResolvedValue({ modelId: "stepfun/step-3.5-flash" }),
}));
vi.mock("../../ai/preload/preload-manager", () => ({
  preloadManager: { warmModel: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../ai/context/workspace-bootstrap", () => ({
  buildWorkspaceBootstrap: vi.fn().mockResolvedValue("bootstrap"),
  mergeProjectContextWithBootstrap: vi.fn((ctx) => ctx),
}));

describe("zl-handlers", () => {
  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    zlMocks.prepare.mockClear();
    const { registerZLHandlers } = await import("../../src/main/zl-handlers");
    registerZLHandlers(() => "/workspace");
  });

  it("caval:zl-prepare returns tokenId", async () => {
    const res = await harness.invoke<{ ok: boolean; tokenId?: string }>("caval:zl-prepare", {
      workspaceRoot: "/workspace",
      objectiveDraft: "fix tests",
    });
    expect(res.ok).toBe(true);
    expect(res.tokenId).toBe("token-1");
    expect(zlMocks.prepare).toHaveBeenCalled();
  });

  it("caval:chat-prepare warms context when enabled", async () => {
    const res = await harness.invoke<{ ok: boolean; warmContextReady?: boolean; tokenId?: string }>(
      "caval:chat-prepare",
      {
        workspaceRoot: "/workspace",
        objectiveDraft: "hello",
        model: "caval-auto/balanced",
        draftHash: "hash-1",
      }
    );
    expect(res.ok).toBe(true);
    expect(res.warmContextReady).toBe(true);
    expect(res.tokenId).toBe("token-1");
  });

  it("caval:zl-cancel delegates to fusion", async () => {
    const res = await harness.invoke<{ ok: boolean }>("caval:zl-cancel", "token-abc");
    expect(res.ok).toBe(true);
    expect(zlMocks.cancel).toHaveBeenCalledWith("token-abc");
  });
});
