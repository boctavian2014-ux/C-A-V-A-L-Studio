import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../ipc-harness";
import { TERMINAL_CHANNELS } from "../../../src/shared/terminal-ipc-channels";
import type { TerminalInfo } from "../../../src/shared/terminal-contract";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();

const terminalMocks = vi.hoisted(() => {
  return {
    spawn: vi.fn((_shell: string, _args: string[], _opts: unknown) => {
      const dataHandlers: Array<(data: string) => void> = [];
      const exitHandlers: Array<(event: { exitCode: number; signal?: number }) => void> = [];
      return {
        pid: 4242,
        onData: (cb: (data: string) => void) => {
          dataHandlers.push(cb);
        },
        onExit: (cb: (event: { exitCode: number; signal?: number }) => void) => {
          exitHandlers.push(cb);
        },
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
        emit: (data: string) => {
          for (const handler of dataHandlers) handler(data);
        },
        emitExit: (exitCode: number) => {
          for (const handler of exitHandlers) handler({ exitCode });
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

vi.mock("../../../src/main/powershell-shell", async () => {
  const actual = await vi.importActual<typeof import("../../../src/main/powershell-shell")>(
    "../../../src/main/powershell-shell"
  );
  return {
    ...actual,
    ensureLatestPowerShellInstalled: vi.fn(async () => ({
      ok: true,
      already: true,
      path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    })),
    resolvePreferredShell: vi.fn(() => ({
      command: "pwsh.exe",
      interactiveArgs: ["-NoLogo"],
      kind: "pwsh",
      label: "PowerShell 7",
    })),
  };
});

type Created = TerminalInfo & { ok: boolean; error?: string };

describe("terminal handlers — typed contract", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    terminalMocks.spawn.mockClear();
    mockWindow.webContents.send.mockClear();
    boundRoots.clear();

    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-term-contract-"));
    boundRoots.set(harness.sender.id, workspace);

    const { registerTerminalHandlers } = await import("../../../src/main/terminal-handlers");
    registerTerminalHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("create({ title }) generates an id in main and returns TerminalInfo", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "Main" });
    expect(created.ok).toBe(true);
    expect(created.id).toMatch(/^term-/);
    expect(created.title).toBe("Main");
    expect(created.cwd).toBe(path.resolve(workspace));
    expect(created.status).toBe("active");
    expect(created.shell).toBe("PowerShell 7");
    expect(terminalMocks.spawn).toHaveBeenCalledWith(
      "pwsh.exe",
      ["-NoLogo"],
      expect.objectContaining({ cwd: path.resolve(workspace) })
    );
  });

  it("ignores renderer cwd and shell; id from renderer is not reused", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, {
      cwd: "C:\\Windows\\System32",
      shell: "cmd.exe",
      title: "Safe",
    });
    expect(created.ok).toBe(true);
    expect(created.id).not.toBe("cmd.exe");
    expect(created.cwd).toBe(path.resolve(workspace));
    expect(created.shell).toBe("PowerShell 7");
    expect(terminalMocks.spawn).toHaveBeenCalledWith(
      "pwsh.exe",
      expect.any(Array),
      expect.objectContaining({ cwd: path.resolve(workspace) })
    );
    expect(terminalMocks.spawn).not.toHaveBeenCalledWith(
      "cmd.exe",
      expect.anything(),
      expect.anything()
    );
  });

  it("write/resize/destroy/list/getInfo follow the generated id", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "One" });
    const session = terminalMocks.spawn.mock.results[0]?.value as {
      write: ReturnType<typeof vi.fn>;
      resize: ReturnType<typeof vi.fn>;
      kill: ReturnType<typeof vi.fn>;
    };

    const listed = await harness.invoke<TerminalInfo[]>(TERMINAL_CHANNELS.list);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const info = await harness.invoke<TerminalInfo | null>(TERMINAL_CHANNELS.getInfo, created.id);
    expect(info?.title).toBe("One");

    const wrote = await harness.invoke<{ ok: boolean }>(
      TERMINAL_CHANNELS.write,
      created.id,
      "echo hi\r"
    );
    expect(wrote.ok).toBe(true);
    expect(session.write).toHaveBeenCalledWith("echo hi\r");

    const resized = await harness.invoke<{ ok: boolean }>(
      TERMINAL_CHANNELS.resize,
      created.id,
      100,
      40
    );
    expect(resized.ok).toBe(true);
    expect(session.resize).toHaveBeenCalledWith(100, 40);

    const destroyed = await harness.invoke<{ ok: boolean }>(TERMINAL_CHANNELS.destroy, created.id);
    expect(destroyed.ok).toBe(true);
    expect(session.kill).toHaveBeenCalled();
    expect(await harness.invoke<TerminalInfo[]>(TERMINAL_CHANNELS.list)).toEqual([]);
    expect(await harness.invoke<TerminalInfo | null>(TERMINAL_CHANNELS.getInfo, created.id)).toBeNull();
  });

  it("broadcasts output and exit on TERMINAL_CHANNELS, not terminal:data:${id}", async () => {
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "Out" });
    const session = terminalMocks.spawn.mock.results[0]?.value as {
      emit: (data: string) => void;
      emitExit: (code: number) => void;
    };

    session.emit("prompt> ");
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.output,
      expect.objectContaining({
        terminalId: created.id,
        data: "prompt> ",
      })
    );
    expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
      `terminal:data:${created.id}`,
      expect.anything()
    );

    mockWindow.webContents.send.mockClear();
    session.emitExit(0);
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      TERMINAL_CHANNELS.exit,
      expect.objectContaining({ id: created.id, status: "exited", exitCode: 0 })
    );
  });

  it("create fails when no BrowserWindow is attached", async () => {
    const { BrowserWindow } = await import("electron");
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null);

    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, { title: "Nope" });
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/window/i);
    expect(terminalMocks.spawn).not.toHaveBeenCalled();
  });

  it("create rejects when workspace is unbound", async () => {
    boundRoots.clear();
    const created = await harness.invoke<Created>(TERMINAL_CHANNELS.create, {
      cwd: os.homedir(),
      title: "Unbound",
    });
    expect(created.ok).toBe(false);
    expect(created.error).toMatch(/folder|workspace/i);
    expect(terminalMocks.spawn).not.toHaveBeenCalled();
  });
});
