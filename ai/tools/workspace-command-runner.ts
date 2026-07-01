import { spawn } from 'node:child_process';

import { assertShellCommandAllowed } from '../../src/main/shell-security';

export interface CommandRunResult {
  command: string;
  ok: boolean;
  exitCode: number | null;
  output: string;
}

const MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 120_000;

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`;
}

export async function runAllowedWorkspaceCommand(
  command: string,
  workspaceRoot: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<CommandRunResult> {
  const trimmed = command.trim();
  assertShellCommandAllowed(trimmed);

  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs =
      process.platform === 'win32'
        ? ['-NoProfile', '-Command', trimmed]
        : ['-lc', trimmed];

    const child = spawn(shell, shellArgs, {
      cwd: workspaceRoot,
      env: process.env,
      shell: false,
    });

    let output = '';
    let settled = false;

    const finish = (ok: boolean, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: trimmed,
        ok,
        exitCode,
        output: trimOutput(output.trim() || (ok ? '(no output)' : '(command failed)')),
      });
    };

    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('error', (error) => {
      append(`Process error: ${error.message}`);
      finish(false, null);
    });

    child.on('close', (code) => {
      finish(code === 0, code);
    });

    const timer = setTimeout(() => {
      child.kill();
      append(`\n(timed out after ${timeoutMs}ms)`);
      finish(false, null);
    }, timeoutMs);
  });
}
