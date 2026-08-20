import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitService } from "../../src/main/git/git-service";
import {
  ProblemsService,
  parseTypeScriptOutput,
} from "../../src/main/problems/problems-service";
import { detectPreviewWorkspace } from "../../src/main/preview/project-detector";
import {
  createPreviewLauncherForTests,
  type PreviewSpawn,
} from "../../src/main/preview/preview-launcher";
import { TasksService } from "../../src/main/tasks/tasks-service";
import {
  InteractiveTerminalService,
  type InteractivePty,
} from "../../src/main/terminal/interactive-terminal-service";

const hasGit = (() => {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

type FakeChild = {
  pid: number;
  stdout: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  stderr: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  kill: (signal?: NodeJS.Signals) => boolean;
  emitStdout: (chunk: string) => void;
};

function createFakeChild(pid = 4242): FakeChild {
  const stdoutListeners: Array<(chunk: Buffer | string) => void> = [];
  const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  return {
    pid,
    stdout: {
      on: (_event, listener) => {
        stdoutListeners.push(listener);
      },
    },
    stderr: { on: () => undefined },
    on(event, listener) {
      if (event === "exit") {
        exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void);
      }
    },
    once(event, listener) {
      if (event === "exit") {
        exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void);
      }
    },
    kill() {
      exitListeners.forEach((fn) => fn(0, null));
      return true;
    },
    emitStdout(chunk) {
      stdoutListeners.forEach((fn) => fn(chunk));
    },
  };
}

function createEchoPty(): InteractivePty & { killed: boolean; writes: string[] } {
  let onData: ((data: string) => void) | undefined;
  return {
    pid: 4242,
    killed: false,
    writes: [],
    write(data: string) {
      this.writes.push(data);
      onData?.(data.includes("echo") ? "test\r\n" : data);
    },
    resize: vi.fn(),
    kill() {
      this.killed = true;
    },
    onData(listener) {
      onData = listener;
    },
  };
}

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

function writeSmokeWorkspace(root: string): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "caval-m4-smoke",
        private: true,
        scripts: {
          dev: "vite",
          ok: "node -e \"process.stdout.write('ok-smoke')\"",
          hang: "node -e \"require('fs').writeFileSync('pid.txt', String(process.pid)); setInterval(()=>{}, 1000)\"",
        },
        devDependencies: { vite: "5.0.0" },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(path.join(root, "vite.config.ts"), "export default {}\n", "utf8");
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }), "utf8");
  fs.writeFileSync(path.join(root, "src", "App.tsx"), "export const App = () => null;\n", "utf8");
  fs.writeFileSync(path.join(root, "README.md"), "# caval-m4-smoke\n", "utf8");
}

function initGit(root: string): void {
  execSync("git init", { cwd: root, stdio: "pipe" });
  execSync('git config user.name "Test"', { cwd: root, stdio: "pipe" });
  execSync('git config user.email "test@example.com"', { cwd: root, stdio: "pipe" });
  execSync("git config commit.gpgsign false", { cwd: root, stdio: "pipe" });
  execSync("git add -A", { cwd: root, stdio: "pipe" });
  execSync('git commit -m "initial"', { cwd: root, stdio: "pipe" });
}

/**
 * Pas 4.6 — one real workspace, M2/M3 services in sequence.
 * Playwright is not in this repo; this drives the same main-process APIs as the UI.
 */
describe.skipIf(!hasGit)("M4 unified smoke (one workspace)", () => {
  let root = "";

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it(
    "runs Preview → Terminal → Git → Problems → Tasks → lifecycle without orphans",
    async () => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m4-smoke-"));
      writeSmokeWorkspace(root);
      initGit(root);

      const detection = detectPreviewWorkspace(root);
      expect(detection.web?.kind).toBe("vite");
      expect(detection.web?.suggestedUrl).toContain("localhost:5173");

      const child = createFakeChild();
      const openUrlFn = vi.fn(async (_url: string) => undefined);
      const spawnFn = vi.fn(() => child as unknown as ReturnType<PreviewSpawn>);
      const preview = createPreviewLauncherForTests({ spawnFn, openUrlFn });

      const starting = await preview.start("web", root);
      expect(starting.status).toBe("starting");
      child.emitStdout("VITE v5.0.0  ready in 80 ms\n  Local: http://localhost:5173/\n");
      expect(preview.getState("web").status).toBe("running");
      expect(String(openUrlFn.mock.calls[0]?.[0])).toMatch(/localhost:5173/);

      const pty = createEchoPty();
      const spawnSyncFn = vi.fn();
      const killGroupFn = vi.fn();
      const terminal = new InteractiveTerminalService({
        spawnFn: () => pty,
        resolveShell: () => ({
          command: "bash",
          interactiveArgs: [],
          kind: "bash",
          label: "bash",
        }),
        killDeps:
          process.platform === "win32"
            ? { platform: "win32", spawnSyncFn }
            : { platform: "linux", killGroupFn },
      });
      const termOut: string[] = [];
      const term = terminal.create({
        id: "smoke-term",
        cwd: root,
        title: "Terminal",
        onData: (chunk) => termOut.push(chunk),
      });
      expect(term.status).toBe("active");
      expect(terminal.write(term.id, "echo test\n").ok).toBe(true);
      expect(pty.writes.join("")).toContain("echo test");
      expect(termOut.join("")).toMatch(/test/);

      const git = new GitService();
      fs.appendFileSync(path.join(root, "README.md"), "smoke change\n", "utf8");
      const dirty = await git.status(root);
      expect(dirty.isClean).toBe(false);
      await git.stage(root, ["README.md"]);
      const committed = await git.commit(root, { message: "chore: m4 smoke" });
      expect(committed.hash).toMatch(/^[a-f0-9]+$/);
      const clean = await git.status(root);
      expect(clean.isClean).toBe(true);

      fs.writeFileSync(
        path.join(root, "src", "App.tsx"),
        "export const App: number = 'broken';\n",
        "utf8"
      );
      const absApp = path.join(root, "src", "App.tsx");
      const problems = new ProblemsService({
        runTool: async (kind) => {
          if (kind !== "typescript") return { stdout: "", stderr: "", code: 0 };
          return {
            stdout: `${absApp}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
            stderr: "",
            code: 1,
          };
        },
      });
      await problems.collect(root);
      const tsProblems = problems.getProblems("src/App.tsx");
      expect(tsProblems.some((p) => p.code === "TS2322" && p.severity === "error")).toBe(true);
      expect(problems.getSummary().errors).toBeGreaterThan(0);
      expect(
        parseTypeScriptOutput(`${absApp}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`, root)
          .length
      ).toBeGreaterThan(0);

      const tasks = new TasksService();
      const taskOut: string[] = [];
      tasks.on("output", (chunk: { data: string }) => taskOut.push(chunk.data));
      const listed = tasks.list(root);
      expect(listed.map((t) => t.name).sort()).toEqual(["dev", "hang", "ok"]);
      const okRun = await tasks.run(root, "ok");
      const okDone = await waitUntil(() => {
        const status = tasks.getRun(root, okRun.id)?.status;
        return status === "success" || status === "failed";
      }, 20_000);
      expect(okDone).toBe(true);
      expect(tasks.getRun(root, okRun.id)?.status).toBe("success");
      expect(taskOut.join("")).toMatch(/ok-smoke/);

      await tasks.run(root, "hang");
      const pidPath = path.join(root, "pid.txt");
      expect(await waitUntil(() => fs.existsSync(pidPath), 15_000)).toBe(true);
      const hangPid = Number(fs.readFileSync(pidPath, "utf8").trim());
      expect(isPidAlive(hangPid)).toBe(true);

      preview.shutdownAllSync();
      terminal.stopAllInteractiveTerminalsSync();
      tasks.shutdownAllSync();

      expect(preview.getState("web").status).toBe("stopped");
      expect(terminal.sessionCount()).toBe(0);
      expect(pty.killed).toBe(true);
      expect(await waitUntil(() => !isPidAlive(hangPid), 8_000)).toBe(true);
      expect(tasks.getRuns(root).every((run) => run.status === "stopped" || run.status === "success")).toBe(
        true
      );
    },
    60_000
  );
});
