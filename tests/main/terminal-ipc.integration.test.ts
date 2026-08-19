import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";
import { TERMINAL_CHANNELS } from "../../src/shared/terminal-ipc-channels";
import type { TerminalInfo } from "../../src/shared/terminal-contract";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();

const terminalMocks = vi.hoisted(() => {
  return {
    spawn: vi.fn((_shell: string, _args: string[], _opts: unknown) => {
      const handlers: Array<(data: string) => void> = [];
      return {
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
    }),
  };
});

const mockWindow = vi.hoisted(() => ({
  isDestroyed: () => false,
  webContents: {
    send: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getAllWindows: vi.fn(() => [mockWindow]),
  },
}));

vi.mock("node-pty", () => ({
  spawn: terminalMocks.spawn,
}));

vi.mock("../../src/main/powershell-shell", async () => {
  const actual = await vi.importActual<typeof import("../../src/main/powershell-shell")>(
    "../../src/main/powershell-shell"
  );
  return {
    ...actual,
    ensureLatestPowerShellInstalled: vi.fn(async () => ({
      ok: true,
      already: true,
      path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    })),
  };
});

type Created = TerminalInfo & { ok: boolean; error?: string };

describe("Terminal IPC integration (Lot B Zone A)", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    terminalMocks.spawn.mockClear();
    mockWindow.webContents.send.mockClear();
    boundRoots.clear();

    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-term-ws-"));
    boundRoots.set(harness.sender.id, workspace);

    const { registerTerminalHandlers } = await import("../../src/main/terminal-handlers");
    registerTerminalHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("terminal:create spawns a PTY and wires output to renderer", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "term-1" });
    expect(created.ok).toBe(true);
    expect(terminalMocks.spawn).toHaveBeenCalled();

    const session = terminalMocks.spawn.mock.results[0]?.value as { emit: (data: string) => void };
    session.emit("prompt> ");

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.output,
      expect.objectContaining({ terminalId: created.id, data: "prompt> " })
    );
  });

  it("terminal:write forwards input to the PTY session", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "term-2" });
    const session = terminalMocks.spawn.mock.results[0]?.value as { write: ReturnType<typeof vi.fn> };

    const wrote = await harness.invoke<{ ok: boolean }>(
      TERMINAL_CHANNELS.write,
      created.id,
      "echo hi\r"
    );
    expect(wrote.ok).toBe(true);
    expect(session.write).toHaveBeenCalledWith("echo hi\r");
  });

  it("terminal:write returns error for unknown session", async () => {
    const wrote = await harness.invoke<{ ok: boolean; error?: string }>(
      TERMINAL_CHANNELS.write,
      "missing",
      "data"
    );
    expect(wrote.ok).toBe(false);
    expect(wrote.error).toMatch(/not found/i);
  });

  it("terminal:resize updates PTY dimensions", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "term-3" });
    const session = terminalMocks.spawn.mock.results[0]?.value as { resize: ReturnType<typeof vi.fn> };

    const resized = await harness.invoke<{ ok: boolean }>(
      TERMINAL_CHANNELS.resize,
      created.id,
      100,
      40
    );
    expect(resized.ok).toBe(true);
    expect(session.resize).toHaveBeenCalledWith(100, 40);
  });

  it("terminal:destroy kills session and accepts subsequent destroy", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "term-4" });
    const session = terminalMocks.spawn.mock.results[0]?.value as { kill: ReturnType<typeof vi.fn> };

    const destroyed = await harness.invoke<{ ok: boolean }>(TERMINAL_CHANNELS.destroy, created.id);
    expect(destroyed.ok).toBe(true);
    expect(session.kill).toHaveBeenCalled();

    const writeAfter = await harness.invoke<{ ok: boolean; error?: string }>(
      TERMINAL_CHANNELS.write,
      created.id,
      "x"
    );
    expect(writeAfter.ok).toBe(false);
  });

  it("terminal:create fails when no BrowserWindow is attached", async () => {
    const { BrowserWindow } = await import("electron");
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null);

    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "term-5" });
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/window/i);
  });

  it("terminal:create uses bound workspace cwd and ignores renderer cwd", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, {
      cwd: "C:\\Windows\\System32",
      title: "term-cwd",
    });
    expect(created.ok).toBe(true);
    expect(created.cwd).toBe(path.resolve(workspace));
    expect(terminalMocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: path.resolve(workspace) })
    );
  });

  it("terminal:create rejects when workspace is unbound (no homedir fallback)", async () => {
    boundRoots.clear();
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, {
      cwd: os.homedir(),
      title: "term-unbound",
    });
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/folder|workspace/i);
    expect(terminalMocks.spawn).not.toHaveBeenCalled();
  });

  it("terminal:create sanitizes API keys from env", async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-secret-test";
    try {
      await harness.invoke(TERMINAL_CHANNELS.create, { title: "term-env" });
      const opts = terminalMocks.spawn.mock.calls[0]?.[2] as { env: Record<string, string> };
      expect(opts.env.OPENROUTER_API_KEY).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });
});
