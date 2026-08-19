import { describe, expect, it, vi } from "vitest";

import {
  InteractiveTerminalService,
  type InteractivePty,
} from "../../../src/main/terminal/interactive-terminal-service";

function createFakePty(): InteractivePty & { killed: boolean; dataHandlers: Array<(data: string) => void> } {
  const dataHandlers: Array<(data: string) => void> = [];
  return {
    dataHandlers,
    killed: false,
    write: vi.fn(),
    resize: vi.fn(),
    kill() {
      this.killed = true;
    },
    onData(cb) {
      dataHandlers.push(cb);
    },
  };
}

describe("InteractiveTerminalService", () => {
  it("creates a PTY with the resolved shell, bound cwd, and title", () => {
    const spawnFn = vi.fn((_file: string, _args: string[], _opts: unknown) => createFakePty());
    const service = new InteractiveTerminalService({
      spawnFn,
      resolveShell: () => ({
        command: "pwsh.exe",
        interactiveArgs: ["-NoLogo"],
        kind: "pwsh",
        label: "PowerShell 7",
      }),
      idFactory: () => "term-generated",
    });

    const created = service.create({
      cwd: "C:\\proj",
      title: "Build",
      onData: () => undefined,
    });
    expect(created).toMatchObject({
      id: "term-generated",
      cwd: "C:\\proj",
      shell: "PowerShell 7",
      status: "active",
      title: "Build",
    });
    expect(spawnFn).toHaveBeenCalledWith(
      "pwsh.exe",
      ["-NoLogo"],
      expect.objectContaining({ cwd: "C:\\proj", cols: 120, rows: 30 })
    );
    expect(service.sessionCount()).toBe(1);
    expect(service.getInfo("term-generated")?.id).toBe("term-generated");
    expect(service.list()).toHaveLength(1);
  });

  it("replacing the same id kills the previous PTY (no duplicates)", () => {
    const first = createFakePty();
    const second = createFakePty();
    const spawnFn = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const service = new InteractiveTerminalService({
      spawnFn,
      resolveShell: () => ({
        command: "pwsh.exe",
        interactiveArgs: [],
        kind: "pwsh",
        label: "pwsh",
      }),
    });

    service.create({ id: "term-1", cwd: "/tmp/a", onData: () => undefined });
    service.create({ id: "term-1", cwd: "/tmp/a", onData: () => undefined });
    expect(first.killed).toBe(true);
    expect(service.sessionCount()).toBe(1);
    expect(service.has("term-1")).toBe(true);
  });

  it("write/resize fail for unknown sessions and succeed for live ones", () => {
    const pty = createFakePty();
    const service = new InteractiveTerminalService({
      spawnFn: () => pty,
      resolveShell: () => ({
        command: "bash",
        interactiveArgs: ["-l"],
        kind: "bash",
        label: "bash",
      }),
    });

    expect(service.write("missing", "x")).toEqual({ ok: false, error: "Session not found" });
    expect(service.resize("missing", 80, 24)).toEqual({ ok: false });

    service.create({ id: "term-1", cwd: "/tmp", onData: () => undefined });
    expect(service.write("term-1", "ls\r")).toEqual({ ok: true });
    expect(pty.write).toHaveBeenCalledWith("ls\r");
    expect(service.resize("term-1", 100, 40)).toEqual({ ok: true });
    expect(pty.resize).toHaveBeenCalledWith(100, 40);
    expect(service.resize("term-1", 0, 24)).toEqual({ ok: false, skipped: true });
  });

  it("forwards PTY data to the create callback", () => {
    const pty = createFakePty();
    const onData = vi.fn();
    const service = new InteractiveTerminalService({
      spawnFn: () => pty,
      resolveShell: () => ({
        command: "bash",
        interactiveArgs: [],
        kind: "bash",
        label: "bash",
      }),
    });
    service.create({ id: "term-1", cwd: "/tmp", onData });
    for (const handler of pty.dataHandlers) handler("hello");
    expect(onData).toHaveBeenCalledWith("hello");
  });

  it("destroyAll kills every session", () => {
    const a = createFakePty();
    const b = createFakePty();
    const spawnFn = vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b);
    const service = new InteractiveTerminalService({
      spawnFn,
      resolveShell: () => ({
        command: "bash",
        interactiveArgs: [],
        kind: "bash",
        label: "bash",
      }),
    });
    service.create({ id: "a", cwd: "/tmp", onData: () => undefined });
    service.create({ id: "b", cwd: "/tmp", onData: () => undefined });
    service.destroyAll();
    expect(a.killed).toBe(true);
    expect(b.killed).toBe(true);
    expect(service.sessionCount()).toBe(0);
  });
});
