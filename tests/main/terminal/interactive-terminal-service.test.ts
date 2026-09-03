import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InteractiveTerminalService,
  killPtyProcess,
  type InteractivePty,
} from "../../../src/main/terminal/interactive-terminal-service";

function createFakePty(pid?: number): InteractivePty & { killed: boolean; lastSignal?: string } {
  return {
    pid,
    killed: false,
    lastSignal: undefined,
    write: vi.fn(),
    resize: vi.fn(),
    kill(signal?: string) {
      this.killed = true;
      this.lastSignal = signal;
    },
    onData: vi.fn(),
  };
}

const shell = {
  command: "bash",
  interactiveArgs: [] as string[],
  kind: "bash" as const,
  label: "bash",
};

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
}

describe("killPtyProcess", () => {
  it("on Windows calls taskkill /T /F before disposing the PTY", () => {
    const spawnSyncFn = vi.fn();
    const sessionPty = createFakePty(4242);
    killPtyProcess(sessionPty, { platform: "win32", spawnSyncFn });
    expect(spawnSyncFn).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "4242", "/T", "/F"],
      expect.objectContaining({ stdio: "ignore" })
    );
    expect(sessionPty.killed).toBe(true);
    expect(sessionPty.lastSignal).toBeUndefined();
  });

  it("on POSIX tries process.kill(-pid) and falls back to pty.kill()", () => {
    const sessionPty = createFakePty(4242);
    const killGroupFn = vi.fn(() => {
      throw new Error("not a group leader");
    });
    killPtyProcess(sessionPty, { platform: "linux", killGroupFn });
    expect(killGroupFn).toHaveBeenCalledWith(4242, "SIGKILL");
    expect(sessionPty.killed).toBe(true);
  });

  it("on POSIX uses the process group kill when it succeeds", () => {
    const sessionPty = createFakePty(4242);
    const killGroupFn = vi.fn();
    killPtyProcess(sessionPty, { platform: "linux", killGroupFn });
    expect(killGroupFn).toHaveBeenCalledWith(4242, "SIGKILL");
  });
});

describe("InteractiveTerminalService.stopAllInteractiveTerminalsSync", () => {
  it("on Windows calls taskkill /T /F and clears sessions", () => {
    const spawnSyncFn = vi.fn();
    const sessionPty = createFakePty(4242);
    const service = new InteractiveTerminalService({
      spawnFn: () => sessionPty,
      resolveShell: () => shell,
      killDeps: { platform: "win32", spawnSyncFn },
    });
    service.create({ id: "term-1", cwd: "/tmp", onData: () => undefined });
    expect(service.sessionCount()).toBe(1);
    service.stopAllInteractiveTerminalsSync();
    expect(spawnSyncFn).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "4242", "/T", "/F"],
      expect.objectContaining({ stdio: "ignore" })
    );
    expect(service.sessionCount()).toBe(0);
  });

  it("on POSIX tries process.kill(-pid), falls back to pty.kill(), then clears", () => {
    const sessionPty = createFakePty(77);
    const killGroupFn = vi.fn(() => {
      throw new Error("ESRCH");
    });
    const service = new InteractiveTerminalService({
      spawnFn: () => sessionPty,
      resolveShell: () => shell,
      killDeps: { platform: "linux", killGroupFn },
    });
    service.create({ id: "term-1", cwd: "/tmp", onData: () => undefined });
    service.stopAllInteractiveTerminalsSync();
    expect(killGroupFn).toHaveBeenCalledWith(77, "SIGKILL");
    expect(sessionPty.killed).toBe(true);
    expect(service.sessionCount()).toBe(0);
  });

  it("clears sessions even when kill throws", () => {
    const sessionPty = createFakePty(9);
    const service = new InteractiveTerminalService({
      spawnFn: () => sessionPty,
      resolveShell: () => shell,
      killDeps: {
        platform: "win32",
        spawnSyncFn: () => {
          throw new Error("taskkill failed");
        },
      },
    });
    service.create({ id: "term-1", cwd: "/tmp", onData: () => undefined });
    service.stopAllInteractiveTerminalsSync();
    expect(service.sessionCount()).toBe(0);
  });
});

describe("InteractiveTerminalService real descendant smoke", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // still held by a leftover process
      }
    }
    dirs.length = 0;
  });

  it(
    "stopAllInteractiveTerminalsSync does not leave a node descendant running",
    async () => {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "caval-term-smoke-"));
      dirs.push(cwd);
      const child = spawn(
        process.execPath,
        ["-e", "require('fs').writeFileSync('pid.txt', String(process.pid)); setInterval(()=>{}, 1000)"],
        { cwd, stdio: "ignore", windowsHide: true }
      );
      const pidPath = path.join(cwd, "pid.txt");
      const appeared = await waitUntil(() => fs.existsSync(pidPath), 10_000);
      expect(appeared).toBe(true);
      const childPid = Number(fs.readFileSync(pidPath, "utf8").trim());
      expect(isPidAlive(childPid)).toBe(true);

      const fakePty: InteractivePty = {
        pid: child.pid,
        write() {},
        resize() {},
        kill() {
          try {
            child.kill();
          } catch {
            // already dead
          }
        },
        onData() {},
      };

      const service = new InteractiveTerminalService({
        spawnFn: () => fakePty,
        resolveShell: () => shell,
      });
      service.create({ id: "term-hang", cwd, onData: () => undefined });
      service.stopAllInteractiveTerminalsSync();

      const dead = await waitUntil(() => !isPidAlive(childPid) && !isPidAlive(child.pid ?? 0), 8_000);
      expect(dead).toBe(true);
      expect(service.sessionCount()).toBe(0);
    },
    20_000
  );
});
