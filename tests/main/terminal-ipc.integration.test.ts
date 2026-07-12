import { beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

const terminalMocks = vi.hoisted(() => {
  const sessions = new Map<
    string,
    {
      onData: (cb: (data: string) => void) => void;
      write: ReturnType<typeof vi.fn>;
      resize: ReturnType<typeof vi.fn>;
      kill: ReturnType<typeof vi.fn>;
      emit: (data: string) => void;
    }
  >();

  return {
    sessions,
    spawn: vi.fn((_shell: string, _args: string[], _opts: unknown) => {
      const handlers: Array<(data: string) => void> = [];
      const session = {
        onData: (cb: (data: string) => void) => {
          handlers.push(cb);
        },
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        emit: (data: string) => {
          for (const handler of handlers) handler(data);
        },
      };
      return session;
    }),
    registerSession(id: string, session: ReturnType<typeof terminalMocks.spawn>) {
      sessions.set(id, session as never);
    },
  };
});

const mockWindow = vi.hoisted(() => ({
  webContents: {
    send: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
  },
}));

vi.mock("node-pty", () => ({
  spawn: terminalMocks.spawn,
}));

describe("Terminal IPC integration", () => {
  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    terminalMocks.spawn.mockClear();
    terminalMocks.sessions.clear();
    mockWindow.webContents.send.mockClear();

    await import("../../src/main/terminal-handlers");
  });

  it("terminal:create spawns a PTY and wires output to renderer", async () => {
    const created = await harness.invoke<{ ok: boolean }>("terminal:create", "term-1");
    expect(created.ok).toBe(true);
    expect(terminalMocks.spawn).toHaveBeenCalled();

    const session = terminalMocks.spawn.mock.results[0]?.value as { emit: (data: string) => void };
    session.emit("prompt> ");

    expect(mockWindow.webContents.send).toHaveBeenCalledWith("terminal:data:term-1", "prompt> ");
  });

  it("terminal:write forwards input to the PTY session", async () => {
    await harness.invoke("terminal:create", "term-2");
    const session = terminalMocks.spawn.mock.results[0]?.value as { write: ReturnType<typeof vi.fn> };

    const wrote = await harness.invoke<{ ok: boolean }>("terminal:write", "term-2", "echo hi\r");
    expect(wrote.ok).toBe(true);
    expect(session.write).toHaveBeenCalledWith("echo hi\r");
  });

  it("terminal:write returns error for unknown session", async () => {
    const wrote = await harness.invoke<{ ok: boolean; error?: string }>(
      "terminal:write",
      "missing",
      "data"
    );
    expect(wrote.ok).toBe(false);
    expect(wrote.error).toMatch(/not found/i);
  });

  it("terminal:resize updates PTY dimensions", async () => {
    await harness.invoke("terminal:create", "term-3");
    const session = terminalMocks.spawn.mock.results[0]?.value as { resize: ReturnType<typeof vi.fn> };

    const resized = await harness.invoke<{ ok: boolean }>("terminal:resize", "term-3", 100, 40);
    expect(resized.ok).toBe(true);
    expect(session.resize).toHaveBeenCalledWith(100, 40);
  });

  it("terminal:destroy kills session and accepts subsequent destroy", async () => {
    await harness.invoke("terminal:create", "term-4");
    const session = terminalMocks.spawn.mock.results[0]?.value as { kill: ReturnType<typeof vi.fn> };

    const destroyed = await harness.invoke<{ ok: boolean }>("terminal:destroy", "term-4");
    expect(destroyed.ok).toBe(true);
    expect(session.kill).toHaveBeenCalled();

    const writeAfter = await harness.invoke<{ ok: boolean; error?: string }>(
      "terminal:write",
      "term-4",
      "x"
    );
    expect(writeAfter.ok).toBe(false);
  });

  it("terminal:create fails when no BrowserWindow is attached", async () => {
    const { BrowserWindow } = await import("electron");
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null);

    const created = await harness.invoke<{ ok: boolean; error?: string }>("terminal:create", "term-5");
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/window/i);
  });

  it("terminal:create uses workspace cwd when provided", async () => {
    const workspaceCwd = process.cwd();
    const created = await harness.invoke<{ ok: boolean }>("terminal:create", "term-cwd", {
      cwd: workspaceCwd,
    });
    expect(created.ok).toBe(true);
    expect(terminalMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cwd: workspaceCwd })
    );
  });

  it("terminal:create falls back to homedir for invalid cwd", async () => {
    const os = await import("os");
    await harness.invoke("terminal:create", "term-bad-cwd", { cwd: "Z:\\nonexistent\\path" });
    expect(terminalMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      [],
      expect.objectContaining({ cwd: os.homedir() })
    );
  });
});
