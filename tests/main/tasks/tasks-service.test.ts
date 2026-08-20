import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidTaskName } from "../../../src/shared/tasks-contract";
import type { TaskRun } from "../../../src/shared/tasks-contract";
import {
  resolveNpmRunInvocation,
  TasksService,
  type TaskChildProcess,
} from "../../../src/main/tasks/tasks-service";

class FakeProcess extends EventEmitter implements TaskChildProcess {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(_signal?: NodeJS.Signals): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", null, "SIGTERM"));
    return true;
  }
}

function tempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePkg(cwd: string, scripts: Record<string, string>): void {
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "tmp", scripts }), "utf8");
}

describe("isValidTaskName", () => {
  it("accepts npm-style script names", () => {
    expect(isValidTaskName("dev")).toBe(true);
    expect(isValidTaskName("test")).toBe(true);
    expect(isValidTaskName("build:win")).toBe(true);
    expect(isValidTaskName("lint_fix")).toBe(true);
  });

  it("rejects flags, traversal, and empty names", () => {
    expect(isValidTaskName("")).toBe(false);
    expect(isValidTaskName("-rf")).toBe(false);
    expect(isValidTaskName("../evil")).toBe(false);
    expect(isValidTaskName("foo bar")).toBe(false);
    expect(isValidTaskName("foo;rm")).toBe(false);
  });
});

describe("resolveNpmRunInvocation", () => {
  it("runs npm run -- <name> and never the script body", () => {
    const cwd = tempWorkspace("caval-tasks-npm-");
    writePkg(cwd, { pwn: "rm -rf /" });
    const invocation = resolveNpmRunInvocation(cwd, "pwn");
    expect(invocation.args).toEqual(expect.arrayContaining(["run", "--", "pwn"]));
    expect(invocation.args.join(" ")).not.toContain("rm");
    expect(invocation.env.FORCE_COLOR).toBe("0");
    expect(invocation.env).not.toHaveProperty("OPENAI_API_KEY");
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});

describe("TasksService", () => {
  const dirs: string[] = [];
  const services: TasksService[] = [];

  afterEach(async () => {
    await Promise.all(services.map((s) => s.shutdownAll()));
    services.length = 0;
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
    vi.restoreAllMocks();
  });

  function workspace(scripts: Record<string, string>): string {
    const cwd = tempWorkspace("caval-tasks-ws-");
    dirs.push(cwd);
    writePkg(cwd, scripts);
    return cwd;
  }

  function createService(spawnRun?: (name: string, cwd: string) => FakeProcess) {
    const spawned: Array<{ name: string; cwd: string; proc: FakeProcess }> = [];
    const service = new TasksService({
      spawnRun: (name, cwd) => {
        const proc = spawnRun?.(name, cwd) ?? new FakeProcess();
        spawned.push({ name, cwd, proc });
        return proc;
      },
    });
    services.push(service);
    return { service, spawned };
  }

  it("list reads scripts from package.json and skips invalid names", () => {
    const cwd = workspace({
      dev: "webpack --watch",
      "build:web": "webpack",
      "-evil": "rm -rf /",
      "../x": "id",
    });
    const { service } = createService();
    expect(service.list(cwd)).toEqual([
      { name: "dev", command: "webpack --watch", source: "package.json" },
      { name: "build:web", command: "webpack", source: "package.json" },
    ]);
  });

  it("list returns [] when package.json is missing", () => {
    const cwd = tempWorkspace("caval-tasks-empty-");
    dirs.push(cwd);
    const { service } = createService();
    expect(service.list(cwd)).toEqual([]);
  });

  it("run with an unknown task throws", async () => {
    const cwd = workspace({ test: "echo ok" });
    const { service, spawned } = createService();
    await expect(service.run(cwd, "missing")).rejects.toThrow(/Task not found/);
    expect(spawned).toHaveLength(0);
  });

  it("run with an invalid name throws before spawn", async () => {
    const cwd = workspace({ test: "echo ok" });
    const { service, spawned } = createService();
    await expect(service.run(cwd, "../evil")).rejects.toThrow(TypeError);
    await expect(service.run(cwd, "-rf")).rejects.toThrow(TypeError);
    expect(spawned).toHaveLength(0);
  });

  it("run starts a process with the task name and emits run-changed", async () => {
    const cwd = workspace({ dev: "webpack --watch" });
    const { service, spawned } = createService();
    const events: TaskRun[] = [];
    service.on("run-changed", (run: TaskRun) => events.push(run));

    const run = await service.run(cwd, "dev");
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.name).toBe("dev");
    expect(spawned[0]?.cwd).toBe(cwd);
    expect(run.status).toBe("running");
    expect(run.taskName).toBe("dev");
    expect(run.terminalId).toMatch(/^task:/);
    expect(events.map((e) => e.status)).toEqual(["starting", "running"]);

    const outputs: string[] = [];
    service.on("output", (chunk: { data: string }) => outputs.push(chunk.data));
    spawned[0]?.proc.stdout.emit("data", Buffer.from("hello\n"));
    expect(outputs.join("")).toContain("hello");

    spawned[0]?.proc.emit("exit", 0, null);
    await Promise.resolve();
    expect(events.at(-1)?.status).toBe("success");
    expect(events.at(-1)?.exitCode).toBe(0);
  });

  it("stop kills the process and sets status to stopped", async () => {
    const cwd = workspace({ dev: "webpack --watch" });
    const { service, spawned } = createService();
    const events: TaskRun[] = [];
    service.on("run-changed", (run: TaskRun) => events.push(run));

    const run = await service.run(cwd, "dev");
    await service.stop(cwd, run.id);
    expect(spawned[0]?.proc.killed).toBe(true);
    await Promise.resolve();
    expect(events.at(-1)?.status).toBe("stopped");
    expect(service.getRun(cwd, run.id)?.status).toBe("stopped");
  });

  it("shutdownAll stops every running process", async () => {
    const cwd = workspace({ a: "echo a", b: "echo b" });
    const { service, spawned } = createService();
    await service.run(cwd, "a");
    await service.run(cwd, "b");
    expect(spawned).toHaveLength(2);
    await service.shutdownAll();
    expect(spawned.every((item) => item.proc.killed)).toBe(true);
    expect(service.getRuns(cwd).every((run) => run.status === "stopped")).toBe(true);
  });

  it("shutdownAllSync stops every running process before returning", async () => {
    const cwd = workspace({ a: "echo a", b: "echo b" });
    const { service, spawned } = createService();
    await service.run(cwd, "a");
    await service.run(cwd, "b");
    service.shutdownAllSync();
    expect(spawned.every((item) => item.proc.killed)).toBe(true);
    expect(service.getRuns(cwd).every((run) => run.status === "stopped")).toBe(true);
  });

  it("does not return runs from another workspace", async () => {
    const a = workspace({ dev: "echo a" });
    const b = workspace({ dev: "echo b" });
    const { service } = createService();
    const run = await service.run(a, "dev");
    expect(service.getRun(b, run.id)).toBeUndefined();
    expect(service.getRuns(b)).toEqual([]);
    expect(service.getRuns(a)).toHaveLength(1);
  });
});

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
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

describe("TasksService real npm smoke", () => {
  const dirs: string[] = [];
  const services: TasksService[] = [];

  afterEach(async () => {
    await Promise.all(services.map((s) => s.shutdownAll()));
    services.length = 0;
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it(
    "run goes starting → running → success and captures output",
    async () => {
      const cwd = tempWorkspace("caval-tasks-smoke-ok-");
      dirs.push(cwd);
      writePkg(cwd, {
        ok: "node -e \"process.stdout.write('ok-smoke')\"",
      });
      const service = new TasksService();
      services.push(service);
      const events: TaskRun[] = [];
      const outputs: string[] = [];
      service.on("run-changed", (run: TaskRun) => events.push(run));
      service.on("output", (chunk: { data: string }) => outputs.push(chunk.data));

      const run = await service.run(cwd, "ok");
      expect(["starting", "running"]).toContain(run.status);

      const finished = await waitUntil(() => {
        const status = service.getRun(cwd, run.id)?.status;
        return status === "success" || status === "failed";
      }, 20_000);

      expect(finished).toBe(true);
      expect(service.getRun(cwd, run.id)?.status).toBe("success");
      expect(events.map((e) => e.status)).toEqual(
        expect.arrayContaining(["starting", "running", "success"])
      );
      expect(outputs.join("")).toMatch(/ok-smoke/);
    },
    25_000
  );

  it(
    "shutdownAll does not leave npm script descendants running",
    async () => {
      const cwd = tempWorkspace("caval-tasks-smoke-hang-");
      dirs.push(cwd);
      writePkg(cwd, {
        hang: "node -e \"require('fs').writeFileSync('pid.txt', String(process.pid)); setInterval(()=>{}, 1000)\"",
      });
      const service = new TasksService();
      services.push(service);

      await service.run(cwd, "hang");
      const pidPath = path.join(cwd, "pid.txt");
      const appeared = await waitUntil(() => fs.existsSync(pidPath), 15_000);
      expect(appeared).toBe(true);

      const childPid = Number(fs.readFileSync(pidPath, "utf8").trim());
      expect(childPid).toBeGreaterThan(1);
      expect(isPidAlive(childPid)).toBe(true);

      await service.shutdownAll();

      const dead = await waitUntil(() => !isPidAlive(childPid), 8_000);
      expect(dead).toBe(true);
      expect(service.getRuns(cwd).every((run) => run.status === "stopped")).toBe(true);
    },
    30_000
  );

  it(
    "shutdownAllSync does not leave npm script descendants running",
    async () => {
      const cwd = tempWorkspace("caval-tasks-smoke-sync-");
      dirs.push(cwd);
      writePkg(cwd, {
        hang: "node -e \"require('fs').writeFileSync('pid.txt', String(process.pid)); setInterval(()=>{}, 1000)\"",
      });
      const service = new TasksService();
      services.push(service);

      await service.run(cwd, "hang");
      const pidPath = path.join(cwd, "pid.txt");
      const appeared = await waitUntil(() => fs.existsSync(pidPath), 15_000);
      expect(appeared).toBe(true);

      const childPid = Number(fs.readFileSync(pidPath, "utf8").trim());
      expect(isPidAlive(childPid)).toBe(true);

      service.shutdownAllSync();

      const dead = await waitUntil(() => !isPidAlive(childPid), 8_000);
      expect(dead).toBe(true);
      expect(service.getRuns(cwd).every((run) => run.status === "stopped")).toBe(true);
    },
    30_000
  );
});
