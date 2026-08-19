import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";

import type { PreviewLogLine, PreviewState, PreviewTarget } from "../../shared/preview-contract";
import { idlePreviewState } from "../../shared/preview-contract";
import {
  assertAllowedPreviewOpenUrl,
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
  type DetectedProject,
} from "./project-detector";

export { redactPreviewLogs as redactPreviewSecrets };

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
}

interface ProcessInfo {
  proc: ChildProcess;
  target: PreviewTarget;
  cwd: string;
  workspaceRoot: string;
  startedAt: number;
  logs: PreviewLogLine[];
  state: PreviewState;
}

interface LaunchPlan {
  cwd: string;
  command: string;
  url: string | null;
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

export class PreviewLauncher extends EventEmitter {
  private readonly processes = new Map<PreviewTarget, ProcessInfo>();
  private readonly spawnFn: PreviewSpawn;
  private readonly maxLogLines: number;

  constructor(options: PreviewLauncherOptions = {}) {
    super();
    this.spawnFn = options.spawnFn ?? spawn;
    this.maxLogLines = options.maxLogLines ?? DEFAULT_MAX_LOG_LINES;
  }

  getState(target: PreviewTarget): PreviewState {
    const info = this.processes.get(target);
    return info?.state ?? stoppedState(target);
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
      if (expoUrl) {
        info.state = { ...info.state, url: expoUrl };
      }
    }
  }

  private async resolveLaunchPlan(
    target: PreviewTarget,
    workspaceRoot: string
  ): Promise<LaunchPlan | null> {
    const previewConfig = await loadCavalConfigFromWorkspaceFile(workspaceRoot);
    const targetConfig = target === "web" ? previewConfig?.web : previewConfig?.mobile;

    if (isPreviewTargetConfigured(target, targetConfig) && targetConfig?.command?.trim()) {
      return {
        cwd: resolvePreviewCwd(workspaceRoot, targetConfig.cwd),
        command: targetConfig.command.trim(),
        url: resolveUrlFromConfig(target, targetConfig, null),
      };
    }

    const detected = resolveDetectedProject(target, workspaceRoot);
    const command = resolveCommandFromDetection(target, detected);
    if (!command || !detected) return null;

    return {
      cwd: detected.cwd,
      command,
      url: resolveUrlFromConfig(target, targetConfig, detected.suggestedUrl),
    };
  }

  async start(target: PreviewTarget, workspaceRoot: string): Promise<PreviewState> {
    const existing = this.processes.get(target);
    if (existing && (existing.state.status === "running" || existing.state.status === "starting")) {
      return existing.state;
    }

    const plan = await this.resolveLaunchPlan(target, workspaceRoot);
    if (!plan) {
      return notConfiguredState(
        target,
        `No preview command detected for ${target} in ${workspaceRoot}`
      );
    }

    const parsed = parsePreviewCommand(plan.command);
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
      if (info.state.status === "starting") {
        this.setState(info, "running");
      }
    });

    proc.stderr?.on("data", (chunk: Buffer | string) => {
      this.appendLog(info, "stderr", String(chunk));
      if (info.state.status === "starting") {
        this.setState(info, "running");
      }
    });

    proc.on("error", (err) => {
      this.setState(info, "failed", err.message);
      this.processes.delete(target);
    });

    proc.on("exit", (code, signal) => {
      const failed = code !== 0 && code !== null;
      const status: PreviewState["status"] = failed ? "failed" : "stopped";
      const error = failed ? `Process exited with code ${code} (signal: ${signal ?? "none"})` : null;
      this.setState(info, status, error);
      this.processes.delete(target);
    });

    return info.state;
  }

  async stop(target: PreviewTarget): Promise<PreviewState> {
    const info = this.processes.get(target);
    if (!info) {
      return this.getState(target);
    }

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

  private forceKill(proc: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
    const pid = proc.pid;
    try {
      proc.kill(signal);
    } catch {
      // already gone
    }
    if (typeof pid !== "number" || pid <= 1 || process.platform !== "win32") {
      return;
    }
    spawn(
      "taskkill",
      ["/pid", String(pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])],
      {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      }
    );
  }
}

export const previewLauncher = new PreviewLauncher();

export function createPreviewLauncherForTests(options: PreviewLauncherOptions = {}): PreviewLauncher {
  return new PreviewLauncher(options);
}

export function idlePreviewLauncherState(target: PreviewTarget): PreviewState {
  return idlePreviewState(target);
}
