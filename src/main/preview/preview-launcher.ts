import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";

import { EventEmitter } from "node:events";

import { existsSync, readFileSync } from "node:fs";

import { join } from "node:path";



import type { PreviewLogLine, PreviewState, PreviewTarget } from "../../shared/preview-contract";

import { idlePreviewState } from "../../shared/preview-contract";

import { extractDevServerUrlFromLog } from "../../shared/preview-dev-url";

import {

  type PreviewHealthCheckFn,

  waitForPreviewHealthCheck,

  defaultPreviewHealthCheck,

} from "../../shared/preview-health-check";

import { DEFAULT_READY_TIMEOUT_MS } from "../../shared/preview-health-check-config";

import {

  assertAllowedPreviewOpenUrl,

  clampPreviewReadyTimeoutMs,

  extractValidatedExpoUrl,

  isPreviewTargetConfigured,

  parsePreviewCommand,

  redactPreviewLogs,

  toPreviewSpawnInvocation,

} from "../../shared/preview-security";

import type { CavalPreviewTargetConfig } from "../../shared/preview-types";

import { loadCavalConfigFromWorkspaceFile } from "../preview-config-io";

import { resolvePreviewCwd } from "../preview-paths";

import { sanitizeEnvForTerminal } from "../subprocess-env";

import {

  detectPreviewWorkspace,

  describeMissingPreview,

  findStaticHtmlPreviewRoot,

  type DetectedProject,

} from "./project-detector";

import { startStaticHtmlServer } from "./static-html-server";



export { redactPreviewLogs as redactPreviewSecrets };



/** True when `npm run X` / `yarn X` etc. can resolve against package.json scripts. */

export function previewCommandLooksRunnable(cwd: string, command: string): boolean {

  const trimmed = command.trim();

  const npmRun = trimmed.match(/^(?:npm|pnpm|bun)\s+run\s+(\S+)/i);

  const yarnRun = trimmed.match(/^yarn(?:\s+run)?\s+(\S+)/i);

  const script = npmRun?.[1] ?? yarnRun?.[1];

  if (!script) {

    return true;

  }

  const pkgPath = join(cwd, "package.json");

  if (!existsSync(pkgPath)) return false;

  try {

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {

      scripts?: Record<string, string>;

    };

    return Boolean(pkg.scripts?.[script]?.trim());

  } catch {

    return false;

  }

}



const DEFAULT_MAX_LOG_LINES = 500;

const STOP_TIMEOUT_MS = 5_000;



export type PreviewSpawn = (

  file: string,

  args: string[],

  options: SpawnOptions

) => ChildProcess;



export interface PreviewLauncherOptions {

  spawnFn?: PreviewSpawn;

  maxLogLines?: number;

  openUrlFn?: (url: string) => void | Promise<void>;

  healthCheckFn?: PreviewHealthCheckFn;

  readyTimeoutMs?: number;

  /** Tests skip `npm install` so fake spawn handles never hang. */

  skipDependencyInstall?: boolean;

}



interface ProcessInfo {

  proc: ChildProcess;

  target: PreviewTarget;

  cwd: string;

  workspaceRoot: string;

  startedAt: number;

  logs: PreviewLogLine[];

  state: PreviewState;

  openedUrl: string | null;

  readyTimeoutMs: number;

  readyCheckGeneration: number;

  readyCheckActive: boolean;

  cancelled: boolean;

}



interface LaunchPlan {

  cwd: string;

  command: string;

  url: string | null;

  source: "config" | "detection";

  readyTimeoutMs: number;

}



function stoppedState(target: PreviewTarget): PreviewState {

  return {

    target,

    status: "stopped",

    url: null,

    pid: null,

    startedAt: null,

    lastError: null,

  };

}



function notConfiguredState(target: PreviewTarget, message: string): PreviewState {

  return {

    target,

    status: "not-configured",

    url: null,

    pid: null,

    startedAt: null,

    lastError: message,

  };

}



function childProcessForStaticServer(closeServer: () => void): ChildProcess {

  const child = new EventEmitter() as ChildProcess;

  Object.assign(child, {

    pid: 1,

    stdout: { on: () => child },

    stderr: { on: () => child },

    kill: () => {

      try {

        closeServer();

      } catch {

        /* already closed */

      }

      queueMicrotask(() => child.emit("exit", 0, null));

      return true;

    },

  });

  return child;

}



function resolveDetectedProject(

  target: PreviewTarget,

  workspaceRoot: string

): DetectedProject | null {

  const layout = detectPreviewWorkspace(workspaceRoot);

  return target === "web" ? layout.web : layout.mobile;

}



function resolveCommandFromDetection(

  target: PreviewTarget,

  project: DetectedProject | null

): string | null {

  if (!project?.suggestedCommand) return null;

  if (target === "web") {

    return project.kind === "vite" || project.kind === "next" || project.kind === "node"

      ? project.suggestedCommand

      : null;

  }

  return project.kind === "expo" ? project.suggestedCommand : null;

}



function resolveUrlFromConfig(

  target: PreviewTarget,

  config: CavalPreviewTargetConfig | undefined,

  fallback: string | null

): string | null {

  const raw = config?.url?.trim() ?? fallback;

  if (!raw) return null;

  try {

    return assertAllowedPreviewOpenUrl(raw, target);

  } catch {

    return fallback;

  }

}



function tailLogSummary(logs: PreviewLogLine[], maxLines = 5): string {

  return logs

    .slice(-maxLines)

    .map((entry) => entry.line)

    .join("\n");

}



export class PreviewLauncher extends EventEmitter {

  private readonly processes = new Map<PreviewTarget, ProcessInfo>();

  private readonly spawnFn: PreviewSpawn;

  private readonly maxLogLines: number;

  private readonly healthCheckFn: PreviewHealthCheckFn;

  private readonly defaultReadyTimeoutMs: number;

  private openUrlFn?: (url: string) => void | Promise<void>;

  private skipDependencyInstall: boolean;



  constructor(options: PreviewLauncherOptions = {}) {

    super();

    this.spawnFn = options.spawnFn ?? spawn;

    this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;

    this.healthCheckFn = options.healthCheckFn ?? defaultPreviewHealthCheck;

    this.defaultReadyTimeoutMs = clampPreviewReadyTimeoutMs(

      options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS

    );

    this.openUrlFn = options.openUrlFn;

    this.skipDependencyInstall = options.skipDependencyInstall === true;

  }



  setOpenUrlHandler(fn: ((url: string) => void | Promise<void>) | undefined): void {

    this.openUrlFn = fn;

  }



  getState(target: PreviewTarget): PreviewState {

    const info = this.processes.get(target);

    return info?.state ?? stoppedState(target);

  }



  async getStateForWorkspace(target: PreviewTarget, workspaceRoot: string): Promise<PreviewState> {

    const live = this.processes.get(target);

    if (live) return live.state;

    const plan = await this.resolveLaunchPlan(target, workspaceRoot);

    if (!plan) {

      return notConfiguredState(

        target,

        `No preview command detected for ${target} in ${workspaceRoot}`

      );

    }

    return {

      target,

      status: "stopped",

      url: plan.url,

      pid: null,

      startedAt: null,

      lastError: null,

    };

  }



  async openCurrentUrl(target: PreviewTarget): Promise<void> {

    const url = this.getState(target).url;

    if (!url) return;

    const allowed = assertAllowedPreviewOpenUrl(url, target);

    await this.openUrlFn?.(allowed);

  }



  getLogs(target: PreviewTarget): PreviewLogLine[] {

    return [...(this.processes.get(target)?.logs ?? [])];

  }



  private emitState(state: PreviewState): void {

    this.emit("state-changed", state);

  }



  private setState(info: ProcessInfo, status: PreviewState["status"], lastError?: string | null): void {

    info.state = {

      target: info.target,

      status,

      url: info.state.url,

      pid: info.proc.pid ?? null,

      startedAt: info.startedAt,

      lastError: lastError ?? null,

    };

    this.emitState(info.state);

  }



  private appendLog(info: ProcessInfo, stream: "stdout" | "stderr", data: string): void {

    const lines = data.split(/\r?\n/).filter((line) => line.trim().length > 0);

    for (const raw of lines) {

      const line: PreviewLogLine = {

        target: info.target,

        stream,

        line: redactPreviewLogs(raw),

        timestamp: Date.now(),

      };

      info.logs.push(line);

      if (info.logs.length > this.maxLogLines) {

        info.logs.shift();

      }

      this.emit("log", line);



      const expoUrl = extractValidatedExpoUrl(raw);

      if (expoUrl && expoUrl !== info.state.url) {

        info.state = { ...info.state, url: expoUrl };

        this.emitState(info.state);

        if (info.target === "mobile" && info.state.status === "starting") {

          this.markRunning(info);

        } else {

          this.maybeOpenUrl(info);

        }

      }



      const devUrl = extractDevServerUrlFromLog(raw, info.target);

      if (devUrl && devUrl !== info.state.url) {

        info.state = { ...info.state, url: devUrl };

        this.emitState(info.state);

        void this.scheduleReadyCheck(info);

      }

    }

  }



  private markRunning(info: ProcessInfo): void {

    if (info.state.status !== "starting" || info.cancelled) return;

    this.setState(info, "running");

    this.maybeOpenUrl(info);

  }



  private maybeOpenUrl(info: ProcessInfo): void {

    // Web preview is shown in the in-app iframe. Auto-opening Chrome to 127.0.0.1
    // while Vite still binds localhost/::1 produces ERR_CONNECTION_REFUSED.
    if (info.target === "web") return;

    const raw = info.state.url;

    if (!raw) return;

    let allowed: string;

    try {

      allowed = assertAllowedPreviewOpenUrl(raw, info.target);

    } catch {

      return;

    }

    if (info.openedUrl === allowed) return;

    info.openedUrl = allowed;

    void this.openUrlFn?.(allowed);

  }



  private async scheduleReadyCheck(info: ProcessInfo): Promise<void> {

    if (info.target !== "web" || info.state.status !== "starting" || info.readyCheckActive) {

      return;

    }

    const url = info.state.url;

    if (!url) return;



    info.readyCheckGeneration += 1;

    const generation = info.readyCheckGeneration;

    info.readyCheckActive = true;



    const ok = await waitForPreviewHealthCheck(url, {

      healthCheckFn: this.healthCheckFn,

      timeoutMs: info.readyTimeoutMs,

      isCancelled: () =>

        info.cancelled ||

        generation !== info.readyCheckGeneration ||

        info.state.status !== "starting" ||

        !this.processes.has(info.target),

    });



    info.readyCheckActive = false;

    if (

      info.cancelled ||

      generation !== info.readyCheckGeneration ||

      info.state.status !== "starting" ||

      !this.processes.has(info.target)

    ) {

      return;

    }



    if (ok) {

      this.markRunning(info);

      return;

    }



    this.setState(
      info,
      "failed",
      `Preview did not become ready within ${Math.round(info.readyTimeoutMs / 1000)}s on ${url}`
    );
    this.forceKill(info.proc);
  }



  private async resolveLaunchPlan(

    target: PreviewTarget,

    workspaceRoot: string

  ): Promise<LaunchPlan | null> {

    const previewConfig = await loadCavalConfigFromWorkspaceFile(workspaceRoot);

    const targetConfig = target === "web" ? previewConfig?.web : previewConfig?.mobile;

    const readyTimeoutMs = clampPreviewReadyTimeoutMs(

      targetConfig?.readyTimeoutMs ?? this.defaultReadyTimeoutMs

    );



    if (isPreviewTargetConfigured(target, targetConfig) && targetConfig?.command?.trim()) {

      try {

        const cwd = resolvePreviewCwd(workspaceRoot, targetConfig.cwd);

        const command = targetConfig.command.trim();

        return {

          cwd,

          command,

          url: resolveUrlFromConfig(target, targetConfig, null),

          source: "config",

          readyTimeoutMs,

        };

      } catch {

        // fall through when preview cwd is missing

      }

    }



    const detected = resolveDetectedProject(target, workspaceRoot);

    const command = resolveCommandFromDetection(target, detected);

    if (!command || !detected) return null;

    return {

      cwd: detected.cwd,

      command,

      url: resolveUrlFromConfig(target, targetConfig, detected.suggestedUrl),

      source: "detection",

      readyTimeoutMs,

    };

  }



  async start(target: PreviewTarget, workspaceRoot: string): Promise<PreviewState> {

    const existing = this.processes.get(target);

    if (existing && (existing.state.status === "running" || existing.state.status === "starting")) {
      return existing.state;
    }
    if (existing) {
      this.processes.delete(target);
    }



    let plan: LaunchPlan | null;

    try {

      plan = await this.resolveLaunchPlan(target, workspaceRoot);

    } catch (err) {

      const message = err instanceof Error ? err.message : String(err);

      return {

        ...notConfiguredState(target, message),

        status: "failed",

        lastError: message,

      };

    }

    if (!plan) {

      if (target === "web") {

        const htmlRoot = findStaticHtmlPreviewRoot(workspaceRoot);

        if (htmlRoot) {

          return this.startStaticHtmlPreview(target, workspaceRoot, htmlRoot);

        }

      }

      return notConfiguredState(

        target,

        describeMissingPreview(target, workspaceRoot)

      );

    }



    const parsed = parsePreviewCommand(plan.command);

    const deps = await this.ensureNodeModules(plan.cwd);

    if (!deps.ok) {

      return {

        target,

        status: "failed",

        url: null,

        pid: null,

        startedAt: null,

        lastError: deps.error,

      };

    }

    const invocation = toPreviewSpawnInvocation(parsed.bin, parsed.args);

    const proc = this.spawnFn(invocation.file, invocation.args, {

      cwd: plan.cwd,

      shell: false,

      env: { ...sanitizeEnvForTerminal(), FORCE_COLOR: "0", NO_COLOR: "1" },

      stdio: ["ignore", "pipe", "pipe"],

      windowsHide: true,

    });



    const startedAt = Date.now();

    const info: ProcessInfo = {

      proc,

      target,

      cwd: plan.cwd,

      workspaceRoot,

      startedAt,

      logs: [],

      openedUrl: null,

      readyTimeoutMs: plan.readyTimeoutMs,

      readyCheckGeneration: 0,

      readyCheckActive: false,

      cancelled: false,

      state: {

        target,

        status: "starting",

        url: plan.url,

        pid: proc.pid ?? null,

        startedAt,

        lastError: null,

      },

    };



    this.processes.set(target, info);

    this.emitState(info.state);



    proc.stdout?.on("data", (chunk: Buffer | string) => {

      this.appendLog(info, "stdout", String(chunk));

      if (info.target === "web" && info.state.url && info.state.status === "starting") {

        void this.scheduleReadyCheck(info);

      }

    });



    proc.stderr?.on("data", (chunk: Buffer | string) => {

      this.appendLog(info, "stderr", String(chunk));

      if (info.target === "web" && info.state.url && info.state.status === "starting") {

        void this.scheduleReadyCheck(info);

      }

    });



    proc.on("error", (err) => {

      info.cancelled = true;

      info.readyCheckGeneration += 1;

      this.setState(info, "failed", err.message);
    });

    proc.on("exit", (code, signal) => {

      info.cancelled = true;

      info.readyCheckGeneration += 1;

      if (!this.processes.has(target)) {
        return;
      }

      if (info.state.status === "starting") {

        const summary = tailLogSummary(info.logs);

        const error =

          code !== 0 && code !== null

            ? `Process exited with code ${code} (signal: ${signal ?? "none"}) before preview was ready${summary ? `\n${summary}` : ""}`

            : `Preview process exited before becoming ready${summary ? `\n${summary}` : ""}`;

        this.setState(info, "failed", error);
        return;
      }

      const failed = code !== 0 && code !== null;

      const status: PreviewState["status"] = failed ? "failed" : "stopped";

      const error = failed ? `Process exited with code ${code} (signal: ${signal ?? "none"})` : null;

      this.setState(info, status, error);

      this.processes.delete(target);

    });



    if (info.target === "web" && info.state.url) {

      void this.scheduleReadyCheck(info);

    }



    return info.state;

  }



  async stop(target: PreviewTarget): Promise<PreviewState> {

    const info = this.processes.get(target);

    if (!info) {

      return this.getState(target);

    }



    info.cancelled = true;

    info.readyCheckGeneration += 1;



    return new Promise((resolvePromise) => {

      const timeout = setTimeout(() => {

        this.forceKill(info.proc);

        this.setState(info, "stopped");

        this.processes.delete(target);

        resolvePromise(this.getState(target));

      }, STOP_TIMEOUT_MS);



      info.proc.once("exit", () => {

        clearTimeout(timeout);

        this.setState(info, "stopped");

        this.processes.delete(target);

        resolvePromise(this.getState(target));

      });



      this.forceKill(info.proc, "SIGTERM");

    });

  }



  async restart(target: PreviewTarget, workspaceRoot: string): Promise<PreviewState> {

    await this.stop(target);

    return this.start(target, workspaceRoot);

  }



  async shutdownAll(): Promise<void> {

    const targets = [...this.processes.keys()];

    await Promise.all(targets.map((target) => this.stop(target)));

  }



  shutdownAllSync(): void {

    const targets = [...this.processes.keys()];

    for (const target of targets) {

      const info = this.processes.get(target);

      if (!info) continue;

      info.cancelled = true;

      info.readyCheckGeneration += 1;

      try {

        this.forceKill(info.proc, "SIGKILL");

      } catch {

        // best-effort

      }

      this.setState(info, "stopped");

      this.processes.delete(target);

    }

  }



  private forceKill(proc: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {

    const pid = proc.pid;

    if (

      this.spawnFn === spawn &&

      typeof pid === "number" &&

      pid > 1 &&

      process.platform === "win32"

    ) {

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

  }



  private async startStaticHtmlPreview(

    target: PreviewTarget,

    workspaceRoot: string,

    htmlRoot: string

  ): Promise<PreviewState> {

    const { server, url } = await startStaticHtmlServer(htmlRoot);

    const proc = childProcessForStaticServer(() => {

      server.close();

    });

    const startedAt = Date.now();

    const info: ProcessInfo = {

      proc,

      target,

      cwd: htmlRoot,

      workspaceRoot,

      startedAt,

      logs: [

        {

          target,

          stream: "stdout",

          line: `Serving ${htmlRoot} at ${url}`,

          timestamp: startedAt,

        },

      ],

      openedUrl: null,

      readyTimeoutMs: 5_000,

      readyCheckGeneration: 0,

      readyCheckActive: false,

      cancelled: false,

      state: {

        target,

        status: "running",

        url,

        pid: proc.pid ?? null,

        startedAt,

        lastError: null,

      },

    };

    this.processes.set(target, info);

    this.emitState(info.state);

    return info.state;

  }



  private async ensureNodeModules(

    cwd: string

  ): Promise<{ ok: true } | { ok: false; error: string }> {

    if (this.skipDependencyInstall) return { ok: true };

    if (existsSync(join(cwd, "node_modules")) || !existsSync(join(cwd, "package.json"))) {

      return { ok: true };

    }

    const parsed = parsePreviewCommand("npm install");

    const invocation = toPreviewSpawnInvocation(parsed.bin, parsed.args);

    const proc = this.spawnFn(invocation.file, invocation.args, {

      cwd,

      shell: false,

      env: { ...sanitizeEnvForTerminal(), FORCE_COLOR: "0", NO_COLOR: "1" },

      stdio: ["ignore", "pipe", "pipe"],

      windowsHide: true,

    });

    const errorChunks: string[] = [];

    proc.stderr?.on("data", (chunk: Buffer | string) => {

      errorChunks.push(String(chunk));

    });

    const result = await new Promise<{ ok: boolean; code: number | null }>((resolvePromise) => {

      const timer = setTimeout(() => {

        try {

          proc.kill();

        } catch {

          /* ignore */

        }

        resolvePromise({ ok: false, code: null });

      }, 120_000);

      proc.on("exit", (code) => {

        clearTimeout(timer);

        resolvePromise({ ok: code === 0, code });

      });

      proc.on("error", () => {

        clearTimeout(timer);

        resolvePromise({ ok: false, code: null });

      });

    });

    if (!result.ok) {

      const tail = errorChunks.join("").trim().slice(-800);

      return {

        ok: false,

        error: `npm install a eșuat${result.code != null ? ` (exit ${result.code})` : ""}${tail ? `:\n${tail}` : ". Instalează Node.js și reîncearcă."}`,

      };

    }

    return { ok: true };

  }

}



export const previewLauncher = new PreviewLauncher();



export function createPreviewLauncherForTests(options: PreviewLauncherOptions = {}): PreviewLauncher {

  return new PreviewLauncher({

    healthCheckFn: async () => true,

    readyTimeoutMs: 500,

    skipDependencyInstall: true,

    ...options,

  });

}



export function idlePreviewLauncherState(target: PreviewTarget): PreviewState {

  return idlePreviewState(target);

}


