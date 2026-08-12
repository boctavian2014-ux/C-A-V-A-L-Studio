import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { redactSensitiveCommandOutput } from "../../src/shared/command-output-redaction";
import { sanitizeEnvForTerminal } from "../../src/main/subprocess-env";
import { workspaceCadMutex } from "../../ai/tools/workspace-execute-lock";

const execFileAsync = promisify(execFile);

let openscadBinaryCache: string | null | undefined;
/** Test-only: `null` forces missing binary; string forces that path; `undefined` uses discovery. */
let openscadBinaryOverrideForTests: string | null | undefined;

export const OPENSCAD_INSTALL_HINT_RO =
  "OpenSCAD nu e instalat pe acest PC. Instalează de la openscad.org sau: winget install OpenSCAD.OpenSCAD — alternativ, text-to-3D pe cloud (TRELLIS pe serverul CAD) sau cheia Meshy (Setări → mesh.apiKey) pentru generare 3D din text.";

export function discoverOpenScadBinary(): string | null {
  const envPath = process.env.OPENSCAD_PATH?.trim();
  if (envPath && fsSync.existsSync(envPath)) return envPath;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    candidates.push(
      "C:\\Program Files\\OpenSCAD\\openscad.exe",
      "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe"
    );
    if (local) {
      candidates.push(path.join(local, "Programs", "OpenSCAD", "openscad.exe"));
    }
  }

  for (const candidate of candidates) {
    try {
      if (fsSync.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Resolve OpenSCAD binary — PATH, OPENSCAD_PATH, or common Windows install dirs. */
export function resolveOpenScadBinary(): string {
  if (openscadBinaryOverrideForTests === null) {
    return "openscad-missing-q1-test";
  }
  if (typeof openscadBinaryOverrideForTests === "string" && openscadBinaryOverrideForTests) {
    return openscadBinaryOverrideForTests;
  }
  return discoverOpenScadBinary() ?? "openscad";
}

export async function isOpenScadInstalled(): Promise<boolean> {
  if (openscadBinaryOverrideForTests === null) {
    return false;
  }
  if (openscadBinaryCache !== undefined) {
    return openscadBinaryCache !== null;
  }

  const primary = resolveOpenScadBinary();
  for (const binary of primary === "openscad" ? [primary] : [primary, "openscad"]) {
    try {
      await execFileAsync(binary, ["--version"], { timeout: 8_000 });
      openscadBinaryCache = binary;
      return true;
    } catch {
      /* try next */
    }
  }

  openscadBinaryCache = null;
  return false;
}

export function resetOpenScadProbeCacheForTests(): void {
  openscadBinaryCache = undefined;
  openscadBinaryOverrideForTests = undefined;
}

/** @internal tests — `null` simulates missing OpenSCAD regardless of local installs. */
export function setOpenScadBinaryForTests(binary: string | null | undefined): void {
  openscadBinaryOverrideForTests = binary;
  openscadBinaryCache = undefined;
}

export interface RenderScadResult {
  ok: boolean;
  stlBuffer?: Buffer;
  error?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const killProcessTree = async (pid: number): Promise<void> => {
  if (!Number.isFinite(pid) || pid <= 0) return;

  if (process.platform === "win32") {
    try {
      process.kill(pid);
    } catch {
      /* ignore */
    }

    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }

  await sleep(2_000);

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
};

export async function renderScadToStl(
  scadSource: string,
  jobId: string,
  maxMs = Number(process.env.CAD_MAX_RENDER_MS ?? 120_000),
  signal?: AbortSignal,
  operationId?: string
): Promise<RenderScadResult> {
  // Lot B Zone D: argv built in main; timeout; redaction; per-job lock
  return workspaceCadMutex.runExclusive(`cad:render:${jobId}`, async () => {
    if (signal?.aborted) {
      return { ok: false, error: "Job cancelled" };
    }

    const tmpDir = path.join(os.tmpdir(), `caval-cad-${operationId || jobId}`);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.mkdir(tmpDir, { recursive: true });
    const scadPath = path.join(tmpDir, `${jobId}.scad`);
    const stlPath = path.join(tmpDir, `${jobId}.stl`);
    const openscad = resolveOpenScadBinary();
    let child: ReturnType<typeof spawn> | undefined;
    let timeoutId: NodeJS.Timeout | undefined;
    let closed = false;
    let stderr = "";

    try {
      await fs.writeFile(scadPath, scadSource, "utf8");
      if (signal?.aborted) {
        return { ok: false, error: "Job cancelled" };
      }

      const childClose = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child = spawn(openscad, ["-o", stlPath, scadPath], {
          env: sanitizeEnvForTerminal(),
          windowsHide: true,
          detached: process.platform !== "win32",
          stdio: ["ignore", "ignore", "pipe"],
        });

        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
          stderr += chunk;
          if (stderr.length > 16 * 1024) {
            stderr = stderr.slice(-16 * 1024);
          }
        });

        child.once("close", (code, signal) => {
          closed = true;
          resolve({ code, signal });
        });
        child.once("error", (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });

      const abortPromise = signal
        ? new Promise<"aborted">((resolve) => {
            if (signal.aborted) {
              resolve("aborted");
              return;
            }
            signal.addEventListener("abort", () => resolve("aborted"), { once: true });
          })
        : undefined;

      const timeoutPromise =
        maxMs > 0
          ? new Promise<"timeout">((resolve) => {
              timeoutId = setTimeout(() => resolve("timeout"), maxMs);
            })
          : undefined;

      const raceResult = await Promise.race(
        [childClose, abortPromise, timeoutPromise].filter(Boolean) as Array<
          Promise<"aborted" | "timeout"> | Promise<{ code: number | null; signal: NodeJS.Signals | null }>
        >
      );

      if (raceResult === "aborted" || raceResult === "timeout") {
        if (child?.pid) {
          if (process.platform === "win32") {
            try {
              child.kill();
            } catch {
              /* ignore */
            }
            await sleep(2_000);
            if (!closed) {
              await killProcessTree(child.pid);
            }
          } else {
            try {
              process.kill(-child.pid, "SIGTERM");
            } catch {
              try {
                child.kill("SIGTERM");
              } catch {
                /* ignore */
              }
            }
            await sleep(2_000);
            if (!closed) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                try {
                  child.kill("SIGKILL");
                } catch {
                  /* ignore */
                }
              }
            }
          }
        }

        await childClose.catch(() => undefined);
        return raceResult === "aborted"
          ? { ok: false, error: "Job cancelled" }
          : { ok: false, error: `OpenSCAD render timed out after ${maxMs}ms` };
      }

      const { code } = raceResult;
      if (code !== 0) {
        const message = redactSensitiveCommandOutput(
          stderr.trim() || `OpenSCAD exited with code ${code}`
        );
        if (/ENOENT/i.test(message)) {
          return { ok: false, error: OPENSCAD_INSTALL_HINT_RO };
        }
        return { ok: false, error: message };
      }

      const stlBuffer = await fs.readFile(stlPath);
      if (!stlBuffer.length) {
        return { ok: false, error: "OpenSCAD produced an empty STL file" };
      }
      if (signal?.aborted) {
        return { ok: false, error: "Job cancelled" };
      }
      return { ok: true, stlBuffer };
    } catch (error) {
      if (signal?.aborted) {
        return { ok: false, error: "Job cancelled" };
      }
      const message = redactSensitiveCommandOutput(
        error instanceof Error ? error.message : String(error)
      );
      if (/ENOENT/i.test(message)) {
        return { ok: false, error: OPENSCAD_INSTALL_HINT_RO };
      }
      return { ok: false, error: message };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

export function fallbackScadForPrompt(prompt: string): string {
  const label = prompt.slice(0, 40).replace(/"/g, "'");
  return `// MOCK FALLBACK — configure OPENROUTER for real CAD
// Request: ${label}
$fn = 64;
warning() {
  color("red") cube([10, 10, 10], center = true);
}
warning();`;
}
