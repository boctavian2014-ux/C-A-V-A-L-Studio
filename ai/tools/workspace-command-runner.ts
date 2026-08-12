import { spawn } from 'node:child_process';

import { assertShellCommandAllowed } from '../../src/main/shell-security';
import { oneShotShellInvocation } from '../../src/main/powershell-shell';
import { sanitizeEnvForTerminal } from '../../src/main/subprocess-env';
import { redactSensitiveCommandOutput } from '../../src/shared/command-output-redaction';

export interface CommandRunResult {
  command: string;
  ok: boolean;
  exitCode: number | null;
  output: string;
  timedOut?: boolean;
}

const MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 120_000;

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`;
}

/**
 * Allowlisted one-shot command in a workspace.
 * Callers that need exclusivity wrap with `workspaceCommandMutex` (Project Health pattern).
 */
export async function runAllowedWorkspaceCommand(
  command: string,
  workspaceRoot: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<CommandRunResult> {
  const trimmed = command.trim();
  assertShellCommandAllowed(trimmed);

  return new Promise((resolve) => {
    const { file: shell, args: shellArgs } = oneShotShellInvocation(trimmed);

    const child = spawn(shell, shellArgs, {
      cwd: workspaceRoot,
      env: sanitizeEnvForTerminal(),
      shell: false,
      windowsHide: true,
    });

    let output = '';
    let settled = false;
    let timedOut = false;

    const finish = (ok: boolean, exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: trimmed,
        ok,
        exitCode,
        timedOut,
        output: redactSensitiveCommandOutput(
          trimOutput(output.trim() || (ok ? '(no output)' : '(command failed)'))
        ),
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
      timedOut = true;
      child.kill();
      append(`\n(timed out after ${timeoutMs}ms)`);
      finish(false, null);
    }, timeoutMs);
  });
}
