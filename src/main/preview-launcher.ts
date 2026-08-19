import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";

import { loadCavalConfigFromWorkspaceFile, type CavalPreviewFileConfig } from "./preview-config-io";
import { looksLikeExpoProject, resolvePreviewCwd } from "./preview-paths";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { resolveSandboxedWorkspacePath } from "./path-security";
import { sanitizeEnvForTerminal } from "./subprocess-env";
import {
  CAVALLO_RENDERER_WEB_PREFERENCES_BASE,
  setWorkbenchNavigationExtraAllow,
} from "./renderer-security";
import type { CavalPreviewTargetConfig } from "../shared/preview-types";
import type {
  PreviewActionResult,
  PreviewStatus,
  PreviewStatusResult,
  PreviewTarget,
  PreviewTargetState,
} from "../shared/preview-types";
import {
  appendRedactedLog,
  assertAllowedPreviewOpenUrl,
  clampPreviewReadyTimeoutMs,
  extractValidatedExpoUrl,
  idlePreviewTargetState,
  isAllowedPreviewWindowUrl,
  isPreviewTargetConfigured,
  parsePreviewCommand,
  parsePreviewOpenMode,
  parsePreviewTarget,
  previewMissingReason,
  redactPreviewLogs,
  toPreviewProbeUrl,
  toPreviewSpawnInvocation,
} from "../shared/preview-security";

const LOG_TAIL_CHARS = 800;
const PREVIEW_CONFIG_STUB = `{
  "preview": {
    "web": {
      "enabled": true,
      "cwd": ".",
      "command": "npm run dev",
      "url": "http://localhost:5173",
      "openMode": "external"
    },
    "mobile": {
      "enabled": true,
      "cwd": "mobile-app",
      "command": "npx expo start",
      "url": "exp://127.0.0.1:8081"
    }
  }
}
`;

export interface PreviewChildProcess {
  pid?: number;
  killed?: boolean;
  stdout?: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
  stderr?: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface PreviewLauncherDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  spawn: (file: string, args: string[], options: SpawnOptions) => PreviewChildProcess;
  kill: (child: PreviewChildProcess) => void;
  probeUrl: (url: string) => Promise<boolean>;
  loadConfig: (workspaceRoot: string) => Promise<CavalPreviewFileConfig | undefined>;
  openExternal: (url: string) => Promise<void>;
  openWindow: (url: string, target: PreviewTarget, workspaceRoot: string) => void;
  closeWindow: (target: PreviewTarget, workspaceRoot: string) => void;
}

interface PreviewSession {
  target: PreviewTarget;
  workspaceRoot: string;
  status: PreviewStatus;
  owned: boolean;
  child?: PreviewChildProcess;
  pid?: number;
  startedAt?: number;
  url?: string;
  deepLink?: string;
  lastError?: string;
  logs: string;
  abort?: AbortController;
}

function sessionKey(workspaceRoot: string, target: PreviewTarget): string {
  return `${path.resolve(workspaceRoot)}::${target}`;
}

export async function probePreviewHttpUrl(url: string, timeoutMs = 1500): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const lib = parsed.protocol === "https:" ? https : http;
  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  const port = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
  const requestPath = `${parsed.pathname || "/"}${parsed.search}`;

  const once = (method: "HEAD" | "GET"): Promise<boolean> =>
    new Promise((resolve) => {
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname,
          port,
          path: requestPath,
          method,
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
      req.end();
    });

  if (await once("HEAD")) return true;
  return once("GET");
}

export function killPreviewChild(child: PreviewChildProcess): void {
  const pid = child.pid;
  if (typeof pid === "number" && Number.isInteger(pid) && pid > 1) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
      return;
    } catch {
      // fall through
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // already gone
  }
}

function toPublicState(session: PreviewSession | undefined, target: PreviewTarget, config?: CavalPreviewTargetConfig): PreviewTargetState {
  if (!session) {
    return idlePreviewTargetState(target, config);
  }
  const configured = isPreviewTargetConfigured(target, config);
  return {
    target,
    configured,
    enabled: configured,
    status: session.status,
    owned: session.owned,
    url: session.url,
    deepLink: session.deepLink,
    pid: session.pid,
    startedAt: session.startedAt,
    lastError: session.lastError ? redactPreviewLogs(session.lastError) : undefined,
    logTail: session.logs.slice(-LOG_TAIL_CHARS),
    missingReason: previewMissingReason(target, config),
  };
}

export class PreviewLauncher {
  private readonly sessions = new Map<string, PreviewSession>();
  private readonly inFlight = new Set<string>();
  private listener: ((snapshot: PreviewStatusResult) => void) | undefined;

  constructor(private readonly deps: PreviewLauncherDeps) {}

  onChange(listener: ((snapshot: PreviewStatusResult) => void) | undefined): void {
    this.listener = listener;
  }

  async snapshot(workspaceRoot: string): Promise<PreviewStatusResult> {
    const preview = await this.deps.loadConfig(workspaceRoot);
    return {
      ok: true,
      web: toPublicState(this.sessions.get(sessionKey(workspaceRoot, "web")), "web", preview?.web),
      mobile: toPublicState(this.sessions.get(sessionKey(workspaceRoot, "mobile")), "mobile", preview?.mobile),
    };
  }

  getLogs(workspaceRoot: string, target: PreviewTarget): string {
    const session = this.sessions.get(sessionKey(workspaceRoot, target));
    return session?.logs ?? "";
  }

  async start(workspaceRoot: string, target: PreviewTarget, opts?: { forceSpawn?: boolean }): Promise<PreviewStatusResult> {
    const key = sessionKey(workspaceRoot, target);
    const preview = await this.deps.loadConfig(workspaceRoot);
    const config = target === "web" ? preview?.web : preview?.mobile;
    if (!isPreviewTargetConfigured(target, config)) {
      const snap = await this.snapshot(workspaceRoot);
      return { ...snap, ok: false, error: previewMissingReason(target, config) };
    }

    const existing = this.sessions.get(key);
    if (!opts?.forceSpawn && (existing?.status === "starting" || this.inFlight.has(key))) {
      return this.snapshot(workspaceRoot);
    }
    if (!opts?.forceSpawn && existing?.status === "running") {
      await this.openReadyUrl(existing, config!);
      return this.snapshot(workspaceRoot);
    }

    this.inFlight.add(key);
    const session: PreviewSession = existing ?? {
      target,
      workspaceRoot,
      status: "starting",
      owned: false,
      logs: "",
    };
    session.status = "starting";
    session.lastError = undefined;
    session.workspaceRoot = workspaceRoot;
    session.target = target;
    this.sessions.set(key, session);
    await this.emit(workspaceRoot);

    try {
      await this.startConfigured(session, config!, opts);
      return this.snapshot(workspaceRoot);
    } catch (error) {
      session.status = "failed";
      session.lastError = error instanceof Error ? error.message : String(error);
      session.owned = false;
      session.child = undefined;
      session.pid = undefined;
      await this.emit(workspaceRoot);
      const snap = await this.snapshot(workspaceRoot);
      return { ...snap, ok: false, error: redactPreviewLogs(session.lastError) };
    } finally {
      this.inFlight.delete(key);
    }
  }

  async stop(workspaceRoot: string, target: PreviewTarget): Promise<PreviewStatusResult> {
    const key = sessionKey(workspaceRoot, target);
    const session = this.sessions.get(key);
    if (session) {
      session.abort?.abort();
      session.abort = undefined;
      if (session.child) this.deps.kill(session.child);
      session.child = undefined;
      session.pid = undefined;
      session.owned = false;
      session.status = "stopped";
      this.deps.closeWindow(target, workspaceRoot);
    }
    await this.emit(workspaceRoot);
    return this.snapshot(workspaceRoot);
  }

  async restart(workspaceRoot: string, target: PreviewTarget): Promise<PreviewStatusResult> {
    await this.stop(workspaceRoot, target);
    return this.start(workspaceRoot, target, { forceSpawn: true });
  }

  async stopAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    for (const key of keys) {
      const session = this.sessions.get(key);
      if (!session) continue;
      session.abort?.abort();
      if (session.child) this.deps.kill(session.child);
      session.child = undefined;
      session.pid = undefined;
      session.owned = false;
      session.status = "stopped";
    }
  }

  private async startConfigured(
    session: PreviewSession,
    config: CavalPreviewTargetConfig,
    opts?: { forceSpawn?: boolean }
  ): Promise<void> {
    const cwd = resolvePreviewCwd(session.workspaceRoot, config.cwd);
    if (session.target === "mobile" && !looksLikeExpoProject(cwd)) {
      session.logs = appendRedactedLog(
        session.logs,
        "No Expo/React Native markers found in cwd; starting the configured command.\n"
      );
    }

    const configuredUrl = config.url?.trim()
      ? assertAllowedPreviewOpenUrl(config.url, session.target)
      : undefined;
    session.url = configuredUrl;
    if (configuredUrl && (configuredUrl.startsWith("exp:") || configuredUrl.startsWith("exps:"))) {
      session.deepLink = configuredUrl;
    }

    const probeUrl = configuredUrl ? toPreviewProbeUrl(configuredUrl, session.target) : null;
    if (!opts?.forceSpawn && probeUrl && (await this.deps.probeUrl(probeUrl))) {
      session.status = "running";
      session.owned = false;
      session.startedAt = this.deps.now();
      await this.openReadyUrl(session, config);
      await this.emit(session.workspaceRoot);
      return;
    }

    const parsed = parsePreviewCommand(config.command);
    const invocation = toPreviewSpawnInvocation(parsed.bin, parsed.args);
    const child = this.deps.spawn(invocation.file, invocation.args, {
      cwd,
      env: sanitizeEnvForTerminal(),
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    session.child = child;
    session.pid = child.pid;
    session.owned = true;
    session.startedAt = this.deps.now();
    session.abort = new AbortController();

    child.stdout?.on("data", (chunk) => this.consumeOutput(session, chunk));
    child.stderr?.on("data", (chunk) => this.consumeOutput(session, chunk));
    child.on("error", (error) => {
      session.status = "failed";
      session.lastError = error.message;
      session.owned = false;
      session.child = undefined;
      void this.emit(session.workspaceRoot);
    });
    child.on("exit", (code) => {
      if (session.status === "starting" || session.status === "running") {
        if (code && code !== 0) {
          session.status = "failed";
          session.lastError = `Preview process exited with code ${code}`;
        } else if (session.status === "starting") {
          session.status = "failed";
          session.lastError = "Preview process exited before it became ready";
        } else {
          session.status = "stopped";
        }
      }
      session.owned = false;
      session.child = undefined;
      session.pid = undefined;
      void this.emit(session.workspaceRoot);
    });

    const timeoutMs = clampPreviewReadyTimeoutMs(config.readyTimeoutMs);
    const ready = probeUrl
      ? await this.waitForReady(session, probeUrl, timeoutMs)
      : await this.waitForProcessReady(session, timeoutMs);

    if (session.abort?.signal.aborted) {
      return;
    }
    if (!ready && session.status === "starting") {
      if (session.child) this.deps.kill(session.child);
      session.status = "failed";
      session.lastError = "Timed out waiting for the preview URL";
      session.owned = false;
      await this.emit(session.workspaceRoot);
      return;
    }
    if (session.status === "failed") {
      return;
    }

    session.status = "running";
    await this.openReadyUrl(session, config);
    await this.emit(session.workspaceRoot);
  }

  private consumeOutput(session: PreviewSession, chunk: Buffer | string): void {
    session.logs = appendRedactedLog(session.logs, String(chunk));
    const expo = extractValidatedExpoUrl(session.logs);
    if (expo) {
      session.deepLink = expo;
      session.url = session.url ?? expo;
    }
  }

  private async waitForReady(session: PreviewSession, probeUrl: string, timeoutMs: number): Promise<boolean> {
    const deadline = this.deps.now() + timeoutMs;
    while (this.deps.now() < deadline) {
      if (session.abort?.signal.aborted) return false;
      if (session.status === "failed" || session.status === "stopped") return false;
      if (await this.deps.probeUrl(probeUrl)) return true;
      await this.deps.sleep(400);
    }
    return false;
  }

  private async waitForProcessReady(session: PreviewSession, timeoutMs: number): Promise<boolean> {
    const deadline = this.deps.now() + timeoutMs;
    while (this.deps.now() < deadline) {
      if (session.abort?.signal.aborted) return false;
      if (session.status === "failed" || session.status === "stopped") return false;
      if (session.deepLink || (session.child && this.deps.now() - (session.startedAt ?? 0) > 2500)) {
        return true;
      }
      await this.deps.sleep(400);
    }
    return Boolean(session.child && session.status === "starting");
  }

  private async openReadyUrl(session: PreviewSession, config: CavalPreviewTargetConfig): Promise<void> {
    const candidate = session.deepLink ?? session.url;
    if (!candidate) return;
    const url = assertAllowedPreviewOpenUrl(candidate, session.target);
    session.url = url;
    if (url.startsWith("exp:") || url.startsWith("exps:")) {
      session.deepLink = url;
      await this.deps.openExternal(url);
      return;
    }
    const openMode = parsePreviewOpenMode(config.openMode);
    if (openMode === "window" && isAllowedPreviewWindowUrl(url)) {
      this.deps.openWindow(url, session.target, session.workspaceRoot);
      return;
    }
    await this.deps.openExternal(url);
  }

  private async emit(workspaceRoot: string): Promise<void> {
    const snap = await this.snapshot(workspaceRoot);
    this.listener?.(snap);
  }
}

const previewWebContents = new WeakSet<WebContents>();
const previewWindows = new Map<string, BrowserWindow>();

export function isPreviewLauncherContents(contents: WebContents): boolean {
  return previewWebContents.has(contents);
}

function windowKey(workspaceRoot: string, target: PreviewTarget): string {
  return sessionKey(workspaceRoot, target);
}

function openPreviewWindow(url: string, target: PreviewTarget, workspaceRoot: string): void {
  const allowed = assertAllowedPreviewOpenUrl(url, target);
  if (!isAllowedPreviewWindowUrl(allowed)) {
    throw new Error("Preview window URL must be local http(s)");
  }
  const key = windowKey(workspaceRoot, target);
  const existing = previewWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    void existing.loadURL(allowed);
    return;
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: target === "web" ? "CAVAL Web Preview" : "CAVAL Mobile Preview",
    autoHideMenuBar: true,
    backgroundColor: "#090B12",
    webPreferences: {
      ...CAVALLO_RENDERER_WEB_PREFERENCES_BASE,
    },
  });
  previewWebContents.add(win.webContents);
  previewWindows.set(key, win);
  win.on("closed", () => {
    previewWindows.delete(key);
  });
  void win.loadURL(allowed);
}

function closePreviewWindow(target: PreviewTarget, workspaceRoot: string): void {
  const win = previewWindows.get(windowKey(workspaceRoot, target));
  if (win && !win.isDestroyed()) {
    win.close();
  }
}

export function createDefaultPreviewDeps(): PreviewLauncherDeps {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    spawn: (file, args, options) => spawn(file, args, options) as ChildProcess,
    kill: killPreviewChild,
    probeUrl: (url) => probePreviewHttpUrl(url),
    loadConfig: loadCavalConfigFromWorkspaceFile,
    openExternal: async (url) => {
      await shell.openExternal(url);
    },
    openWindow: (url, target, workspaceRoot) => openPreviewWindow(url, target, workspaceRoot),
    closeWindow: closePreviewWindow,
  };
}

let launcher: PreviewLauncher | undefined;

export function getPreviewLauncher(): PreviewLauncher {
  if (!launcher) {
    launcher = new PreviewLauncher(createDefaultPreviewDeps());
  }
  return launcher;
}

export function setPreviewLauncherForTests(instance: PreviewLauncher | undefined): void {
  launcher = instance;
}

export async function stopAllPreviewProcesses(): Promise<void> {
  await getPreviewLauncher().stopAll();
}

async function openPreviewConfig(workspaceRoot: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const configPath = resolveSandboxedWorkspacePath(workspaceRoot, "caval.jsonc");
  if (!fs.existsSync(configPath)) {
    await fsPromises.writeFile(configPath, PREVIEW_CONFIG_STUB, "utf8");
  }
  return { ok: true, path: configPath };
}

function wrapPreviewError(error: unknown): PreviewActionResult {
  const message = redactPreviewLogs(error instanceof Error ? error.message : String(error));
  return {
    ok: false,
    error: message,
    web: idlePreviewTargetState("web", undefined),
    mobile: idlePreviewTargetState("mobile", undefined),
  };
}

export function registerPreviewHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  setWorkbenchNavigationExtraAllow(
    (contents, navigationUrl) =>
      isPreviewLauncherContents(contents) && isAllowedPreviewWindowUrl(navigationUrl)
  );

  const service = getPreviewLauncher();
  service.onChange((snapshot) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || isPreviewLauncherContents(win.webContents)) continue;
      win.webContents.send("caval:preview-status", snapshot);
    }
  });

  app.on("before-quit", () => {
    void stopAllPreviewProcesses();
  });

  const boundRoot = (event: IpcMainInvokeEvent): string => {
    const root = requireBoundWorkspaceRootFromEvent(
      event,
      getBoundWorkspaceRoot,
      "Open a folder before using Preview."
    );
    return root;
  };

  const handle = <T>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T>
  ) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedSender(event);
      return listener(event, ...args);
    });
  };

  handle("caval:preview-status", async (event) => {
    try {
      const root = boundRoot(event);
      const snap = await service.snapshot(root);
      return snap;
    } catch (error) {
      return wrapPreviewError(error);
    }
  });

  handle("caval:preview-start", async (event, rawTarget) => {
    try {
      const root = boundRoot(event);
      const target = parsePreviewTarget(rawTarget);
      return await service.start(root, target);
    } catch (error) {
      if (error instanceof Error && /Untrusted IPC sender/i.test(error.message)) throw error;
      if (error instanceof Error && error.message === "Invalid preview target") {
        return { ...wrapPreviewError(error), error: "Invalid preview target" };
      }
      return wrapPreviewError(error);
    }
  });

  handle("caval:preview-stop", async (event, rawTarget) => {
    try {
      const root = boundRoot(event);
      const target = parsePreviewTarget(rawTarget);
      return await service.stop(root, target);
    } catch (error) {
      if (error instanceof Error && /Untrusted IPC sender/i.test(error.message)) throw error;
      return wrapPreviewError(error);
    }
  });

  handle("caval:preview-restart", async (event, rawTarget) => {
    try {
      const root = boundRoot(event);
      const target = parsePreviewTarget(rawTarget);
      return await service.restart(root, target);
    } catch (error) {
      if (error instanceof Error && /Untrusted IPC sender/i.test(error.message)) throw error;
      return wrapPreviewError(error);
    }
  });

  handle("caval:preview-open-logs", async (event, rawTarget) => {
    try {
      const root = boundRoot(event);
      const target = parsePreviewTarget(rawTarget);
      const logs = service.getLogs(root, target);
      const snap = await service.snapshot(root);
      return {
        ...snap,
        logs,
        channel: target === "web" ? "Preview: Web" : "Preview: Mobile",
      } satisfies PreviewActionResult;
    } catch (error) {
      if (error instanceof Error && /Untrusted IPC sender/i.test(error.message)) throw error;
      return wrapPreviewError(error);
    }
  });

  handle("caval:preview-open-config", async (event) => {
    try {
      const root = boundRoot(event);
      const opened = await openPreviewConfig(root);
      const snap = await service.snapshot(root);
      return { ...snap, ...opened } satisfies PreviewActionResult;
    } catch (error) {
      if (error instanceof Error && /Untrusted IPC sender/i.test(error.message)) throw error;
      return wrapPreviewError(error);
    }
  });
}
