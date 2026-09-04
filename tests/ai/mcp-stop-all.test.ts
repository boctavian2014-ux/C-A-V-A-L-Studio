import { afterEach, describe, expect, it, vi } from "vitest";
import os from "node:os";

vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

import {
  closeMcpStdioTransport,
  McpClientManager,
  mcpManager,
} from "../../ai/mcp/mcp-client";

describe("closeMcpStdioTransport", () => {
  it("is a no-op for a missing transport", async () => {
    await expect(closeMcpStdioTransport(null, 50)).resolves.toBe("missing");
    await expect(closeMcpStdioTransport(undefined, 50)).resolves.toBe("missing");
  });

  it("awaits close and does not kill when close resolves", async () => {
    const close = vi.fn(async () => undefined);
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      await expect(closeMcpStdioTransport({ close, pid: 4242 }, 200)).resolves.toBe("closed");
      expect(close).toHaveBeenCalledTimes(1);
      expect(kill).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  });

  it("kills pid when close times out", async () => {
    const close = vi.fn(() => new Promise<void>(() => undefined));
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    try {
      await expect(closeMcpStdioTransport({ close, pid: 4242 }, 20)).resolves.toBe("killed");
      expect(kill).toHaveBeenCalledWith(4242);
    } finally {
      kill.mockRestore();
    }
  });
});

describe("McpClientManager.stopAll", () => {
  afterEach(async () => {
    await mcpManager.stopAll(50);
  });

  it("is safe to call twice with no running servers", async () => {
    await expect(mcpManager.stopAll()).resolves.toBeUndefined();
    await expect(mcpManager.stopAll()).resolves.toBeUndefined();
  });

  it("closes a running transport once when called twice", async () => {
    const close = vi.fn(async () => undefined);
    mcpManager.attachTransportForTests("shutdown-once", { close, pid: 7 });
    await mcpManager.stopAll();
    await mcpManager.stopAll();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stopAll on a fresh manager does not throw", async () => {
    const isolated = new McpClientManager();
    await expect(isolated.stopAll()).resolves.toBeUndefined();
    await expect(isolated.stopAll()).resolves.toBeUndefined();
  });
});
