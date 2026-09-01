import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const closeAllAiPersistence = vi.fn();
const stopCadOrphanScan = vi.fn();
const clearAllTurnWatchdogs = vi.fn();
const workspaceClose = vi.fn(async () => undefined);
const preloadDispose = vi.fn(async () => undefined);
const parallelDispose = vi.fn(async () => undefined);
const shutdownAllPreviewSync = vi.fn();
const stopAllInteractiveTerminalsSync = vi.fn();
const shutdownAllTasksSync = vi.fn();
const stopCadLocalServerAndWait = vi.fn(async () => undefined);
const stopMarketplaceServerAndWait = vi.fn(async () => undefined);
const stopManagedOllamaIfStartedAndWait = vi.fn(async () => undefined);

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
vi.mock("../../src/main/cad-local-server", () => ({
  stopCadLocalServerAndWait: () => stopCadLocalServerAndWait(),
}));
vi.mock("../../src/main/marketplace-server", () => ({
  stopMarketplaceServerAndWait: () => stopMarketplaceServerAndWait(),
}));
vi.mock("../../src/main/local-ai-setup", () => ({
  stopManagedOllamaIfStartedAndWait: () => stopManagedOllamaIfStartedAndWait(),
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
    stopCadLocalServerAndWait.mockClear();
    stopMarketplaceServerAndWait.mockClear();
    stopManagedOllamaIfStartedAndWait.mockClear();
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

    expect(closeAllAiPersistence).toHaveBeenCalledTimes(1);
    expect(stopCadOrphanScan).toHaveBeenCalledTimes(1);
    expect(clearAllTurnWatchdogs).toHaveBeenCalledTimes(1);
    expect(workspaceClose).toHaveBeenCalledTimes(1);
    expect(preloadDispose).not.toHaveBeenCalled();
    expect(parallelDispose).not.toHaveBeenCalled();
    expect(shutdownAllPreviewSync).toHaveBeenCalledTimes(1);
    expect(stopAllInteractiveTerminalsSync).toHaveBeenCalledTimes(1);
    expect(shutdownAllTasksSync).toHaveBeenCalledTimes(1);
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
    expect(stopManagedOllamaIfStartedAndWait).toHaveBeenCalledTimes(1);
    expect(preloadDispose).not.toHaveBeenCalled();
  });
});
