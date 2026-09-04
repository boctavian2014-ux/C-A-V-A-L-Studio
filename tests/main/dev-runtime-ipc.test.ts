import { beforeEach, describe, expect, it, vi } from "vitest";

const { handle } = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle,
  },
}));

import {
  DEV_RUNTIME_BUILD_STATUS_CHANNEL,
  getDevRuntimeBuildStatus,
  registerDevRuntimeHandlers,
} from "../../src/main/dev-runtime-ipc";

describe("dev-runtime IPC (main process)", () => {
  beforeEach(() => {
    handle.mockReset();
  });

  it("returns a status object with hash fields", () => {
    const status = getDevRuntimeBuildStatus({ NODE_ENV: "development" });
    expect(status.isDev).toBe(true);
    expect(typeof status.runningHash).toBe("string");
    expect(typeof status.latestHash).toBe("string");
    expect(typeof status.needsRestart).toBe("boolean");
  });

  it("is not treated as needing restart in production", () => {
    const status = getDevRuntimeBuildStatus({ NODE_ENV: "production" });
    expect(status.isDev).toBe(false);
    expect(status.needsRestart).toBe(false);
  });

  it("registers the IPC channel before window creation", () => {
    registerDevRuntimeHandlers();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]?.[0]).toBe(DEV_RUNTIME_BUILD_STATUS_CHANNEL);
    const listener = handle.mock.calls[0]?.[1] as () => Promise<{
      ok: boolean;
      status?: { isDev: boolean };
      error?: string;
    }>;
    return expect(listener()).resolves.toMatchObject({ ok: true });
  });
});
