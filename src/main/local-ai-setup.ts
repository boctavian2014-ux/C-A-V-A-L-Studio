import { app } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fetchInstalledOllamaModels, getOllamaBaseUrl, isOllamaReachable } from "../../ai/models/ollama-client";

const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
const LOCAL_AI_MANAGED_SETTING = "localAi.manageRuntime";
const SETTINGS_FILE = "caval-app-settings.json";
const WINDOWS_OLLAMA_EXE = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe");

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

function detectOllamaBinary(): string | null {
  if (process.platform === "win32" && fs.existsSync(WINDOWS_OLLAMA_EXE)) {
    return WINDOWS_OLLAMA_EXE;
  }
  return whichSync(process.platform === "win32" ? "ollama.exe" : "ollama");
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

function runProcess(file: string, args: string[], opts?: { env?: NodeJS.ProcessEnv; detached?: boolean }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      env: opts?.env,
      detached: opts?.detached ?? false,
      windowsHide: true,
      shell: false,
      stdio: opts?.detached ? "ignore" : "pipe",
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
    if (opts?.detached) child.unref();
  });
}

async function waitForOllamaReady(timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isOllamaReachable()) return true;
    await wait(1_000);
  }
  return false;
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  const runtimePath = detectOllamaBinary() ?? undefined;
  const running = await isOllamaReachable();
  const models = running ? await fetchInstalledOllamaModels() : [];
  return {
    supported: ["win32", "darwin", "linux"].includes(process.platform),
    platform: process.platform,
    installed: Boolean(runtimePath),
    running,
    configuredUrl: getOllamaBaseUrl(),
    runtimePath,
    models,
    defaultModel: DEFAULT_OLLAMA_MODEL,
    defaultModelReady: models.some((name) => name === DEFAULT_OLLAMA_MODEL || name.startsWith("qwen2.5-coder:")),
    managedByCaval: managedByCaval(),
    inProgress: Boolean(setupInFlight),
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

async function startOllamaService(runtimePath: string): Promise<void> {
  if (await isOllamaReachable()) return;
  const env = {
    ...process.env,
    OLLAMA_HOST: "127.0.0.1:11434",
  };
  await runProcess(runtimePath, ["serve"], { env, detached: true });
  const ready = await waitForOllamaReady();
  if (!ready) {
    throw new Error("Ollama nu a pornit la timp.");
  }
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
          return { ok: false, error: "Ollama nu este instalat pe acest sistem." };
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

export async function ensureManagedLocalAiOnBoot(): Promise<void> {
  if (!managedByCaval()) return;
  const runtimePath = detectOllamaBinary();
  if (!runtimePath) return;
  if (await isOllamaReachable()) return;
  try {
    await startOllamaService(runtimePath);
  } catch (error) {
    console.warn("[local-ai] boot start skipped:", error instanceof Error ? error.message : error);
  }
}
