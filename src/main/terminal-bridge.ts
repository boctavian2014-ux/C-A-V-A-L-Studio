import { spawn } from "node:child_process";
import os from "node:os";

import { assertShellCommandAllowed } from "./shell-security";
import { assertPathInWorkspace } from "./path-security";
import { sanitizeEnvForTerminal } from "./subprocess-env";

export interface TerminalRunResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  error?: string;
}

/** One-shot terminal command in workspace — used by MCP terminal bridge and run_terminal tool. */
export async function runTerminalCommand(
  workspaceRoot: string,
  command: string,
  timeoutMs = 120_000
): Promise<TerminalRunResult> {
  if (!command.trim()) {
    return { ok: false, exitCode: null, output: "", error: "Empty command" };
  }

  try {
    assertPathInWorkspace(workspaceRoot, workspaceRoot);
    assertShellCommandAllowed(command);
  } catch (error) {
    return {
      ok: false,
      exitCode: null,
      output: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const shell = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  const shellArgs = os.platform() === "win32" ? ["-NoProfile", "-Command", command] : ["-lc", command];

  return new Promise((resolve) => {
    const child = spawn(shell, shellArgs, {
      cwd: workspaceRoot,
      env: sanitizeEnvForTerminal(),
      windowsHide: true,
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, exitCode: null, output, error: "Command timed out" });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 32_000) output = output.slice(-32_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 32_000) output = output.slice(-32_000);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, exitCode: code, output });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, output, error: err.message });
    });
  });
}
