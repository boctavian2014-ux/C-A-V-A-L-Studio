import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { redactSensitiveCommandOutput } from "../../shared/command-output-redaction";
import {
  isValidTaskName,
  type Task,
  type TaskOutputChunk,
  type TaskRun,
  type TaskRunStatus,
} from "../../shared/tasks-contract";
import { sanitizeEnvForTerminal } from "../subprocess-env";

interface PackageJson {
  scripts?: Record<string, unknown>;
}

export interface TaskChildProcess {
  pid?: number | null;
  stdout: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type TaskSpawner = (taskName: string, cwd: string) => TaskChildProcess;

export interface TasksServiceOptions {
  spawnRun?: TaskSpawner;
}

interface InternalRun {
  run: TaskRun;
  cwd: string;
  stopping: boolean;
  finished: boolean;
}

const MAX_HISTORY = 50;
const MAX_CONCURRENT = 8;
const STOP_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_CHUNK = 8_192;

const NPM_RUN_ARGS = ["run", "--"] as const;

export function taskOutputChannelId(runId: string): string {
  return `task:${runId}`;
}

function isInsideCwd(cwd: string, target: string): boolean {
  const rel = path.relative(cwd, target);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function isNpmCliJs(filePath: string): boolean {
  return path.basename(filePath).toLowerCase() === "npm-cli.js";
}

function existingFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    if (!statSync(filePath).isFile()) return null;
    return filePath;
  } catch {
    return null;
  }
}

/** Resolve npm-cli.js (preferred) so we never spawn a user script body. */
export function resolveNpmCliJs(cwd: string): string | null {
  const local = path.join(cwd, "node_modules", "npm", "bin", "npm-cli.js");
  if (existingFile(local) && isInsideCwd(cwd, local) && isNpmCliJs(local)) {
    return local;
  }

  const fromEnv = process.env.npm_execpath?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (isNpmCliJs(resolved) && existingFile(resolved)) {
      return resolved;
    }
  }

  const nextToNode = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (isNpmCliJs(nextToNode) && existingFile(nextToNode)) {
    return nextToNode;
  }

  return null;
}

export function resolveNpmRunInvocation(cwd: string, taskName: string): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const env = {
    ...sanitizeEnvForTerminal(),
    FORCE_COLOR: "0",
  };
  const cli = resolveNpmCliJs(cwd);
  if (cli) {
    return {
      command: process.execPath,
      args: [cli, ...NPM_RUN_ARGS, taskName],
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [...NPM_RUN_ARGS, taskName],
    env,
  };
}

/**
 * Kill a task process and its descendants.
 * Windows: taskkill /T /F first (same idea as Preview) while the parent is still
 * alive, so `npm run` children are not reparented and left orphaned.
 * Unix: SIGTERM/SIGKILL the detached process group, never Electron's own group.
 */
export function killTaskProcess(proc: TaskChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  const pid = proc.pid;
  if (typeof pid === "number" && pid > 1 && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 8_000,
    });
  }
  try {
    proc.kill(signal);
  } catch {
    // already gone
  }
  if (typeof pid !== "number" || pid <= 1 || process.platform === "win32") {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // not a group leader, or already gone
  }
}

function spawnNpmRun(taskName: string, cwd: string): ChildProcess {
  const invocation = resolveNpmRunInvocation(cwd, taskName);
  return spawn(invocation.command, invocation.args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: invocation.env,
    stdio: ["ignore", "pipe", "pipe"],
    // New process group on POSIX so stop/shutdownAll can kill descendants without touching Electron.
    detached: process.platform !== "win32",
  });
}

function snapshot(run: TaskRun): TaskRun {
  return { ...run };
}

function readPackageScripts(cwd: string): Record<string, string> {
  const packageJsonPath = path.join(cwd, "package.json");
  const rel = path.relative(cwd, packageJsonPath);
  if (rel !== "package.json" && rel !== "package.json".replace("/", path.sep)) {
    return {};
  }
  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    const raw = readFileSync(packageJsonPath, "utf-8").replace(/^\uFEFF/, "");
    const pkg = JSON.parse(raw) as PackageJson;
    const scripts = pkg.scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command !== "string" || !isValidTaskName(name)) continue;
      out[name] = command;
    }
    return out;
  } catch {
    return {};
  }
}

function decodeChunk(chunk: Buffer | string): string {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const clipped = text.length > MAX_OUTPUT_CHUNK ? `${text.slice(0, MAX_OUTPUT_CHUNK)}\n…(truncated)\n` : text;
  return redactSensitiveCommandOutput(clipped);
}

export class TasksService extends EventEmitter {
  private readonly internals = new Map<string, InternalRun>();
  private readonly processes = new Map<string, TaskChildProcess>();
  private readonly spawnRun: TaskSpawner;

  constructor(options: TasksServiceOptions = {}) {
    super();
    this.spawnRun = options.spawnRun ?? spawnNpmRun;
  }

  list(cwd: string): Task[] {
    const scripts = readPackageScripts(cwd);
    return Object.entries(scripts).map(([name, command]) => ({
      name,
      command,
      source: "package.json" as const,
    }));
  }

  async run(cwd: string, taskName: string): Promise<TaskRun> {
    if (!isValidTaskName(taskName)) {
      throw new TypeError("Invalid task name");
    }

    const task = this.list(cwd).find((item) => item.name === taskName);
    if (!task) {
      throw new Error(`Task not found: ${taskName}`);
    }

    const activeForTask = [...this.internals.values()].some(
      (item) => item.cwd === cwd && item.run.taskName === taskName && !item.finished
    );
    if (activeForTask) {
      throw new Error(`Task already running: ${taskName}`);
    }

    const activeCount = [...this.internals.values()].filter((item) => !item.finished).length;
    if (activeCount >= MAX_CONCURRENT) {
      throw new Error("Too many running tasks");
    }

    const runId = randomUUID();
    const run: TaskRun = {
      id: runId,
      taskName,
      status: "starting",
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      terminalId: taskOutputChannelId(runId),
    };
    const internal: InternalRun = { run, cwd, stopping: false, finished: false };
    this.internals.set(runId, internal);
    this.emitRunChanged(run);

    let proc: TaskChildProcess;
    try {
      proc = this.spawnRun(taskName, cwd);
    } catch {
      this.finish(internal, "failed", null);
      return snapshot(run);
    }

    this.processes.set(runId, proc);
    run.status = "running";
    this.emitRunChanged(run);

    const onData = (chunk: Buffer | string) => {
      const data = decodeChunk(chunk);
      if (!data) return;
      const payload: TaskOutputChunk = { runId, taskName, data };
      this.emit("output", payload);
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("error", () => {
      this.finish(internal, "failed", null);
    });

    proc.on("exit", (code) => {
      if (internal.stopping) {
        this.finish(internal, "stopped", code);
        return;
      }
      this.finish(internal, code === 0 ? "success" : "failed", code);
    });

    this.pruneHistory();
    return snapshot(run);
  }

  async stop(cwd: string, runId: string): Promise<void> {
    const internal = this.internals.get(runId);
    const proc = this.processes.get(runId);
    if (!internal || !proc || internal.cwd !== cwd || internal.finished) {
      return;
    }

    internal.stopping = true;

    return new Promise((resolvePromise) => {
      const timeout = setTimeout(() => {
        killTaskProcess(proc, "SIGKILL");
        this.finish(internal, "stopped", null);
        resolvePromise();
      }, STOP_TIMEOUT_MS);

      const onExit = () => {
        clearTimeout(timeout);
        this.finish(internal, "stopped", null);
        resolvePromise();
      };

      proc.on("exit", onExit);
      killTaskProcess(proc, "SIGTERM");
    });
  }

  getRun(cwd: string, runId: string): TaskRun | undefined {
    const internal = this.internals.get(runId);
    if (!internal || internal.cwd !== cwd) return undefined;
    return snapshot(internal.run);
  }

  getRuns(cwd: string): TaskRun[] {
    return [...this.internals.values()]
      .filter((item) => item.cwd === cwd)
      .map((item) => snapshot(item.run))
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async shutdownAll(): Promise<void> {
    const ids = [...this.processes.keys()];
    await Promise.all(
      ids.map(async (id) => {
        const internal = this.internals.get(id);
        if (!internal) return;
        await this.stop(internal.cwd, id);
      })
    );
  }

  /** Blocking kill for `window-all-closed` — must finish before `app.quit()`. */
  shutdownAllSync(): void {
    const ids = [...this.processes.keys()];
    for (const id of ids) {
      const proc = this.processes.get(id);
      const internal = this.internals.get(id);
      if (!proc || !internal || internal.finished) continue;
      internal.stopping = true;
      killTaskProcess(proc, "SIGKILL");
      this.finish(internal, "stopped", null);
    }
  }

  private finish(internal: InternalRun, status: TaskRunStatus, exitCode: number | null): void {
    if (internal.finished) return;
    internal.finished = true;
    internal.run.status = status;
    internal.run.finishedAt = Date.now();
    internal.run.exitCode = exitCode;
    this.processes.delete(internal.run.id);
    this.emitRunChanged(internal.run);
  }

  private emitRunChanged(run: TaskRun): void {
    this.emit("run-changed", snapshot(run));
  }

  private pruneHistory(): void {
    const finished = [...this.internals.values()]
      .filter((item) => item.finished)
      .sort((a, b) => a.run.startedAt - b.run.startedAt);
    const overflow = this.internals.size - MAX_HISTORY;
    if (overflow <= 0) return;
    for (const item of finished.slice(0, overflow)) {
      this.internals.delete(item.run.id);
    }
  }
}

export const tasksService = new TasksService();
