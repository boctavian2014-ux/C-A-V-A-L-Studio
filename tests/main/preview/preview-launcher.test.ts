import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPreviewLauncherForTests,
  redactPreviewSecrets,
  type PreviewSpawn,
} from "../../../src/main/preview/preview-launcher";

type FakeChild = {
  pid: number;
  stdout: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  stderr: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  kill: (signal?: NodeJS.Signals) => boolean;
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  emitExit: (code: number | null, signal?: NodeJS.Signals | null) => void;
  emitError: (error: Error) => void;
};

function createFakeChild(pid = 4242): FakeChild {
  const stdoutListeners: Array<(chunk: Buffer | string) => void> = [];
  const stderrListeners: Array<(chunk: Buffer | string) => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];

  return {
    pid,
    stdout: {
      on: (_event, listener) => {
        stdoutListeners.push(listener);
      },
    },
    stderr: {
      on: (_event, listener) => {
        stderrListeners.push(listener);
      },
    },
    on(event, listener) {
      if (event === "error") errorListeners.push(listener as (error: Error) => void);
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
    emitStderr(chunk) {
      stderrListeners.forEach((fn) => fn(chunk));
    },
    emitExit(code, signal = null) {
      exitListeners.forEach((fn) => fn(code, signal));
    },
    emitError(error) {
      errorListeners.forEach((fn) => fn(error));
    },
  };
}

describe("preview-launcher", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function workspace(name: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `caval-preview-${name}-`));
    dirs.push(root);
    return root;
  }

  function writeViteProject(root: string): void {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        devDependencies: { vite: "5.0.0" },
        scripts: { dev: "vite" },
      }),
      "utf8"
    );
    fs.writeFileSync(path.join(root, "vite.config.ts"), "export default {}\n", "utf8");
  }

  function writeExpoProject(root: string): void {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        dependencies: { expo: "51.0.0" },
        scripts: { start: "expo start" },
      }),
      "utf8"
    );
    fs.writeFileSync(path.join(root, "app.json"), "{}", "utf8");
  }

  function createHarness(options?: { maxLogLines?: number }) {
    const child = createFakeChild();
    const spawnFn = vi.fn((_file, _args, opts) => {
      capturedSpawnOptions = opts;
      return child as unknown as ReturnType<PreviewSpawn>;
    }) as PreviewSpawn;
    let capturedSpawnOptions: unknown;
    const launcher = createPreviewLauncherForTests({
      spawnFn,
      maxLogLines: options?.maxLogLines,
    });
    return { launcher, spawnFn, child, getSpawnOptions: () => capturedSpawnOptions };
  }

  it("redactPreviewSecrets removes secret patterns", () => {
    const input =
      "sk-or-v1-abc123token openRouterApiKey=\"secret\" meshApiKey: 'x' piapiApiKey=val ghp_abcdefghijklmnopqrstuvwxyz Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig";
    const redacted = redactPreviewSecrets(input);
    expect(redacted).not.toContain("sk-or-v1-abc123token");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("Bearer eyJ");
    expect(redacted).toContain("sk-or-v1-[REDACTED]");
    expect(redacted).toContain("openRouterApiKey");
    expect(redacted).toContain("[REDACTED]");
  });

  it("returns not-configured when no preview command is available", async () => {
    const root = workspace("empty");
    const { launcher } = createHarness();
    const state = await launcher.start("web", root);
    expect(state.status).toBe("not-configured");
    expect(state.lastError).toMatch(/No preview command detected/i);
  });

  it("does not spawn duplicate processes when already running", async () => {
    const root = workspace("running");
    writeViteProject(root);
    const { launcher, spawnFn, child } = createHarness();
    const first = await launcher.start("web", root);
    child.emitStdout("ready on http://127.0.0.1:5173\n");
    const second = await launcher.start("web", root);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("starting");
    expect(second.status).toBe("running");
  });

  it("stops a process and removes it from the internal map", async () => {
    const root = workspace("stop");
    writeViteProject(root);
    const { launcher, spawnFn } = createHarness();
    await launcher.start("web", root);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const stopped = await launcher.stop("web");
    expect(stopped.status).toBe("stopped");
    expect(launcher.getState("web").status).toBe("stopped");
    await launcher.start("web", root);
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it("restarts by stopping then starting again", async () => {
    const root = workspace("restart");
    writeViteProject(root);
    const { launcher, spawnFn } = createHarness();
    await launcher.start("web", root);
    await launcher.restart("web", root);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(launcher.getState("web").status).toBe("starting");
  });

  it("shutdownAll stops every active preview process", async () => {
    const webRoot = workspace("shutdown-web");
    const mobileRoot = workspace("shutdown-mobile");
    writeViteProject(webRoot);
    writeExpoProject(mobileRoot);
    const { launcher, spawnFn } = createHarness();
    await launcher.start("web", webRoot);
    await launcher.start("mobile", mobileRoot);
    expect(spawnFn).toHaveBeenCalledTimes(2);
    await launcher.shutdownAll();
    expect(launcher.getState("web").status).toBe("stopped");
    expect(launcher.getState("mobile").status).toBe("stopped");
  });

  it("caps stored logs at maxLogLines", async () => {
    const root = workspace("logs");
    writeViteProject(root);
    const { launcher, child } = createHarness({ maxLogLines: 3 });
    await launcher.start("web", root);
    child.emitStdout("line-1\nline-2\nline-3\nline-4\n");
    const logs = launcher.getLogs("web");
    expect(logs).toHaveLength(3);
    expect(logs.map((entry) => entry.line)).toEqual(["line-2", "line-3", "line-4"]);
    expect(logs.every((entry) => !entry.line.includes("sk-or-v1"))).toBe(true);
  });

  it("spawns with shell disabled", async () => {
    const root = workspace("spawn-opts");
    writeViteProject(root);
    const { launcher, getSpawnOptions } = createHarness();
    await launcher.start("web", root);
    expect(getSpawnOptions()).toEqual(expect.objectContaining({ shell: false }));
  });
});
