import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isOllamaReachable = vi.fn();
const clearOllamaReachableCache = vi.fn();
const fetchInstalledOllamaModels = vi.fn(async () => [] as string[]);

vi.mock("../../ai/models/ollama-client", () => ({
  isOllamaReachable: (...args: unknown[]) => isOllamaReachable(...args),
  clearOllamaReachableCache: (...args: unknown[]) => clearOllamaReachableCache(...args),
  fetchInstalledOllamaModels: (...args: unknown[]) => fetchInstalledOllamaModels(...args),
  getOllamaBaseUrl: () => "http://127.0.0.1:11434",
}));

const send = vi.fn();
vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/caval-test-userdata",
  },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send } }],
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

function fakeChild(): EventEmitter & {
  pid: number;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
} {
  const ee = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  ee.pid = 4242;
  ee.killed = false;
  ee.kill = vi.fn(() => {
    ee.killed = true;
    return true;
  });
  ee.unref = vi.fn();
  return ee;
}

describe("7f.2 local-ai lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    isOllamaReachable.mockReset();
    clearOllamaReachableCache.mockReset();
    fetchInstalledOllamaModels.mockReset().mockResolvedValue([]);
    spawnMock.mockReset();
    delete process.env.CAVAL_SKIP_OLLAMA_AUTOSTART;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits not-installed when binary missing", async () => {
    isOllamaReachable.mockResolvedValue(false);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => null);
    await mod.ensureOllamaOnBoot();
    expect(spawnMock).not.toHaveBeenCalled();
    const status = await mod.getLocalAiStatus();
    expect(status.phase).toBe("not-installed");
    expect(status.endpoint).toBe("http://127.0.0.1:11434");
    expect(status.reason).toMatch(/not found/i);
    expect(send).toHaveBeenCalledWith(
      "caval:local-ai-status-changed",
      expect.objectContaining({ phase: "not-installed" })
    );
  });

  it("emits starting before spawn then ready when model present", async () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    send.mockImplementation((_ch: string, status: { phase: string }) => {
      phases.push(status.phase);
    });
    isOllamaReachable.mockImplementation(async () => spawnMock.mock.calls.length > 0);
    fetchInstalledOllamaModels.mockResolvedValue(["qwen2.5-coder:7b"]);
    spawnMock.mockReturnValue(fakeChild());

    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "C:\\fake\\ollama.exe");

    const boot = mod.ensureOllamaOnBoot();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await boot;

    expect(phases[0]).toBe("starting");
    expect(phases).toContain("ready");
    expect(spawnMock.mock.calls[0]?.[2]?.env?.OLLAMA_HOST).toBe("127.0.0.1:11434");
  });

  it("marks model-missing when reachable without default model", async () => {
    isOllamaReachable.mockResolvedValue(true);
    fetchInstalledOllamaModels.mockResolvedValue(["llama3.2:latest"]);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");
    await mod.ensureOllamaOnBoot();
    expect(spawnMock).not.toHaveBeenCalled();
    const status = await mod.getLocalAiStatus();
    expect(status.phase).toBe("model-missing");
    expect(status.managedByCaval).toBe(false);
  });

  it("emits unavailable after bounded retries fail", async () => {
    vi.useFakeTimers();
    isOllamaReachable.mockResolvedValue(false);
    spawnMock.mockReturnValue(fakeChild());
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");
    const boot = mod.ensureOllamaOnBoot();
    await vi.advanceTimersByTimeAsync(500 + 1_000 + 2_000);
    await boot;
    const status = await mod.getLocalAiStatus();
    expect(status.phase).toBe("unavailable");
    expect(status.reason).toMatch(/did not respond/i);
  });

  it("does not emit duplicate status for identical snapshots", async () => {
    isOllamaReachable.mockResolvedValue(true);
    fetchInstalledOllamaModels.mockResolvedValue(["qwen2.5-coder:7b"]);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");
    await mod.ensureOllamaOnBoot();
    const before = send.mock.calls.length;
    await mod.getLocalAiStatus();
    await mod.getLocalAiStatus();
    expect(send.mock.calls.length).toBe(before);
  });

  it("stopManagedOllamaIfStarted leaves external instances alone", async () => {
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mod.stopManagedOllamaIfStarted();
    expect(info.mock.calls.some((c) => String(c[0]).includes("leaving pre-existing"))).toBe(true);
    info.mockRestore();
  });
});
