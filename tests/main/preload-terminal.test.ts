import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const { invoke, on, removeListener } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke,
    on,
    removeListener,
  },
}));

import { assertTerminalId, terminalApi } from "../../src/main/preload-terminal";
import { TERMINAL_CHANNELS } from "../../src/shared/terminal-ipc-channels";
import type { TerminalInfo, TerminalOutputLine } from "../../src/shared/terminal-contract";

const sampleInfo: TerminalInfo = {
  id: "term-1",
  title: "pwsh 1",
  cwd: "C:\\proj",
  shell: "PowerShell 7",
  status: "active",
  pid: 42,
  createdAt: 1,
  exitedAt: null,
  exitCode: null,
};

describe("preload-terminal", () => {
  beforeEach(() => {
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    invoke.mockResolvedValue(sampleInfo);
  });

  it("create sends options on terminal:create", async () => {
    const options = { cwd: "C:\\proj", title: "pwsh 1", shell: "pwsh" };
    await terminalApi.create(options);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(TERMINAL_CHANNELS.create, options);
  });

  it("write validates terminalId and sends data", async () => {
    invoke.mockResolvedValue(undefined);
    await terminalApi.write("term-1", "echo hi\r");
    expect(invoke).toHaveBeenCalledWith(TERMINAL_CHANNELS.write, "term-1", "echo hi\r");
  });

  it("onOutput registers a listener and cleanup removes the same reference", () => {
    const cb = vi.fn();
    const unsubscribe = terminalApi.onOutput(cb);
    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0]?.[0]).toBe(TERMINAL_CHANNELS.output);
    const listener = on.mock.calls[0]?.[1] as (
      event: Electron.IpcRendererEvent,
      line: TerminalOutputLine
    ) => void;
    const mockEvent = { sender: { send: vi.fn() } } as unknown as Electron.IpcRendererEvent;
    const line: TerminalOutputLine = { terminalId: "term-1", data: "prompt> ", timestamp: 9 };
    listener(mockEvent, line);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]).toEqual([line]);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(TERMINAL_CHANNELS.output, listener);
  });

  it("onExit registers a listener and cleanup removes the same reference", () => {
    const cb = vi.fn();
    const unsubscribe = terminalApi.onExit(cb);
    expect(on.mock.calls[0]?.[0]).toBe(TERMINAL_CHANNELS.exit);
    const listener = on.mock.calls[0]?.[1] as (
      event: Electron.IpcRendererEvent,
      info: TerminalInfo
    ) => void;
    const mockEvent = { sender: { send: vi.fn() } } as unknown as Electron.IpcRendererEvent;
    const info: TerminalInfo = { ...sampleInfo, status: "exited", exitedAt: 2, exitCode: 0 };
    listener(mockEvent, info);
    expect(cb.mock.calls[0]).toEqual([info]);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(TERMINAL_CHANNELS.exit, listener);
  });

  it("destroy with an invalid id throws TypeError before invoke", async () => {
    await expect(terminalApi.destroy("")).rejects.toThrow(TypeError);
    expect(() => assertTerminalId("")).toThrow(TypeError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not import node:path (Electron sandbox)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../src/main/preload-terminal.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/from ["']node:path["']/);
  });
});
