import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const quitAndInstall = vi.hoisted(() => vi.fn());

vi.mock("electron-updater", () => ({
  autoUpdater: {
    channel: "stable",
    allowPrerelease: false,
    autoDownload: false,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: (...args: unknown[]) => quitAndInstall(...args),
  },
}));

const closeAllAiPersistence = vi.fn();
const stopCadOrphanScan = vi.fn();
const clearAllTurnWatchdogs = vi.fn();
const workspaceClose = vi.fn(async () => undefined);
const preloadDispose = vi.fn(async () => undefined);
const parallelDispose = vi.fn(async () => undefined);
const shutdownAllPreviewSync = vi.fn();
const stopAllInteractiveTerminalsSync = vi.fn();
const shutdownAllTasksSync = vi.fn();
const stopAllMcpServers = vi.fn(async () => undefined);
const stopAllLspSessions = vi.fn(async () => undefined);
const stopCadLocalServerAndWait = vi.fn(async () => undefined);
const stopMarketplaceServerAndWait = vi.fn(async () => undefined);
const stopManagedOllamaIfStartedAndWait = vi.fn(async () => undefined);
const abortAllAbortableStreams = vi.fn(() => 0);

vi.mock("electron", () => ({
  app: {
    on: vi.fn(),
    quit: vi.fn(),
    isPackaged: false,
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => undefined,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: {},
  Menu: {},
  shell: {},
  safeStorage: {},
}));

vi.mock("../../src/main/ai/timeline-persistence", () => ({
  closeAllAiPersistence: () => closeAllAiPersistence(),
}));
vi.mock("../../src/main/cad-handlers", () => ({
  stopCadOrphanScan: () => stopCadOrphanScan(),
}));
vi.mock("../../src/main/ai/turn-watchdog-runtime", () => ({
  clearAllTurnWatchdogs: () => clearAllTurnWatchdogs(),
}));
vi.mock("../../src/main/workspace/workspace-index-service", () => ({
  workspaceIndexService: { close: () => workspaceClose() },
}));
vi.mock("../../src/main/preload-handlers", () => ({
  preloadManager: { dispose: () => preloadDispose() },
}));
vi.mock("../../ai/context/parallel/parallel-scheduler", () => ({
  parallelScheduler: { dispose: () => parallelDispose() },
}));
vi.mock("../../src/main/preview/preview-handlers", () => ({
  shutdownAllPreviewSync: () => shutdownAllPreviewSync(),
}));
vi.mock("../../src/main/terminal-handlers", () => ({
  stopAllInteractiveTerminalsSync: () => stopAllInteractiveTerminalsSync(),
}));
vi.mock("../../src/main/tasks-handlers", () => ({
  shutdownAllTasksSync: () => shutdownAllTasksSync(),
}));
vi.mock("../../ai/mcp/mcp-client", () => ({
  stopAllMcpServers: () => stopAllMcpServers(),
}));
vi.mock("../../src/main/lsp-handlers", () => ({
  stopAllLspSessions: () => stopAllLspSessions(),
}));
vi.mock("../../src/main/cad-local-server", () => ({
  stopCadLocalServerAndWait: () => stopCadLocalServerAndWait(),
}));
vi.mock("../../src/main/marketplace-server", () => ({
  stopMarketplaceServerAndWait: () => stopMarketplaceServerAndWait(),
}));
vi.mock("../../src/main/local-ai-setup", () => ({
  stopManagedOllamaIfStartedAndWait: () => stopManagedOllamaIfStartedAndWait(),
}));
vi.mock("../../src/main/abort/stream-abort", () => ({
  abortAllAbortableStreams: () => abortAllAbortableStreams(),
}));

describe("runAppShutdown", () => {
  beforeEach(async () => {
    vi.resetModules();
    closeAllAiPersistence.mockClear();
    stopCadOrphanScan.mockClear();
    clearAllTurnWatchdogs.mockClear();
    workspaceClose.mockClear();
    preloadDispose.mockClear();
    parallelDispose.mockClear();
    shutdownAllPreviewSync.mockClear();
    stopAllInteractiveTerminalsSync.mockClear();
    shutdownAllTasksSync.mockClear();
    stopAllMcpServers.mockClear();
    stopAllLspSessions.mockClear();
    stopCadLocalServerAndWait.mockClear();
    stopMarketplaceServerAndWait.mockClear();
    stopManagedOllamaIfStartedAndWait.mockClear();
    abortAllAbortableStreams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes each resource once and logs [shutdown] complete", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { runAppShutdown, isAppShutdownComplete, __resetAppShutdownForTests } =
      await import("../../src/main/app-shutdown");
    __resetAppShutdownForTests();

    await runAppShutdown("test");

    expect(abortAllAbortableStreams).toHaveBeenCalledTimes(1);
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopCadOrphanScan).toHaveBeenCalledTimes(1);
    expect(clearAllTurnWatchdogs).toHaveBeenCalledTimes(1);
    expect(workspaceClose).toHaveBeenCalledTimes(1);
    expect(preloadDispose).not.toHaveBeenCalled();
    expect(parallelDispose).not.toHaveBeenCalled();
    expect(shutdownAllPreviewSync).toHaveBeenCalledTimes(1);
    expect(stopAllInteractiveTerminalsSync).toHaveBeenCalledTimes(1);
    expect(shutdownAllTasksSync).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
    expect(stopAllLspSessions).toHaveBeenCalledTimes(1);
    expect(stopCadLocalServerAndWait).toHaveBeenCalledTimes(1);
    expect(stopMarketplaceServerAndWait).toHaveBeenCalledTimes(1);
    expect(stopManagedOllamaIfStartedAndWait).toHaveBeenCalledTimes(1);
    expect(isAppShutdownComplete()).toBe(true);
    expect(
      info.mock.calls.some((call) => String(call[0]).includes("[shutdown]") && String(call[0]).includes(" complete"))
    ).toBe(true);
  });

  it("is idempotent — a second call does not close resources again", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { runAppShutdown, __resetAppShutdownForTests } = await import(
      "../../src/main/app-shutdown"
    );
    __resetAppShutdownForTests();

    await runAppShutdown("first");
    await runAppShutdown("second");

    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
    expect(stopAllLspSessions).toHaveBeenCalledTimes(1);
    expect(stopManagedOllamaIfStartedAndWait).toHaveBeenCalledTimes(1);
    expect(preloadDispose).not.toHaveBeenCalled();
  });

  it("logs [shutdown:error] with stack and continues later steps", async () => {
    closeAllAiPersistence.mockImplementation(() => {
      throw new Error("sqlite boom");
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { runAppShutdown, isAppShutdownComplete, __resetAppShutdownForTests } =
      await import("../../src/main/app-shutdown");
    __resetAppShutdownForTests();

    await runAppShutdown("test");

    expect(stopManagedOllamaIfStartedAndWait).toHaveBeenCalledTimes(1);
    expect(isAppShutdownComplete()).toBe(true);
    const errLine = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(errLine).toContain("[shutdown:error] sqlite-close-all");
    expect(errLine).toContain("sqlite boom");
    expect(
      info.mock.calls.some((call) => String(call[0]).includes("[shutdown]") && String(call[0]).includes(" complete"))
    ).toBe(true);
  });
});

type QuitListener = (event: { preventDefault: () => void }) => void;

function createQuitApp() {
  const listeners = new Map<string, QuitListener[]>();
  const quit = vi.fn();
  const electronApp = {
    on: vi.fn((event: string, handler: QuitListener) => {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
    }),
    quit,
  };
  const emit = (event: string) => {
    const preventDefault = vi.fn();
    const payload = { preventDefault };
    for (const handler of listeners.get(event) ?? []) {
      handler(payload);
    }
    return payload;
  };
  return { electronApp, quit, emit, listeners };
}

describe("quit barriers (before-quit / before-quit-for-update)", () => {
  beforeEach(async () => {
    vi.resetModules();
    closeAllAiPersistence.mockClear();
    stopAllMcpServers.mockClear();
    stopAllLspSessions.mockClear();
    stopManagedOllamaIfStartedAndWait.mockClear();
    abortAllAbortableStreams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("before-quit-for-update runs runAppShutdown once with the same step sequence", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { installQuitBarriers, isAppShutdownComplete, isQuitReady, __resetAppShutdownForTests } =
      await import("../../src/main/app-shutdown");
    __resetAppShutdownForTests();
    const { electronApp, quit, emit } = createQuitApp();
    installQuitBarriers(electronApp as never);

    const first = emit("before-quit-for-update");
    expect(first.preventDefault).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(isAppShutdownComplete()).toBe(true);
      expect(isQuitReady()).toBe(true);
    });

    expect(abortAllAbortableStreams).toHaveBeenCalledTimes(1);
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
    expect(stopAllLspSessions).toHaveBeenCalledTimes(1);
    expect(stopManagedOllamaIfStartedAndWait).toHaveBeenCalledTimes(1);
    expect(preloadDispose).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    const lines = info.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("before-quit-for-update"))).toBe(true);
    expect(lines.some((line) => line.includes("[shutdown]") && line.includes(" begin") && line.includes("quit-for-update"))).toBe(true);
    expect(lines.some((line) => line.includes("[shutdown]") && line.includes(" complete"))).toBe(true);
  });

  it("second before-quit after update teardown is a no-op (does not re-close SQLite/MCP)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { installQuitBarriers, isQuitReady, __resetAppShutdownForTests } = await import(
      "../../src/main/app-shutdown"
    );
    __resetAppShutdownForTests();
    const { electronApp, quit, emit } = createQuitApp();
    installQuitBarriers(electronApp as never);

    emit("before-quit-for-update");
    await vi.waitFor(() => expect(isQuitReady()).toBe(true));
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);

    const second = emit("before-quit");
    await Promise.resolve();
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
    expect(stopAllLspSessions).toHaveBeenCalledTimes(1);
    expect(quit).not.toHaveBeenCalled();
  });
});

describe("safeQuitAndInstall", () => {
  beforeEach(async () => {
    vi.resetModules();
    quitAndInstall.mockReset();
    closeAllAiPersistence.mockClear();
    stopAllMcpServers.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls quitAndInstall only after [shutdown] complete and opens the quit gate", async () => {
    const order: string[] = [];
    vi.spyOn(console, "info").mockImplementation((message?: unknown) => {
      if (String(message).includes("[shutdown]") && String(message).includes(" complete")) {
        order.push("complete");
      }
    });
    quitAndInstall.mockImplementation(() => {
      order.push("quitAndInstall");
    });

    const { __resetAppShutdownForTests, isQuitReady } = await import("../../src/main/app-shutdown");
    __resetAppShutdownForTests();
    const { safeQuitAndInstall } = await import("../../installer/updater/auto-updater");

    await safeQuitAndInstall();

    expect(order).toEqual(["complete", "quitAndInstall"]);
    expect(isQuitReady()).toBe(true);
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);

    const { installQuitBarriers } = await import("../../src/main/app-shutdown");
    const { electronApp, emit } = createQuitApp();
    installQuitBarriers(electronApp as never);
    const second = emit("before-quit");
    await Promise.resolve();
    expect(second.preventDefault).not.toHaveBeenCalled();
    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopAllMcpServers).toHaveBeenCalledTimes(1);
  });
});
