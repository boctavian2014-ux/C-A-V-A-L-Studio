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

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/caval-test-userdata-install",
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

function fakeChild(exitCode = 0): EventEmitter & {
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
  ee.pid = 99;
  ee.killed = false;
  ee.kill = vi.fn(() => {
    ee.killed = true;
    return true;
  });
  ee.unref = vi.fn();
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  queueMicrotask(() => ee.emit("close", exitCode));
  return ee;
}

describe("7f.3 local-ai install", () => {
  beforeEach(() => {
    vi.resetModules();
    isOllamaReachable.mockReset();
    clearOllamaReachableCache.mockReset();
    fetchInstalledOllamaModels.mockReset().mockResolvedValue([]);
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects install without confirmed: true and does not spawn", async () => {
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    const result = await mod.installOllamaRuntimeOnly({ confirmed: false as unknown as true });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/confirmation/i);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("successful install does not auto-pull; status becomes model-missing", async () => {
    vi.useFakeTimers();
    isOllamaReachable.mockResolvedValue(true);
    fetchInstalledOllamaModels.mockResolvedValue([]);
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => "C:\\fake\\ollama.exe");

    const resultPromise = mod.installOllamaRuntimeOnly({ confirmed: true });
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.status?.phase).toBe("model-missing");
    // No ollama pull spawn
    expect(spawnMock.mock.calls.every((c) => !(Array.isArray(c[1]) && c[1][0] === "pull"))).toBe(
      true
    );
  });

  it("failed install keeps not-installed with sanitized error", async () => {
    isOllamaReachable.mockResolvedValue(false);
    spawnMock.mockImplementation(() => {
      throw new Error("C:\\Users\\me\\install.ps1 boom");
    });
    const mod = await import("../../src/main/local-ai-setup");
    mod.__resetOllamaProcessTrackingForTests();
    mod.__setDetectOllamaBinaryForTests(() => null);

    const result = await mod.installOllamaRuntimeOnly({ confirmed: true });
    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/Users|\\\\/);
    expect(result.status?.phase).toBe("not-installed");
  });

  it("toProviderStatus still maps model-missing after install", async () => {
    const { toProviderStatus } = await import("../../src/shared/local-ai-contract");
    expect(toProviderStatus({ phase: "model-missing" })).toBe("model-missing");
    expect(toProviderStatus({ phase: "not-installed" })).toBe("not-installed");
  });
});
