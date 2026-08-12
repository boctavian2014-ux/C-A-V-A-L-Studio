import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { redactSensitiveCommandOutput } from "../shared/command-output-redaction";
import { sanitizeEnvForTerminal } from "./subprocess-env";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

export interface GitExecResult {
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function redactErr(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
    const parts = [
      typeof e.stderr === "string" ? e.stderr : e.stderr?.toString(),
      typeof e.stdout === "string" ? e.stdout : e.stdout?.toString(),
      e.message,
    ].filter(Boolean);
    return redactSensitiveCommandOutput(parts.join("\n").trim());
  }
  return redactSensitiveCommandOutput(String(err));
}

/** Validate path is a git repository (has .git). */
export function assertIsGitRepo(cwd: string): void {
  const marker = path.join(cwd, ".git");
  if (!fs.existsSync(marker)) {
    throw new Error("Not a git repository");
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], {
      cwd,
      timeout: 15_000,
      maxBuffer: 1024 * 64,
      env: sanitizeEnvForTerminal(),
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Run git with argv array — never concatenated string exec. */
export async function gitExecFile(
  cwd: string,
  args: string[],
  options?: { timeoutMs?: number; maxBuffer?: number; allowNonZero?: boolean }
): Promise<GitExecResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options?.maxBuffer ?? DEFAULT_MAX_BUFFER;
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer,
      env: sanitizeEnvForTerminal(),
      windowsHide: true,
    });
    return {
      stdout: redactSensitiveCommandOutput(String(stdout ?? "")),
      stderr: redactSensitiveCommandOutput(String(stderr ?? "")),
      timedOut: false,
    };
  } catch (err: unknown) {
    const e = err as {
      killed?: boolean;
      signal?: string | null;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    const timedOut =
      e.killed === true ||
      e.signal === "SIGTERM" ||
      /ETIMEDOUT|timed out/i.test(String(e.message ?? ""));
    const stdout = redactSensitiveCommandOutput(
      typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? ""
    );
    const stderr = redactSensitiveCommandOutput(
      typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? ""
    );
    if (options?.allowNonZero) {
      return { stdout, stderr, timedOut };
    }
    const message = redactErr(err);
    const error = new Error(timedOut ? `Git timed out after ${timeoutMs}ms` : message || "git failed");
    (error as Error & { stdout?: string; stderr?: string; timedOut?: boolean }).stdout = stdout;
    (error as Error & { stdout?: string; stderr?: string; timedOut?: boolean }).stderr = stderr;
    (error as Error & { timedOut?: boolean }).timedOut = timedOut;
    throw error;
  }
}
