/**
 * Workspace + Ollama available → quit ×10 for #77.
 * Usage: npx tsx scripts/workspace-ollama-quit-gate.ts
 *
 * Does not set CAVAL_SMOKE (that skips ensureOllamaOnBoot).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactSensitiveText } from "../src/shared/command-output-redaction";

const ROOT = path.resolve(__dirname, "..");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const GATE_DIR = path.join(ROOT, ".cicd-artifacts", "shutdown-gate", STAMP);
const COUNT = Math.max(1, Number.parseInt(process.argv[2] ?? "10", 10) || 10);
const RUN_TIMEOUT_MS = 90_000;
const EXIT_GRACE_MS = 20_000;

function resolveElectronBinary(): string {
  const require = createRequire(__filename);
  const electronPath = require("electron") as string;
  if (!electronPath || !fs.existsSync(electronPath)) {
    throw new Error(`Electron binary not found at ${electronPath}`);
  }
  return electronPath;
}

function extractMarkers(logText: string): string {
  return logText
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.includes("[shutdown]") ||
        line.includes("[shutdown:error]") ||
        line.includes("[ollama-gate]") ||
        line.includes("[ollama]")
    )
    .join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countOllamaQuit(log: string): number {
  return (log.match(/\[ollama\] quit:/g) ?? []).length;
}

async function runOnce(
  electronBin: string,
  workspace: string,
  runDir: string,
  runIndex: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null; log: string }> {
  fs.mkdirSync(runDir, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `caval-ollama-gate-user-${runIndex}-`));
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
          CAVAL_WORKSPACE_OLLAMA_QUIT: "1",
          CAVAL_GATE_WORKSPACE: workspace,
          CAVAL_GATE_QUIT_MS: "500",
          CAVAL_GATE_TIMEOUT_MS: "60000",
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

  fs.writeFileSync(
    path.join(runDir, "run-meta.txt"),
    [`userData=${userData}`, `pid=${child.pid ?? "none"}`, `workspace=${workspace}`].join("\n") + "\n",
    "utf8"
  );

  const timeout = setTimeout(() => {
    console.error(`[ollama-gate-harness] timeout ${RUN_TIMEOUT_MS}ms — killing`);
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
  logStream.end();

  const redacted = redactSensitiveText(combined);
  fs.writeFileSync(logPath, redacted, "utf8");
  fs.writeFileSync(path.join(runDir, "shutdown-markers.txt"), `${extractMarkers(redacted)}\n`, "utf8");
  const errorLines = redacted
    .split(/\r?\n/)
    .filter((line) => line.includes("[shutdown:error]"))
    .join("\n");
  fs.writeFileSync(
    path.join(runDir, "electron-smoke-exit.txt"),
    [
      `child-exit code=${exitCode ?? "null"} signal=${exitSignal ?? "null"}`,
      `workspace-bound=${redacted.includes("[ollama-gate] workspace-bound")}`,
      `ollama-ready=${redacted.includes("[ollama-gate] ollama-ready")}`,
      `ollama-unavailable=${redacted.includes("[ollama-gate] ollama-unavailable")}`,
      `ollama-quit-count=${countOllamaQuit(redacted)}`,
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

function isPass(log: string, code: number | null): boolean {
  const shutdownComplete = /\[shutdown\].*\bcomplete\b/.test(log);
  return (
    code === 0 &&
    log.includes("[ollama-gate] workspace-bound") &&
    log.includes("[ollama-gate] ollama-ready") &&
    !log.includes("[ollama-gate] ollama-unavailable") &&
    !log.includes("[shutdown:error]") &&
    shutdownComplete &&
    countOllamaQuit(log) === 1 &&
    !log.includes("0xC0000409") &&
    !log.includes("3221226505")
  );
}

async function main(): Promise<void> {
  const mainJs = path.join(ROOT, "dist", "main", "electron-main.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error("dist/main/electron-main.js missing — run npm run build first");
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ollama-gate-ws-"));
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "caval-ollama-gate-workspace", private: true })
  );
  fs.writeFileSync(path.join(workspace, "README.md"), "Workspace + Ollama quit gate\n");

  fs.mkdirSync(GATE_DIR, { recursive: true });
  const electronBin = resolveElectronBinary();
  const results: Array<{
    run: number;
    code: number | null;
    signal: NodeJS.Signals | null;
    pass: boolean;
    ollamaReady: boolean;
    unavailable: boolean;
    quitCount: number;
    shutdownError: boolean;
  }> = [];

  try {
    for (let i = 1; i <= COUNT; i++) {
      const label = String(i).padStart(2, "0");
      const runDir = path.join(GATE_DIR, `run-${label}`);
      console.log(`\n===== workspace+ollama quit ${label}/${String(COUNT).padStart(2, "0")} → ${runDir} =====`);
      const outcome = await runOnce(electronBin, workspace, runDir, i);
      const row = {
        run: i,
        code: outcome.code,
        signal: outcome.signal,
        pass: isPass(outcome.log, outcome.code),
        ollamaReady: outcome.log.includes("[ollama-gate] ollama-ready"),
        unavailable: outcome.log.includes("[ollama-gate] ollama-unavailable"),
        quitCount: countOllamaQuit(outcome.log),
        shutdownError: outcome.log.includes("[shutdown:error]"),
      };
      results.push(row);
      console.log(
        `===== run-${label} exit=${outcome.code} pass=${row.pass} ollama-ready=${row.ollamaReady} quit=${row.quitCount} =====`
      );
      if (row.unavailable) {
        console.error(
          "[ollama-gate-harness] Ollama never became reachable. Start Ollama (127.0.0.1:11434) and retry."
        );
        break;
      }
    }
  } finally {
    try {
      fs.rmSync(workspace, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = [
    `dir=${GATE_DIR}`,
    `count=${results.length}`,
    `pass=${passed}`,
    ...results.map(
      (r) =>
        `run-${String(r.run).padStart(2, "0")} code=${r.code} signal=${r.signal} pass=${r.pass} ollama-ready=${r.ollamaReady} unavailable=${r.unavailable} ollama-quit=${r.quitCount} shutdown-error=${r.shutdownError}`
    ),
  ].join("\n");
  fs.writeFileSync(path.join(GATE_DIR, "summary.txt"), `${summary}\n`, "utf8");
  console.log(`\n${summary}`);
  process.exit(passed === COUNT ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
