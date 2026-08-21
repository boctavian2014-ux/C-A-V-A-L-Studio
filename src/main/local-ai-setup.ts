import { app } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  clearOllamaReachableCache,
  fetchInstalledOllamaModels,
  getOllamaBaseUrl,
  isOllamaReachable,
} from "../../ai/models/ollama-client";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
const LOCAL_AI_MANAGED_SETTING = "localAi.manageRuntime";
const SETTINGS_FILE = "caval-app-settings.json";
/** Backoff delays after spawn — totals ~5s before fail. */
const OLLAMA_READY_BACKOFF_MS = [1_000, 2_000, 2_000] as const;

export interface LocalAiStatus {
  supported: boolean;
  platform: NodeJS.Platform;
  installed: boolean;
  running: boolean;
  configuredUrl: string;
  runtimePath?: string;
  models: string[];
  defaultModel: string;
  defaultModelReady: boolean;
  managedByCaval: boolean;
  inProgress: boolean;
  /** Boot / runtime phase for UI (existing IPC surface). */
  phase: "running" | "starting" | "unavailable";
  lastError?: string;
  policy: string;
}

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
let bootPhase: LocalAiStatus["phase"] = "unavailable";
let lastOllamaError: string | undefined;

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

function managedByCaval(): boolean {
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

/**
 * Spawn `ollama serve` without waiting for process exit (serve is long-running).
 * Tracks the child so quit can stop only processes we started.
 */
export function spawnOllamaServe(runtimePath: string): ChildProcess {
  const env = {
    ...process.env,
    OLLAMA_HOST: "127.0.0.1:11434",
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
    lastOllamaError = err.message;
    if (managedOllamaChild === child) {
      managedOllamaChild = null;
      weStartedOllama = false;
      bootPhase = "unavailable";
    }
  });
  child.on("exit", (code, signal) => {
    // Parent may exit after handing off to a daemon — only clear tracking if still ours.
    if (managedOllamaChild === child) {
      managedOllamaChild = null;
      // Keep weStartedOllama true only while we still have a live child to stop.
      weStartedOllama = false;
      if (code && code !== 0) {
        const msg = `ollama serve exited (code=${code}${signal ? ` signal=${signal}` : ""})`;
        console.warn("[ollama] failed:", msg);
        lastOllamaError = msg;
      }
    }
  });
  child.unref();
  return child;
}

async function waitForOllamaReadyWithBackoff(): Promise<boolean> {
  clearOllamaReachableCache();
  for (const delay of OLLAMA_READY_BACKOFF_MS) {
    await wait(delay);
    if (await isOllamaReachable({ force: true })) return true;
  }
  return false;
}

async function startOllamaService(runtimePath: string): Promise<void> {
  clearOllamaReachableCache();
  if (await isOllamaReachable({ force: true })) {
    bootPhase = "running";
    lastOllamaError = undefined;
    console.info("[ollama] ready (already running)");
    return;
  }

  bootPhase = "starting";
  console.info("[ollama] starting:", runtimePath);
  spawnOllamaServe(runtimePath);

  const ready = await waitForOllamaReadyWithBackoff();
  if (ready) {
    bootPhase = "running";
    lastOllamaError = undefined;
    console.info("[ollama] ready");
    return;
  }

  // Timed out — stop only the child we just spawned; leave any other Ollama alone.
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
  const msg = "Ollama did not become ready within ~5s after start";
  lastOllamaError = msg;
  console.warn("[ollama] failed:", msg);
  throw new Error(msg);
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
}

/** Test helpers — reset process tracking between unit tests. */
export function __resetOllamaProcessTrackingForTests(): void {
  managedOllamaChild = null;
  weStartedOllama = false;
  bootPhase = "unavailable";
  lastOllamaError = undefined;
  setupInFlight = null;
  detectBinaryOverrideForTests = undefined;
}

export function __getOllamaProcessTrackingForTests(): {
  weStartedOllama: boolean;
  hasChild: boolean;
} {
  return { weStartedOllama, hasChild: Boolean(managedOllamaChild) };
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  const runtimePath = detectOllamaBinary() ?? undefined;
  const running = await isOllamaReachable({ force: bootPhase === "starting" });
  const models = running ? await fetchInstalledOllamaModels() : [];
  const phase: LocalAiStatus["phase"] = running
    ? "running"
    : bootPhase === "starting" || Boolean(setupInFlight)
      ? "starting"
      : "unavailable";
  if (running) bootPhase = "running";
  return {
    supported: ["win32", "darwin", "linux"].includes(process.platform),
    platform: process.platform,
    installed: Boolean(runtimePath),
    running,
    configuredUrl: getOllamaBaseUrl(),
    runtimePath,
    models,
    defaultModel: DEFAULT_OLLAMA_MODEL,
    defaultModelReady: models.some(
      (name) => name === DEFAULT_OLLAMA_MODEL || name.startsWith("qwen2.5-coder:")
    ),
    managedByCaval: managedByCaval(),
    inProgress: Boolean(setupInFlight) || bootPhase === "starting",
    phase,
    ...(lastOllamaError ? { lastError: lastOllamaError } : {}),
    policy: policyText(),
  };
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
      OLLAMA_HOST: "127.0.0.1:11434",
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
          const error = "Ollama nu este instalat pe acest sistem.";
          lastOllamaError = error;
          bootPhase = "unavailable";
          console.warn("[ollama] failed:", error);
          return { ok: false, error };
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
          ? `Local AI este gata pe ${status.configuredUrl} cu modelul ${status.defaultModel}.`
          : "Runtime local instalat și pornit. Modelul implicit poate fi descărcat ulterior.",
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
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
    if (await isOllamaReachable({ force: true })) {
      bootPhase = "running";
      lastOllamaError = undefined;
      console.info("[ollama] ready");
      return;
    }
    const runtimePath = detectOllamaBinary();
    if (!runtimePath) {
      bootPhase = "unavailable";
      lastOllamaError =
        "Ollama is not installed. Install from https://ollama.com then restart Caval Studio.";
      console.warn("[ollama] failed: not installed —", lastOllamaError);
      return;
    }
    await startOllamaService(runtimePath);
  } catch (error) {
    bootPhase = "unavailable";
    lastOllamaError = error instanceof Error ? error.message : String(error);
    console.warn("[ollama] failed:", lastOllamaError);
  }
}

/** @deprecated Use {@link ensureOllamaOnBoot} — kept as alias for older call sites. */
export async function ensureManagedLocalAiOnBoot(): Promise<void> {
  return ensureOllamaOnBoot();
}
