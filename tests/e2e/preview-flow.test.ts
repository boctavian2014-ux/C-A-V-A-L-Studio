import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPreviewLauncherForTests,
  type PreviewSpawn,
} from "../../src/main/preview/preview-launcher";

type FakeChild = {
  pid: number;
  stdout: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  stderr: { on: (event: string, listener: (chunk: Buffer | string) => void) => void };
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  once: (event: string, listener: (...args: unknown[]) => void) => void;
  kill: (signal?: NodeJS.Signals) => boolean;
  emitStdout: (chunk: string) => void;
  emitExit: (code: number | null) => void;
};

function createFakeChild(pid = 4242): FakeChild {
  const stdoutListeners: Array<(chunk: Buffer | string) => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
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
    emitExit(code) {
      exitListeners.forEach((fn) => fn(code, null));
    },
  };
}

function spawnInvocation(spawnFn: ReturnType<typeof vi.fn>): string {
  const call = spawnFn.mock.calls[0];
  if (!call) return "";
  const file = String(call[0] ?? "");
  const args = Array.isArray(call[1]) ? call[1].map(String) : [];
  return [file, ...args].join(" ");
}

/**
 * In-process end-to-end coverage for M2 preview.
 * Playwright is not in this repo; these tests drive the same launcher + config +
 * detection path the sidebar uses after Open Web / Open Mobile.
 */
describe("Preview flow", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function workspace(name: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `caval-e2e-${name}-`));
    dirs.push(root);
    return root;
  }

  function writeVite(root: string): void {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "caval-test-vite",
        devDependencies: { vite: "5.0.0" },
        scripts: { dev: "vite", start: "vite" },
      }),
      "utf8"
    );
    fs.writeFileSync(path.join(root, "vite.config.ts"), "export default {}\n", "utf8");
  }

  function writeExpo(root: string): void {
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "caval-test-expo",
        dependencies: { expo: "51.0.0" },
        scripts: { start: "expo start" },
      }),
      "utf8"
    );
    fs.writeFileSync(path.join(root, "app.json"), "{}", "utf8");
  }

  function writePreviewConfig(root: string): void {
    fs.writeFileSync(
      path.join(root, "caval.jsonc"),
      `{
  "preview": {
    "web": {
      "enabled": true,
      "cwd": ".",
      "command": "npm run preview",
      "url": "http://localhost:5173",
      "openMode": "external"
    },
    "mobile": {
      "enabled": true,
      "cwd": ".",
      "command": "npx expo start",
      "url": "exp://127.0.0.1:8081"
    }
  }
}
`,
      "utf8"
    );
  }

  function createHarness() {
    const child = createFakeChild();
    const openUrlFn = vi.fn(async () => undefined);
    const spawnFn = vi.fn(() => child as unknown as ReturnType<PreviewSpawn>);
    const launcher = createPreviewLauncherForTests({ spawnFn, openUrlFn });
    return { launcher, spawnFn, child, openUrlFn };
  }

  it("opens web preview for a Vite project via detection", async () => {
    const root = workspace("vite");
    writeVite(root);
    const { launcher, spawnFn, child, openUrlFn } = createHarness();

    const idle = await launcher.getStateForWorkspace("web", root);
    expect(idle.status).toBe("stopped");
    expect(idle.url).toContain("localhost:5173");

    const starting = await launcher.start("web", root);
    expect(starting.status).toBe("starting");
    expect(spawnInvocation(spawnFn)).toMatch(/npm/i);
    expect(spawnInvocation(spawnFn)).toMatch(/\bdev\b/);

    child.emitStdout("VITE v5.0.0  ready in 120 ms\n  Local: http://localhost:5173/\n");
    expect(launcher.getState("web").status).toBe("running");
    expect(openUrlFn).toHaveBeenCalled();
    expect(String(openUrlFn.mock.calls[0]?.[0])).toMatch(/localhost:5173/);
    expect(launcher.getLogs("web").some((line) => line.line.includes("VITE"))).toBe(true);

    const stopped = await launcher.stop("web");
    expect(stopped.status).toBe("stopped");
    await launcher.restart("web", root);
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  it("opens mobile preview for an Expo project and captures the exp URL", async () => {
    const root = workspace("expo");
    writeExpo(root);
    const { launcher, spawnFn, child, openUrlFn } = createHarness();

    const idle = await launcher.getStateForWorkspace("mobile", root);
    expect(idle.status).toBe("stopped");

    await launcher.start("mobile", root);
    expect(spawnInvocation(spawnFn)).toMatch(/start/i);

    child.emitStdout("Metro waiting on exp://127.0.0.1:8081\n");
    const running = launcher.getState("mobile");
    expect(running.status).toBe("running");
    expect(running.url).toBe("exp://127.0.0.1:8081");
    expect(openUrlFn).toHaveBeenCalledWith("exp://127.0.0.1:8081");
    expect(launcher.getLogs("mobile").some((line) => /Metro|exp:\/\//.test(line.line))).toBe(true);
  });

  it("uses caval.jsonc.preview instead of automatic detection", async () => {
    const root = workspace("jsonc");
    writeVite(root);
    writePreviewConfig(root);
    const { launcher, spawnFn, child, openUrlFn } = createHarness();

    const webIdle = await launcher.getStateForWorkspace("web", root);
    expect(webIdle.status).toBe("stopped");
    expect(webIdle.url).toMatch(/localhost:5173/);

    const mobileIdle = await launcher.getStateForWorkspace("mobile", root);
    expect(mobileIdle.status).toBe("stopped");
    expect(mobileIdle.url).toBe("exp://127.0.0.1:8081");

    await launcher.start("web", root);
    expect(spawnInvocation(spawnFn)).toMatch(/\bpreview\b/);
    expect(spawnInvocation(spawnFn)).not.toMatch(/\bdev\b/);

    child.emitStdout("ready\n");
    expect(String(openUrlFn.mock.calls[0]?.[0])).toMatch(/localhost:5173/);
  });

  it("shows not-configured for an empty workspace", async () => {
    const root = workspace("empty");
    const { launcher, spawnFn } = createHarness();
    const web = await launcher.getStateForWorkspace("web", root);
    const mobile = await launcher.getStateForWorkspace("mobile", root);
    expect(web.status).toBe("not-configured");
    expect(mobile.status).toBe("not-configured");
    const started = await launcher.start("web", root);
    expect(started.status).toBe("not-configured");
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
