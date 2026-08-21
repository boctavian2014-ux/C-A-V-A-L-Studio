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
} from "../shared/local-ai-contract";

export type { LocalAiStatus, LocalAiPhase } from "../shared/local-ai-contract";

export const LOCAL_AI_STATUS_CHANGED_CHANNEL = "caval:local-ai-status-changed";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
const LOCAL_AI_MANAGED_SETTING = "localAi.manageRuntime";
const SETTINGS_FILE = "caval-app-settings.json";

export interface EnsureLocalAiOptions {
  installRuntime?: boolean;
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
/** Child we spawned with `ollama serve` — kill only this on quit. */
let managedOllamaChild: ChildProcess | null = null;
let weStartedOllama = false;
let bootPhase: LocalAiPhase = "unavailable";
let lastOllamaError: string | undefined;
let lastEmittedFingerprint: string | null = null;
/** Internal only — never sent to renderer. */
let lastRuntimePath: string | undefined;

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
  const inProgress = Boolean(setupInFlight) || bootPhase === "starting";
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
  detectBinaryOverrideForTests = undefined;
  lastEmittedFingerprint = null;
  lastRuntimePath = undefined;
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
  throw new Error("Ollama pare instalat incomplet. Repornește aplicația și încearcă din nou.");
}

async function pullDefaultModel(runtimePath: string, modelName: string): Promise<void> {
  await runProcess(runtimePath, ["pull", modelName], {
    env: {
      ...process.env,
      OLLAMA_HOST: getOllamaHost(),
    },
  });
}

export async function ensureLocalAiRuntime(options?: EnsureLocalAiOptions): Promise<EnsureLocalAiResult> {
  if (setupInFlight) return setupInFlight;
  setupInFlight = (async () => {
    const installRuntime = options?.installRuntime !== false;
    const pullModel = options?.pullModel !== false;
    const modelName = options?.modelName?.trim() || DEFAULT_OLLAMA_MODEL;
    let changed = false;
    try {
      let runtimePath = detectOllamaBinary();
      if (!runtimePath) {
        if (!installRuntime) {
          const error = "Ollama was not found";
          lastOllamaError = error;
          bootPhase = "not-installed";
          console.warn("[ollama] failed:", error);
          const status = await refreshAndEmit(true);
          return { ok: false, error, status };
        }
        runtimePath = await installOllamaRuntime();
        changed = true;
      }
      await startOllamaService(runtimePath);
      if (pullModel) {
        const statusBefore = await getLocalAiStatus();
        if (!statusBefore.defaultModelReady) {
          await pullDefaultModel(runtimePath, modelName);
          changed = true;
        }
      }
      setManagedByCaval(true);
      const status = await getLocalAiStatus();
      return {
        ok: true,
        status,
        changed,
        summary: status.defaultModelReady
          ? `Local AI este gata pe ${status.endpoint} cu modelul ${status.defaultModel}.`
          : "Runtime local instalat și pornit. Modelul implicit poate fi descărcat ulterior.",
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
