import { app, BrowserWindow } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  clearOllamaReachableCache,
  fetchInstalledOllamaModels,
  isOllamaReachable,
} from "../../ai/models/ollama-client";
import {
  getOllamaHost,
  getOllamaLoopbackUrl,
  localAiStatusFingerprint,
  OLLAMA_START_DELAYS_MS,
  sanitizeLocalAiReason,
  type LocalAiPhase,
  type LocalAiStatus,
  type OllamaInstallRequest,
  type OllamaInstallResult,
  type OllamaModelPullProgress,
  type OllamaModelPullRequest,
  type OllamaModelPullResult,
  isConfirmedTrue,
} from "../shared/local-ai-contract";

export type {
  LocalAiStatus,
  LocalAiPhase,
  OllamaInstallRequest,
  OllamaInstallResult,
  OllamaModelPullProgress,
  OllamaModelPullRequest,
  OllamaModelPullResult,
} from "../shared/local-ai-contract";

export const LOCAL_AI_STATUS_CHANGED_CHANNEL = "caval:local-ai-status-changed";
export const LOCAL_AI_PULL_PROGRESS_CHANNEL = "caval:local-ai-pull-progress";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
const LOCAL_AI_MANAGED_SETTING = "localAi.manageRuntime";
const SETTINGS_FILE = "caval-app-settings.json";

export interface EnsureLocalAiOptions {
  installRuntime?: boolean;
  /** @deprecated 7f.3 — pull is a separate confirmed action; ignored when true with install. */
  pullModel?: boolean;
  modelName?: string;
}

export interface EnsureLocalAiResult {
  ok: boolean;
  status?: LocalAiStatus;
  changed?: boolean;
  summary?: string;
  error?: string;
}

let setupInFlight: Promise<EnsureLocalAiResult> | null = null;
let installInFlight = false;
/** Child we spawned with `ollama serve` — kill only this on quit. */
let managedOllamaChild: ChildProcess | null = null;
let weStartedOllama = false;
let bootPhase: LocalAiPhase = "unavailable";
let lastOllamaError: string | undefined;
let lastEmittedFingerprint: string | null = null;
/** Internal only — never sent to renderer. */
let lastRuntimePath: string | undefined;
/** Active `ollama pull` child — kill on cancel. */
let activePullChild: ChildProcess | null = null;
let activePullModelId: string | null = null;

function settingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function readLocalSettings(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeLocalSettings(next: Record<string, string>): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
}

function managedByCavalFlag(): boolean {
  return readLocalSettings()[LOCAL_AI_MANAGED_SETTING] === "true";
}

function setManagedByCaval(enabled: boolean): void {
  const next = { ...readLocalSettings(), [LOCAL_AI_MANAGED_SETTING]: enabled ? "true" : "false" };
  writeLocalSettings(next);
}

function policyText(): string {
  return [
    "Local AI gratuit: redistribuim doar runtime-ul, nu și weight-urile modelului.",
    "Modelele se descarcă la cerere după consimțământ explicit.",
    "Dacă vom distribui pe viitor weight-uri Llama, vor fi necesare Built with Llama + Notice + licența modelului.",
  ].join(" ");
}

function whichSync(bin: string): string | null {
  try {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
      encoding: "utf8",
      windowsHide: true,
      shell: false,
    });
    if (result.status !== 0) return null;
    const candidate = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return candidate || null;
  } catch {
    return null;
  }
}

function windowsOllamaCandidates(): string[] {
  const local = process.env.LOCALAPPDATA ?? "";
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return [
    path.join(local, "Programs", "Ollama", "ollama.exe"),
    path.join(local, "Programs", "Ollama", "ollama app.exe"),
    path.join(programFiles, "Ollama", "ollama.exe"),
    path.join(programFilesX86, "Ollama", "ollama.exe"),
  ];
}

/** Exported for tests. */
export function detectOllamaBinary(): string | null {
  if (detectBinaryOverrideForTests !== undefined) {
    return detectBinaryOverrideForTests();
  }
  if (process.platform === "win32") {
    for (const candidate of windowsOllamaCandidates()) {
      if (candidate && fs.existsSync(candidate)) return candidate;
    }
    return whichSync("ollama.exe") ?? whichSync("ollama");
  }
  return whichSync("ollama");
}

let detectBinaryOverrideForTests: (() => string | null) | undefined;

export function __setDetectOllamaBinaryForTests(fn: (() => string | null) | undefined): void {
  detectBinaryOverrideForTests = fn;
}

function commandForInstall(): { file: string; args: string[] } | null {
  if (process.platform === "win32") {
    return {
      file: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://ollama.com/install.ps1 | iex",
      ],
    };
  }
  if (process.platform === "darwin") {
    return {
      file: "/bin/bash",
      args: ["-lc", "curl -fsSL https://ollama.com/install.sh | sh"],
    };
  }
  if (process.platform === "linux") {
    return {
      file: "/bin/bash",
      args: ["-lc", "curl -fsSL https://ollama.com/install.sh | sh"],
    };
  }
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runProcess(
  file: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      env: opts?.env,
      detached: false,
      windowsHide: true,
      shell: false,
      stdio: "pipe",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${path.basename(file)} exited with code ${code}`));
      }
    });
  });
}

function resolvePhase(input: {
  installed: boolean;
  reachable: boolean;
  defaultModelReady: boolean;
  bootPhase: LocalAiPhase;
  inProgress: boolean;
}): LocalAiPhase {
  if (!input.installed) return "not-installed";
  if (input.bootPhase === "starting" || input.inProgress) return "starting";
  if (input.reachable && input.defaultModelReady) return "ready";
  if (input.reachable && !input.defaultModelReady) return "model-missing";
  if (input.bootPhase === "not-installed") return "not-installed";
  return "unavailable";
}

export function buildLocalAiStatusSnapshot(partial?: {
  installed?: boolean;
  reachable?: boolean;
  models?: string[];
  runtimePath?: string | null;
}): LocalAiStatus {
  const runtimePath =
    partial?.runtimePath !== undefined
      ? partial.runtimePath ?? undefined
      : lastRuntimePath ?? detectOllamaBinary() ?? undefined;
  if (runtimePath) lastRuntimePath = runtimePath;
  const installed =
    typeof partial?.installed === "boolean" ? partial.installed : Boolean(runtimePath);
  const reachable = typeof partial?.reachable === "boolean" ? partial.reachable : false;
  const models = partial?.models ?? [];
  const defaultModelReady = models.some(
    (name) => name === DEFAULT_OLLAMA_MODEL || name.startsWith("qwen2.5-coder:")
  );
  const inProgress =
    Boolean(setupInFlight) ||
    installInFlight ||
    Boolean(activePullChild) ||
    bootPhase === "starting";
  const phase = resolvePhase({
    installed,
    reachable,
    defaultModelReady,
    bootPhase,
    inProgress,
  });
  const reason = sanitizeLocalAiReason(lastOllamaError);
  const endpoint = getOllamaLoopbackUrl();
  const managed = weStartedOllama || managedByCavalFlag();

  return {
    phase,
    installed,
    reachable,
    managedByCaval: managed,
    defaultModel: DEFAULT_OLLAMA_MODEL,
    defaultModelReady,
    endpoint,
    updatedAt: Date.now(),
    ...(reason ? { reason } : {}),
    supported: ["win32", "darwin", "linux"].includes(process.platform),
    platform: process.platform,
    running: reachable,
    configuredUrl: endpoint,
    models,
    inProgress,
    ...(reason ? { lastError: reason } : {}),
    policy: policyText(),
  };
}

/** Push live status to all live windows when material fields change. */
export function emitLocalAiStatusChanged(status: LocalAiStatus): void {
  const fp = localAiStatusFingerprint(status);
  if (fp === lastEmittedFingerprint) return;
  lastEmittedFingerprint = fp;
  const windows =
    typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
  for (const win of windows) {
    if (typeof win.isDestroyed === "function" && win.isDestroyed()) continue;
    try {
      win.webContents.send(LOCAL_AI_STATUS_CHANGED_CHANNEL, status);
    } catch {
      // window may be closing
    }
  }
}

async function refreshAndEmit(forceReachable?: boolean): Promise<LocalAiStatus> {
  const runtimePath = detectOllamaBinary() ?? undefined;
  lastRuntimePath = runtimePath;
  const installed = Boolean(runtimePath);
  if (!installed) {
    bootPhase = "not-installed";
  }
  const reachable = await isOllamaReachable({
    force: forceReachable ?? bootPhase === "starting",
  });
  const models = reachable ? await fetchInstalledOllamaModels() : [];
  if (reachable) {
    bootPhase = models.some(
      (name) => name === DEFAULT_OLLAMA_MODEL || name.startsWith("qwen2.5-coder:")
    )
      ? "ready"
      : "model-missing";
  }
  const status = buildLocalAiStatusSnapshot({
    installed,
    reachable,
    models,
    runtimePath,
  });
  emitLocalAiStatusChanged(status);
  return status;
}

/**
 * Spawn `ollama serve` without waiting for process exit (serve is long-running).
 * Tracks the child so quit can stop only processes we started.
 */
export function spawnOllamaServe(runtimePath: string): ChildProcess {
  const env = {
    ...process.env,
    OLLAMA_HOST: getOllamaHost(),
  };
  const child = spawn(runtimePath, ["serve"], {
    env,
    detached: true,
    windowsHide: true,
    shell: false,
    stdio: "ignore",
  });
  managedOllamaChild = child;
  weStartedOllama = true;
  child.on("error", (err) => {
    console.warn("[ollama] failed:", err.message);
    lastOllamaError = "Ollama failed to start";
    if (managedOllamaChild === child) {
      managedOllamaChild = null;
      weStartedOllama = false;
      bootPhase = "unavailable";
      void refreshAndEmit(true);
    }
  });
  child.on("exit", (code, signal) => {
    if (managedOllamaChild === child) {
      managedOllamaChild = null;
      weStartedOllama = false;
      if (code && code !== 0) {
        const msg = `ollama serve exited (code=${code}${signal ? ` signal=${signal}` : ""})`;
        console.warn("[ollama] failed:", msg);
        lastOllamaError = "Ollama failed to start";
        bootPhase = "unavailable";
        void refreshAndEmit(true);
      }
    }
  });
  child.unref();
  return child;
}

async function waitForOllamaReadyWithBackoff(): Promise<boolean> {
  clearOllamaReachableCache();
  for (const delay of OLLAMA_START_DELAYS_MS) {
    await wait(delay);
    if (await isOllamaReachable({ force: true })) return true;
  }
  return false;
}

async function startOllamaService(runtimePath: string): Promise<void> {
  clearOllamaReachableCache();
  if (await isOllamaReachable({ force: true })) {
    lastOllamaError = undefined;
    weStartedOllama = false;
    managedOllamaChild = null;
    console.info("[ollama] ready (already running)");
    await refreshAndEmit(true);
    return;
  }

  bootPhase = "starting";
  lastRuntimePath = runtimePath;
  emitLocalAiStatusChanged(
    buildLocalAiStatusSnapshot({
      installed: true,
      reachable: false,
      models: [],
      runtimePath,
    })
  );
  console.info("[ollama] starting:", runtimePath);
  spawnOllamaServe(runtimePath);

  const ready = await waitForOllamaReadyWithBackoff();
  if (ready) {
    lastOllamaError = undefined;
    console.info("[ollama] ready");
    await refreshAndEmit(true);
    return;
  }

  const child = managedOllamaChild;
  if (child && !child.killed) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  managedOllamaChild = null;
  weStartedOllama = false;
  bootPhase = "unavailable";
  lastOllamaError = "Ollama did not respond in time";
  console.warn("[ollama] failed:", lastOllamaError);
  await refreshAndEmit(true);
  throw new Error(lastOllamaError);
}

/**
 * Stop Ollama only if Caval spawned it. Pre-existing instances are left alone.
 */
export function stopManagedOllamaIfStarted(): void {
  if (!weStartedOllama || !managedOllamaChild) {
    console.info("[ollama] quit: leaving pre-existing instance alone");
    return;
  }
  const child = managedOllamaChild;
  console.info("[ollama] quit: stopping process we started (pid=%s)", child.pid ?? "?");
  try {
    child.kill();
  } catch (error) {
    console.warn(
      "[ollama] quit: kill failed:",
      error instanceof Error ? error.message : error
    );
  }
  managedOllamaChild = null;
  weStartedOllama = false;
  bootPhase = "unavailable";
  try {
    const windows =
      typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
    if (windows.some((w) => !(typeof w.isDestroyed === "function" && w.isDestroyed()))) {
      emitLocalAiStatusChanged(
        buildLocalAiStatusSnapshot({
          installed: Boolean(detectOllamaBinary()),
          reachable: false,
          models: [],
        })
      );
    }
  } catch {
    /* quitting */
  }
}

/** Test helpers — reset process tracking between unit tests. */
export function __resetOllamaProcessTrackingForTests(): void {
  managedOllamaChild = null;
  weStartedOllama = false;
  bootPhase = "unavailable";
  lastOllamaError = undefined;
  setupInFlight = null;
  installInFlight = false;
  detectBinaryOverrideForTests = undefined;
  lastEmittedFingerprint = null;
  lastRuntimePath = undefined;
  if (activePullChild && !activePullChild.killed) {
    try {
      activePullChild.kill();
    } catch {
      /* ignore */
    }
  }
  activePullChild = null;
  activePullModelId = null;
}

export function __getOllamaProcessTrackingForTests(): {
  weStartedOllama: boolean;
  hasChild: boolean;
} {
  return { weStartedOllama, hasChild: Boolean(managedOllamaChild) };
}

export function __getLastEmittedFingerprintForTests(): string | null {
  return lastEmittedFingerprint;
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  return refreshAndEmit(bootPhase === "starting");
}

async function installOllamaRuntime(): Promise<string> {
  const install = commandForInstall();
  if (!install) {
    throw new Error("Platformă local AI neacceptată.");
  }
  await runProcess(install.file, install.args, { env: process.env });
  for (let i = 0; i < 20; i++) {
    await wait(1_500);
    const detected = detectOllamaBinary();
    if (detected) return detected;
  }
  throw new Error("Installer completed but Ollama was not detected");
}

/**
 * Parse Ollama CLI pull progress lines, e.g.:
 * "pulling 4f2c... 45% ▕████    ▏ 2.1 GB/4.7 GB"
 */
export function parseOllamaPullProgress(
  line: string
): Pick<OllamaModelPullProgress, "status" | "percent" | "completedBytes" | "totalBytes"> | null {
  const verifying = /verif/i.test(line);
  const match = line.match(/(\d+)%.*?([\d.]+)\s*([KMGT]?B)\s*\/\s*([\d.]+)\s*([KMGT]?B)/i);
  if (!match) {
    if (verifying) {
      return {
        status: "verifying",
        percent: 100,
        completedBytes: 0,
        totalBytes: 0,
      };
    }
    return null;
  }
  const unitToBytes = (n: number, unit: string): number => {
    const u = unit.toUpperCase();
    if (u === "GB" || u === "GIB") return n * 1_000_000_000;
    if (u === "MB" || u === "MIB") return n * 1_000_000;
    if (u === "KB" || u === "KIB") return n * 1_000;
    return n;
  };
  return {
    status: verifying ? "verifying" : "downloading",
    percent: Number(match[1]),
    completedBytes: unitToBytes(Number(match[2]), match[3] ?? "B"),
    totalBytes: unitToBytes(Number(match[4]), match[5] ?? "B"),
  };
}

/**
 * Install Ollama runtime only — never pulls a model (7f.3).
 * Requires `confirmed: true` at the call site / IPC gate.
 */
export async function installOllamaRuntimeOnly(
  req: OllamaInstallRequest
): Promise<OllamaInstallResult> {
  if (!isConfirmedTrue(req?.confirmed)) {
    return { success: false, error: "Install requires explicit confirmation" };
  }
  if (installInFlight) {
    return { success: false, error: "Installation already in progress" };
  }
  installInFlight = true;
  lastOllamaError = undefined;
  bootPhase = "starting";
  emitLocalAiStatusChanged(
    buildLocalAiStatusSnapshot({
      installed: Boolean(detectOllamaBinary()),
      reachable: false,
      models: [],
    })
  );

  try {
    let runtimePath = detectOllamaBinary();
    if (!runtimePath) {
      runtimePath = await installOllamaRuntime();
    }
    lastRuntimePath = runtimePath;
    await startOllamaService(runtimePath);
    setManagedByCaval(true);
    installInFlight = false;
    const status = await refreshAndEmit(true);
    // No auto-pull — leave model-missing if weights absent.
    return { success: true, status };
  } catch (error) {
    const sanitized =
      sanitizeLocalAiReason(error instanceof Error ? error.message : String(error)) ??
      "Installation failed";
    lastOllamaError = sanitized;
    bootPhase = "not-installed";
    installInFlight = false;
    const status = await refreshAndEmit(true);
    return { success: false, error: sanitized, status };
  } finally {
    installInFlight = false;
  }
}

/**
 * Pull a model with progress callbacks and AbortSignal cancel (kills the child).
 */
export async function pullModelWithProgress(
  req: OllamaModelPullRequest,
  onProgress: (p: OllamaModelPullProgress) => void,
  abortSignal: AbortSignal
): Promise<OllamaModelPullResult> {
  if (!isConfirmedTrue(req?.confirmed)) {
    return { success: false, error: "Model download requires explicit confirmation" };
  }
  const modelId = req.modelId?.trim();
  if (!modelId) {
    return { success: false, error: "Model id is required" };
  }
  if (activePullChild) {
    return { success: false, error: "A model download is already in progress" };
  }

  const runtimePath = detectOllamaBinary();
  if (!runtimePath) {
    bootPhase = "not-installed";
    lastOllamaError = "Ollama was not found";
    const status = await refreshAndEmit(true);
    return { success: false, error: "Ollama was not found", status };
  }

  try {
    if (!(await isOllamaReachable({ force: true }))) {
      await startOllamaService(runtimePath);
    }
  } catch (error) {
    const sanitized =
      sanitizeLocalAiReason(error instanceof Error ? error.message : String(error)) ??
      "Ollama failed to start";
    return {
      success: false,
      error: sanitized,
      status: await getLocalAiStatus().catch(() => undefined),
    };
  }

  return new Promise<OllamaModelPullResult>((resolve) => {
    let settled = false;
    let cancelled = false;
    const finish = async (result: OllamaModelPullResult) => {
      if (settled) return;
      settled = true;
      if (activePullChild) {
        activePullChild = null;
        activePullModelId = null;
      }
      abortSignal.removeEventListener("abort", onAbort);
      const status = await refreshAndEmit(true).catch(() => undefined);
      resolve({ ...result, status });
    };

    const child = spawn(runtimePath, ["pull", modelId], {
      env: {
        ...process.env,
        OLLAMA_HOST: getOllamaHost(),
      },
      detached: false,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activePullChild = child;
    activePullModelId = modelId;

    const emitProgress = (
      partial: Partial<OllamaModelPullProgress> & { status: OllamaModelPullProgress["status"] }
    ) => {
      onProgress({
        modelId,
        completedBytes: 0,
        totalBytes: 0,
        percent: 0,
        ...partial,
      });
    };

    emitProgress({ status: "downloading", percent: 0 });

    const consume = (chunk: Buffer | string) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        const parsed = parseOllamaPullProgress(line);
        if (parsed) {
          emitProgress({ modelId, ...parsed });
        }
      }
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);

    const onAbort = () => {
      cancelled = true;
      try {
        if (!child.killed) child.kill();
      } catch {
        /* ignore */
      }
      emitProgress({ status: "cancelled", percent: 0, completedBytes: 0, totalBytes: 0 });
    };
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err) => {
      const sanitized = sanitizeLocalAiReason(err.message) ?? "Model download failed";
      emitProgress({ status: "error", error: sanitized });
      void finish({ success: false, error: sanitized });
    });

    child.on("close", (code) => {
      if (cancelled || abortSignal.aborted) {
        void finish({ success: false, cancelled: true, error: "Download cancelled" });
        return;
      }
      if (code === 0) {
        emitProgress({ status: "done", percent: 100 });
        void finish({ success: true });
        return;
      }
      const sanitized = "Model download failed";
      emitProgress({ status: "error", error: sanitized });
      void finish({ success: false, error: sanitized });
    });
  });
}

export function cancelActiveModelPull(modelId?: string): boolean {
  if (!activePullChild) return false;
  if (modelId && activePullModelId && modelId !== activePullModelId) return false;
  try {
    if (!activePullChild.killed) activePullChild.kill();
  } catch {
    return false;
  }
  return true;
}

export function __getActivePullForTests(): { modelId: string | null; hasChild: boolean } {
  return { modelId: activePullModelId, hasChild: Boolean(activePullChild) };
}

/** @deprecated Prefer installOllamaRuntimeOnly + pullModelWithProgress (7f.3). Never auto-pulls. */
export async function ensureLocalAiRuntime(options?: EnsureLocalAiOptions): Promise<EnsureLocalAiResult> {
  if (setupInFlight) return setupInFlight;
  setupInFlight = (async () => {
    // 7f.3: never auto-chain install+pull. pullModel is ignored.
    const installRuntime = options?.installRuntime !== false;
    try {
      const runtimePath = detectOllamaBinary();
      if (!runtimePath) {
        if (!installRuntime) {
          const error = "Ollama was not found";
          lastOllamaError = error;
          bootPhase = "not-installed";
          console.warn("[ollama] failed:", error);
          const status = await refreshAndEmit(true);
          return { ok: false, error, status };
        }
        const installed = await installOllamaRuntimeOnly({ confirmed: true });
        if (!installed.success) {
          return { ok: false, error: installed.error, status: installed.status };
        }
        return {
          ok: true,
          status: installed.status,
          changed: true,
          summary:
            "Runtime local instalat și pornit. Descarcă modelul separat din AI Providers.",
        };
      }
      await startOllamaService(runtimePath);
      setManagedByCaval(true);
      const status = await getLocalAiStatus();
      return {
        ok: true,
        status,
        changed: false,
        summary: status.defaultModelReady
          ? `Local AI este gata pe ${status.endpoint} cu modelul ${status.defaultModel}.`
          : "Runtime local pornit. Descarcă modelul separat din AI Providers.",
      };
    } catch (error) {
      return {
        ok: false,
        error: sanitizeLocalAiReason(
          error instanceof Error ? error.message : String(error)
        ),
        status: await getLocalAiStatus().catch(() => undefined),
      };
    } finally {
      setupInFlight = null;
    }
  })();
  return setupInFlight;
}

/**
 * Non-blocking boot hook: probe Ollama; if down and installed, spawn `ollama serve`.
 * Never blocks window creation — caller must use `void ensureOllamaOnBoot()`.
 * Does not auto-install; missing binary → clear log, app continues.
 */
export async function ensureOllamaOnBoot(): Promise<void> {
  if (process.env.CAVAL_SKIP_OLLAMA_AUTOSTART === "1") {
    console.info("[ollama] boot skipped (CAVAL_SKIP_OLLAMA_AUTOSTART=1)");
    return;
  }
  try {
    clearOllamaReachableCache();
    const runtimePath = detectOllamaBinary();
    if (!runtimePath) {
      bootPhase = "not-installed";
      lastOllamaError = "Ollama was not found";
      console.warn("[ollama] failed: not installed —", lastOllamaError);
      await refreshAndEmit(true);
      return;
    }
    lastRuntimePath = runtimePath;

    if (await isOllamaReachable({ force: true })) {
      lastOllamaError = undefined;
      weStartedOllama = false;
      console.info("[ollama] ready");
      await refreshAndEmit(true);
      return;
    }

    await startOllamaService(runtimePath);
  } catch (error) {
    bootPhase = "unavailable";
    lastOllamaError = sanitizeLocalAiReason(
      error instanceof Error ? error.message : String(error)
    );
    console.warn("[ollama] failed:", lastOllamaError);
    await refreshAndEmit(true);
  }
}

/** @deprecated Use {@link ensureOllamaOnBoot} — kept as alias for older call sites. */
export async function ensureManagedLocalAiOnBoot(): Promise<void> {
  return ensureOllamaOnBoot();
}
