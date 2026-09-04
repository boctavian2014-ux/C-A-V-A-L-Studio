import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import {
  attachLspProcessForTests,
  stopAllLspSessions,
} from "../../src/main/lsp-handlers";

describe("stopAllLspSessions", () => {
  afterEach(async () => {
    await stopAllLspSessions(200);
  });

  it("is safe to call twice with no sessions", async () => {
    await expect(stopAllLspSessions()).resolves.toBeUndefined();
    await expect(stopAllLspSessions()).resolves.toBeUndefined();
  });

  it("stops an attached child once when called twice", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      windowsHide: true,
      stdio: "ignore",
    });
    attachLspProcessForTests("lsp-shutdown-once", child as never);
    await stopAllLspSessions(2_000);
    await stopAllLspSessions(2_000);
    expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
