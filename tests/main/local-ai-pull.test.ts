import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isOllamaReachable = vi.fn();
const clearOllamaReachableCache = vi.fn();
const fetchInstalledOllamaModels = vi.fn(async () => [] as string[]);

vi.mock("../../ai/models/ollama-client", () => ({
  isOllamaReachable: (...args: unknown[]) => isOllamaReachable(...args),
  clearOllamaReachableCache: (...args: unknown[]) => clearOllamaReachableCache(...args),
  fetchInstalledOllamaModels: (...args: unknown[]) => fetchInstalledOllamaModels(...args),
  getOllamaBaseUrl: () => "http://127.0.0.1:11434",
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/caval-test-userdata-pull",
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: (...args: unknown[]) => spawnMock(...args),
  };
});

function fakePullChild(): EventEmitter & {
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const ee = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  ee.pid = 77;
  ee.killed = false;
  ee.kill = vi.fn(() => {
    ee.killed = true;
    queueMicrotask(() => ee.emit("close", 1));
    return true;
  });
  ee.unref = vi.fn();
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  return ee;
}

describe("7f.3 local-ai pull", () => {
  beforeEach(() => {
    vi.resetModules();
    isOllamaReachable.mockReset().mockResolvedValue(true);
    clearOllamaReachableCache.mockReset();
    fetchInstalledOllamaModels.mockReset().mockResolvedValue([]);
    spawnMock.mockReset();
  });

  it("parseOllamaPullProgress extracts percent and bytes", async () => {
    const { parseOllamaPullProgress } = await import("../../src/main/local-ai-setup");
    const parsed = parseOllamaPullProgress(
      "pulling 4f2c... 45% ▕████    ▏ 2.1 GB/4.7 GB"
    );
    expect(parsed).toEqual({
      status: "downloading",
      percent: 45,
      completedBytes: 2.1 * 1_000_000_000,
      totalBytes: 4.7 * 1_000_000_000,
    });
  });

  it("rejects pull without confirmed: true and does not spawn", async () => {
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    const result = await mod.pullModelWithProgress(
      { modelId: "qwen2.5-coder:7b", confirmed: false as unknown as true },
      () => undefined,
      new AbortController().signal
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/confirmation/i);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("cancel mid-pull kills process and reports cancelled", async () => {
    const child = fakePullChild();
    spawnMock.mockReturnValue(child);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");

    const progress: Array<{ status: string }> = [];
    const controller = new AbortController();
    const pullPromise = mod.pullModelWithProgress(
      { modelId: "qwen2.5-coder:7b", confirmed: true },
      (p) => progress.push(p),
      controller.signal
    );

    await Promise.resolve();
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/ollama",
      ["pull", "qwen2.5-coder:7b"],
      expect.objectContaining({
        env: expect.objectContaining({ OLLAMA_HOST: "127.0.0.1:11434" }),
      })
    );

    child.stdout.emit("data", "pulling abc 10% ▕█ ▏ 0.5 GB/4.7 GB\n");
    controller.abort();
    const result = await pullPromise;

    expect(child.kill).toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(progress.some((p) => p.status === "cancelled")).toBe(true);
    const status = await mod.getLocalAiStatus();
    expect(status.phase).not.toBe("ready");
  });

  it("successful pull emits done and does not leave cancelled", async () => {
    const child = fakePullChild();
    spawnMock.mockReturnValue(child);
    fetchInstalledOllamaModels.mockResolvedValue(["qwen2.5-coder:7b"]);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");

    const progress: Array<{ status: string; percent: number }> = [];
    const pullPromise = mod.pullModelWithProgress(
      { modelId: "qwen2.5-coder:7b", confirmed: true },
      (p) => progress.push(p),
      new AbortController().signal
    );
    await Promise.resolve();
    child.stdout.emit("data", "pulling xyz 99% ▕████████▏ 4.6 GB/4.7 GB\n");
    child.emit("close", 0);
    const result = await pullPromise;
    expect(result.success).toBe(true);
    expect(progress.some((p) => p.status === "done")).toBe(true);
  });
});
