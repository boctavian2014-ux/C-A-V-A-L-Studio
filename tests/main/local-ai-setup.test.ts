import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isOllamaReachable = vi.fn();
const clearOllamaReachableCache = vi.fn();
const fetchInstalledOllamaModels = vi.fn(async () => [] as string[]);
const getOllamaBaseUrl = vi.fn(() => "http://127.0.0.1:11434");

vi.mock("../../ai/models/ollama-client", () => ({
  isOllamaReachable: (...args: unknown[]) => isOllamaReachable(...args),
  clearOllamaReachableCache: (...args: unknown[]) => clearOllamaReachableCache(...args),
  fetchInstalledOllamaModels: (...args: unknown[]) => fetchInstalledOllamaModels(...args),
  getOllamaBaseUrl: (...args: unknown[]) => getOllamaBaseUrl(...args),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/caval-test-userdata",
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

describe("local-ai-setup ollama auto-start", () => {
  beforeEach(() => {
    vi.resetModules();
    isOllamaReachable.mockReset();
    clearOllamaReachableCache.mockReset();
    fetchInstalledOllamaModels.mockReset().mockResolvedValue([]);
    spawnMock.mockReset();
    delete process.env.CAVAL_SKIP_OLLAMA_AUTOSTART;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not spawn when Ollama is already reachable", async () => {
    isOllamaReachable.mockResolvedValue(true);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    await mod.ensureOllamaOnBoot();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(mod.__getOllamaProcessTrackingForTests().weStartedOllama).toBe(false);
  });

  it("does not crash when Ollama is not installed", async () => {
    isOllamaReachable.mockResolvedValue(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => null);
    await mod.ensureOllamaOnBoot();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[ollama] failed: not installed"),
      expect.any(String)
    );
    const status = await mod.getLocalAiStatus();
    expect(status.phase).toBe("unavailable");
    expect(status.lastError).toMatch(/not installed/i);
    warn.mockRestore();
  });

  it("spawns serve when down and binary exists, then marks ready", async () => {
    vi.useFakeTimers();
    isOllamaReachable.mockImplementation(async () => spawnMock.mock.calls.length > 0);
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "C:\\fake\\ollama.exe");

    const boot = mod.ensureOllamaOnBoot();
    await vi.advanceTimersByTimeAsync(1_000);
    await boot;

    expect(spawnMock).toHaveBeenCalledWith(
      "C:\\fake\\ollama.exe",
      ["serve"],
      expect.objectContaining({ detached: true, stdio: "ignore" })
    );
    expect(child.unref).toHaveBeenCalled();
    expect(mod.__getOllamaProcessTrackingForTests().weStartedOllama).toBe(true);
  });

  it("stopManagedOllamaIfStarted kills only when we started the process", async () => {
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mod.stopManagedOllamaIfStarted();
    expect(info.mock.calls.some((c) => String(c[0]).includes("leaving pre-existing"))).toBe(
      true
    );

    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    isOllamaReachable.mockImplementation(async () => spawnMock.mock.calls.length > 0);
    vi.useFakeTimers();
    mod.__setDetectOllamaBinaryForTests(() => "/usr/bin/ollama");
    const boot = mod.ensureOllamaOnBoot();
    await vi.advanceTimersByTimeAsync(1_000);
    await boot;
    expect(mod.__getOllamaProcessTrackingForTests().weStartedOllama).toBe(true);
    mod.stopManagedOllamaIfStarted();
    expect(child.kill).toHaveBeenCalled();
    expect(mod.__getOllamaProcessTrackingForTests().weStartedOllama).toBe(false);
    info.mockRestore();
  });

  it("respects CAVAL_SKIP_OLLAMA_AUTOSTART", async () => {
    process.env.CAVAL_SKIP_OLLAMA_AUTOSTART = "1";
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    await mod.ensureOllamaOnBoot();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(isOllamaReachable).not.toHaveBeenCalled();
  });
});
