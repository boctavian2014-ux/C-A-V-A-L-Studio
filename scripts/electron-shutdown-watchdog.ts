/**
 * External watchdog for #76 long-session disappearance.
 * Starts Electron (not CAVAL_SMOKE auto-quit), heartbeats every 5 minutes,
 * holds 90 minutes, then requests quit and records the exit code.
 *
 * Usage: npx tsx scripts/electron-shutdown-watchdog.ts
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const HOLD_MS = Number.parseInt(process.env.CAVAL_WATCHDOG_HOLD_MS ?? `${90 * 60_000}`, 10);
const HEARTBEAT_MS = Number.parseInt(process.env.CAVAL_WATCHDOG_HEARTBEAT_MS ?? `${5 * 60_000}`, 10);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(ROOT, ".cicd-artifacts", "shutdown-watchdog", STAMP);
const LOG_PATH = path.join(OUT_DIR, "electron.log");
const HEARTBEAT_PATH = path.join(OUT_DIR, "heartbeat.ndjson");

function nowIso(): string {
  return new Date().toISOString();
}

function appendHeartbeat(row: Record<string, unknown>): void {
  fs.appendFileSync(HEARTBEAT_PATH, `${JSON.stringify({ ts: nowIso(), ...row })}\n`, "utf8");
}

function lastShutdownMarker(logText: string): string | null {
  const lines = logText.split(/\r?\n/).filter((line) => line.includes("[shutdown]"));
  return lines.at(-1) ?? null;
}

function memoryForPid(pid: number): { rssKb: number | null } {
  try {
    if (process.platform === "win32") {
      const result = spawnSync(
        "powershell",
        ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`],
        { encoding: "utf8", windowsHide: true }
      );
      const n = Number.parseInt((result.stdout || "").trim(), 10);
      return { rssKb: Number.isFinite(n) ? Math.round(n / 1024) : null };
    }
    const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" });
    const n = Number.parseInt((result.stdout || "").trim(), 10);
    return { rssKb: Number.isFinite(n) ? n : null };
  } catch {
    return { rssKb: null };
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const require = createRequire(__filename);
  const electronBin = require("electron") as string;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "caval-watchdog-user-"));
  const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });

  appendHeartbeat({ event: "start", holdMs: HOLD_MS, heartbeatMs: HEARTBEAT_MS, userData });

  const child: ChildProcess = spawn(
    electronBin,
    [".", "--disable-gpu", `--user-data-dir=${userData}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        CAVAL_SMOKE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );

  const pid = child.pid ?? -1;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => logStream.write(chunk));
  child.stderr?.on("data", (chunk: string) => logStream.write(chunk));

  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let exited = false;
  child.once("exit", (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
    appendHeartbeat({
      event: "child-exit",
      pid,
      code,
      signal,
      lastMarker: lastShutdownMarker(fs.readFileSync(LOG_PATH, "utf8")),
    });
  });

  const started = Date.now();
  const beat = setInterval(() => {
    const alive = pid > 0 && isPidAlive(pid) && !exited;
    const mem = alive ? memoryForPid(pid) : { rssKb: null };
    const logText = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : "";
    appendHeartbeat({
      event: "heartbeat",
      pid,
      alive,
      rssKb: mem.rssKb,
      elapsedMs: Date.now() - started,
      lastMarker: lastShutdownMarker(logText),
    });
    if (!alive && !exited) {
      appendHeartbeat({
        event: "disappeared-without-exit-event",
        pid,
        elapsedMs: Date.now() - started,
        lastMarker: lastShutdownMarker(logText),
      });
    }
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, HOLD_MS);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  if (!exited && pid > 0 && isPidAlive(pid)) {
    appendHeartbeat({ event: "request-quit", pid });
    try {
      child.kill("SIGTERM");
    } catch (error) {
      appendHeartbeat({
        event: "kill-error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 15_000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
    if (!exited) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }

  clearInterval(beat);
  logStream.end();
  const summary = {
    outDir: OUT_DIR,
    pid,
    exited,
    exitCode,
    exitSignal,
    holdMs: HOLD_MS,
    lastMarker: lastShutdownMarker(fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8") : ""),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
