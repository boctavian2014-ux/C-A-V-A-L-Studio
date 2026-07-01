import fs from 'node:fs';
import path from 'node:path';

import {
  runAllowedWorkspaceCommand,
  type CommandRunResult,
} from './workspace-command-runner';

export interface WorkspaceVerifyResult {
  ran: boolean;
  commands: CommandRunResult[];
  summary: string;
}

function readPackageScripts(workspaceRoot: string): Record<string, string> {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return {};
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/** Detect safe npm verify commands from package.json scripts. */
export function detectVerifyCommands(workspaceRoot: string): string[] {
  const scripts = readPackageScripts(workspaceRoot);
  const commands: string[] = [];
  if (scripts.typecheck) commands.push('npm run typecheck');
  if (scripts.build) commands.push('npm run build');
  if (scripts.test) commands.push('npm test');
  return commands;
}

export function formatVerifySummary(result: WorkspaceVerifyResult): string {
  if (!result.ran) return result.summary;
  const parts = result.commands.map((c) => `${c.command}: ${c.ok ? 'ok' : 'fail'}`);
  return parts.join('; ');
}

/** Run build/test/typecheck locally — no MCP required. */
export async function runWorkspaceVerify(workspaceRoot: string): Promise<WorkspaceVerifyResult> {
  const planned = detectVerifyCommands(workspaceRoot);
  if (!planned.length) {
    return {
      ran: false,
      commands: [],
      summary: 'no verify scripts (build/test/typecheck) in package.json',
    };
  }

  const commands: CommandRunResult[] = [];
  for (const command of planned) {
    const result = await runAllowedWorkspaceCommand(command, workspaceRoot);
    commands.push(result);
    if (!result.ok) break;
  }

  const allOk = commands.every((c) => c.ok);
  return {
    ran: true,
    commands,
    summary: allOk
      ? formatVerifySummary({ ran: true, commands, summary: '' })
      : `failed at ${commands.find((c) => !c.ok)?.command ?? 'unknown'}`,
  };
}
