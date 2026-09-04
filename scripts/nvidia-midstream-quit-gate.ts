/**
 * Isolated NVIDIA chat mid-stream quit gate for #77.
 * Usage: npx tsx scripts/nvidia-midstream-quit-gate.ts
 *
 * Copies CAVAL userData secrets into a temp --user-data-dir so the live
 * `npm start` session is not touched. Do not set CAVAL_SMOKE (that strips keys).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactSensitiveText } from "../src/shared/command-output-redaction";

const ROOT = path.resolve(__dirname, "..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const GATE_DIR = path.join(ROOT, ".cicd-artifacts", "shutdown-gate", STAMP);
const LIVE_USER_DATA = path.join(process.env.APPDATA ?? "", "CAVAL");
const RUN_TIMEOUT_MS = 180_000;
const FIRST_CHUNK_WAIT_MS = 45_000;
const EXIT_GRACE_MS = 25_000;

type QuitProfile = {
  label: string;
  method: "taskkill WM_CLOSE" | "app.quit()" | "window.close() / Alt+F4";
  quitMode: "none" | "app.quit" | "window.close";
  quitWhen: "delay" | "first-chunk" | "near-end" | "none";
  quitMs: number;
  parentKillAfterStreamMs?: number;
};

const PROFILES: QuitProfile[] = [
  {
    label: "~2s during stream",
    method: "taskkill WM_CLOSE",
    quitMode: "none",
    quitWhen: "none",
    quitMs: 0,
    parentKillAfterStreamMs: 2_000,
  },
  {
    label: "~5s during stream",
    method: "app.quit()",
    quitMode: "app.quit",
    quitWhen: "delay",
    quitMs: 5_000,
  },
  {
    label: "~10s during stream",
    method: "window.close() / Alt+F4",
    quitMode: "window.close",
    quitWhen: "delay",
    quitMs: 10_000,
  },
  {
    label: "just before last chunk",
    method: "app.quit()",
    quitMode: "app.quit",
    quitWhen: "near-end",
    quitMs: 0,
  },
  {
    label: "exactly at first chunk",
    method: "window.close() / Alt+F4",
    quitMode: "window.close",
    quitWhen: "first-chunk",
    quitMs: 0,
  },
];

function resolveElectronBinary(): string {
  const require = createRequire(__filename);
  const electronPath = require("electron") as string;
  if (!electronPath || !fs.existsSync(electronPath)) {
    throw new Error(`Electron binary not found at ${electronPath}`);
  }
  return electronPath;
}

function copySecretsInto(userData: string): string[] {
  fs.mkdirSync(userData, { recursive: true });
  const copied: string[] = [];
  for (const name of ["caval-api-keys.bin", "Local State", "caval-app-settings.json"]) {
    const from = path.join(LIVE_USER_DATA, name);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(userData, name));
    copied.push(name);
  }
  return copied;
}

function extractShutdownLines(logText: string): string {
  return logText
    .split(/\r?\n/)
    .filter((line) => line.includes("[shutdown]") || line.includes("[shutdown:error]") || line.includes("[nvidia-gate]"))
    .join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(
  electronBin: string,
  workspace: string,
  runDir: string,
  profile: QuitProfile,
  runIndex: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null; log: string }> {
  fs.mkdirSync(runDir, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `caval-nvidia-gate-user-${runIndex}-`));
  const copied = copySecretsInto(userData);
  const logPath = path.join(runDir, "electron.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  let combined = "";

  const child: ChildProcess = spawn(
    electronBin,
    [".", "--disable-gpu", `--user-data-dir=${userData}`],
    {
      cwd: ROOT,
      env: (() => {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          CAVAL_SMOKE: "",
          CAVAL_NVIDIA_MIDSTREAM_QUIT: "1",
          CAVAL_GATE_WORKSPACE: workspace,
          CAVAL_GATE_QUIT_MODE: profile.quitMode,
          CAVAL_GATE_QUIT_WHEN: profile.quitWhen,
          CAVAL_GATE_QUIT_MS: String(profile.quitMs),
          CAVAL_GATE_NEAR_END_CHARS: "120",
          CAVAL_GATE_MODEL: "nvidia-nemotron-3-nano",
          CAVAL_TURN_TIMEOUT_MS: "180000",
          CAVAL_SKIP_OLLAMA_AUTOSTART: "1",
          ELECTRON_ENABLE_LOGGING: "1",
        };
        delete env.ELECTRON_RUN_AS_NODE;
        return env;
      })(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  const append = (chunk: string) => {
    combined += chunk;
    logStream.write(chunk);
    process.stdout.write(chunk);
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => append(chunk));
  child.stderr?.on("data", (chunk: string) => append(chunk));

  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  const exited = new Promise<void>((resolve) => {
    child.once("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      resolve();
    });
  });

  const meta = [
    `method=${profile.method}`,
    `label=${profile.label}`,
    `copiedSecrets=${copied.join(",") || "none"}`,
    `userData=${userData}`,
    `pid=${child.pid ?? "none"}`,
  ].join("\n");
  fs.writeFileSync(path.join(runDir, "run-meta.txt"), `${meta}\n`, "utf8");

  let sawUnavailable = false;
  let sawStreamStarted = false;
  const started = Date.now();
  let parentKillSent = false;
  let emptyStreamKillSent = false;

  const poll = setInterval(() => {
    if (combined.includes("[nvidia-gate] nvidia-unavailable")) {
      sawUnavailable = true;
    }
    if (!sawStreamStarted && combined.includes("[nvidia-gate] stream-started")) {
      sawStreamStarted = true;
    }
    if (
      sawStreamStarted &&
      !emptyStreamKillSent &&
      !combined.includes("[nvidia-gate] first-chunk") &&
      Date.now() - started > FIRST_CHUNK_WAIT_MS
    ) {
      emptyStreamKillSent = true;
      console.warn(
        `[nvidia-gate-harness] no first-chunk in ${FIRST_CHUNK_WAIT_MS}ms — killing empty stream`
      );
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    if (
      profile.parentKillAfterStreamMs &&
      child.pid &&
      !parentKillSent &&
      combined.includes("[nvidia-gate] first-chunk")
    ) {
      parentKillSent = true;
      const delayMs = profile.parentKillAfterStreamMs;
      setTimeout(() => {
        console.info(
          `[nvidia-gate-harness] external taskkill /PID ${child.pid} ${delayMs}ms after first-chunk`
        );
        try {
          if (process.platform === "win32" && child.pid) {
            spawnSync("taskkill", ["/PID", String(child.pid)], {
              windowsHide: true,
              encoding: "utf8",
            });
          } else {
            child.kill("SIGTERM");
          }
        } catch {
          /* already gone */
        }
      }, delayMs);
    }
  }, 100);

  const timeout = setTimeout(() => {
    console.error(`[nvidia-gate-harness] timeout ${RUN_TIMEOUT_MS}ms — killing`);
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }, RUN_TIMEOUT_MS);

  await Promise.race([exited, sleep(RUN_TIMEOUT_MS + 1_000)]);
  if (exitCode === null && exitSignal === null) {
    await sleep(EXIT_GRACE_MS);
    if (exitCode === null && exitSignal === null) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      await Promise.race([exited, sleep(5_000)]);
    }
  }
  clearTimeout(timeout);
  clearInterval(poll);
  logStream.end();

  const redacted = redactSensitiveText(combined);
  fs.writeFileSync(logPath, redacted, "utf8");
  const markers = extractShutdownLines(redacted);
  fs.writeFileSync(path.join(runDir, "shutdown-markers.txt"), `${markers}\n`, "utf8");
  const errorLines = redacted
    .split(/\r?\n/)
    .filter((line) => line.includes("[shutdown:error]"))
    .join("\n");
  fs.writeFileSync(
    path.join(runDir, "electron-smoke-exit.txt"),
    [
      `child-exit code=${exitCode ?? "null"} signal=${exitSignal ?? "null"}`,
      `elapsedMs=${Date.now() - started}`,
      `method=${profile.method}`,
      `label=${profile.label}`,
      `nvidia-unavailable=${sawUnavailable}`,
      `stream-started=${sawStreamStarted}`,
      `first-chunk=${combined.includes("[nvidia-gate] first-chunk")}`,
      `shutdown-error-present=${errorLines.length > 0}`,
    ].join("\n") + "\n",
    "utf8"
  );
  if (errorLines) {
    fs.writeFileSync(path.join(runDir, "shutdown-errors.txt"), `${errorLines}\n`, "utf8");
  }

  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return { code: exitCode, signal: exitSignal, log: redacted };
}

async function main(): Promise<void> {
  const mainJs = path.join(ROOT, "dist", "main", "electron-main.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error("dist/main/electron-main.js missing — run npm run build first");
  }
  if (!fs.existsSync(path.join(LIVE_USER_DATA, "caval-api-keys.bin"))) {
    console.error(
      [
        "[nvidia-gate-harness] NVIDIA secrets file missing.",
        "Configure NVIDIA NIM in the app: Settings → AI Providers → NVIDIA NIM (NVIDIA_API_KEY).",
        `Expected: ${path.join(LIVE_USER_DATA, "caval-api-keys.bin")}`,
      ].join("\n")
    );
    process.exit(2);
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-nvidia-gate-ws-"));
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "caval-nvidia-gate-workspace", private: true })
  );
  fs.writeFileSync(path.join(workspace, "README.md"), "NVIDIA mid-stream quit gate workspace\n");

  fs.mkdirSync(GATE_DIR, { recursive: true });
  const electronBin = resolveElectronBinary();
  const results: Array<{
    run: number;
    code: number | null;
    signal: NodeJS.Signals | null;
    method: string;
    label: string;
    shutdownError: boolean;
    streamStarted: boolean;
    firstChunk: boolean;
    unavailable: boolean;
  }> = [];

  try {
    for (let i = 0; i < PROFILES.length; i++) {
      const profile = PROFILES[i];
      const label = String(i + 1).padStart(2, "0");
      let outcome: { code: number | null; signal: NodeJS.Signals | null; log: string } | null =
        null;
      let firstChunk = false;
      let streamStarted = false;
      let shutdownError = false;
      let unavailable = false;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const runDir =
          attempt === 1
            ? path.join(GATE_DIR, `run-${label}`)
            : path.join(GATE_DIR, `run-${label}-retry${attempt}`);
        console.log(
          `\n===== nvidia mid-stream quit ${label}/05 ${profile.label} via ${profile.method} attempt=${attempt} → ${runDir} =====`
        );
        outcome = await runOnce(electronBin, workspace, runDir, profile, i + 1);
        shutdownError = outcome.log.includes("[shutdown:error]");
        streamStarted = outcome.log.includes("[nvidia-gate] stream-started");
        firstChunk = outcome.log.includes("[nvidia-gate] first-chunk");
        unavailable = outcome.log.includes("[nvidia-gate] nvidia-unavailable");
        console.log(
          `===== run-${label} attempt=${attempt} exit=${outcome.code} signal=${outcome.signal} shutdown-error=${shutdownError} stream=${streamStarted} first-chunk=${firstChunk} =====`
        );
        if (unavailable) break;
        if (firstChunk && outcome.code === 0 && !shutdownError) break;
        if (attempt < maxAttempts) {
          console.warn(
            `[nvidia-gate-harness] empty or unclean stream on ${label}; retrying ${attempt + 1}/${maxAttempts}`
          );
          await sleep(2_500);
        }
      }
      if (!outcome) {
        throw new Error(`no outcome for profile ${label}`);
      }
      results.push({
        run: i + 1,
        code: outcome.code,
        signal: outcome.signal,
        method: profile.method,
        label: profile.label,
        shutdownError,
        streamStarted,
        firstChunk,
        unavailable,
      });
      if (unavailable) {
        console.error(
          [
            "[nvidia-gate-harness] NVIDIA NIM is not available in this isolated session.",
            "Configure NVIDIA NIM: Settings → AI Providers, save NVIDIA_API_KEY, then Test key.",
            "getAgenticAvailability() available:true is not enough if only OpenRouter is configured.",
          ].join("\n")
        );
        break;
      }
      await sleep(1_500);
    }
  } finally {
    try {
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const passed = results.filter(
    (r) =>
      r.code === 0 &&
      !r.shutdownError &&
      r.streamStarted &&
      r.firstChunk &&
      !r.unavailable
  ).length;
  const summary = [
    `dir=${GATE_DIR}`,
    `count=${results.length}`,
    `pass=${passed}`,
    ...results.map(
      (r) =>
        `run-${String(r.run).padStart(2, "0")} code=${r.code} signal=${r.signal} method=${r.method} shutdown-error=${r.shutdownError} stream-started=${r.streamStarted} first-chunk=${r.firstChunk} unavailable=${r.unavailable} (${r.label})`
    ),
  ].join("\n");
  fs.writeFileSync(path.join(GATE_DIR, "summary.txt"), `${summary}\n`, "utf8");
  console.log(`\n${summary}`);
  process.exit(passed === 5 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
