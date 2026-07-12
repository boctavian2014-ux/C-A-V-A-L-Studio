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

function readPackageMeta(workspaceRoot: string): { name?: string; scripts?: Record<string, string> } | null {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return null;
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string; scripts?: Record<string, string> };
  } catch {
    return null;
  }
}

const AI_JUNK_PACKAGE_NAMES = /^zero-latency-composer$/i;

/** Detect AI scaffold junk that breaks verify (markdown in src/index.ts, internal package names). */
export function isAiJunkWorkspacePackage(workspaceRoot: string): boolean {
  const pkg = readPackageMeta(workspaceRoot);
  if (!pkg?.name) return false;
  if (AI_JUNK_PACKAGE_NAMES.test(pkg.name)) return true;
  const indexTs = path.join(workspaceRoot, 'src', 'index.ts');
  if (!fs.existsSync(indexTs)) return false;
  try {
    const head = fs.readFileSync(indexTs, 'utf8').slice(0, 200).trimStart();
    if (/^#{1,6}\s/.test(head) || /^##\s+PROJECT SUMMARY/i.test(head)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function readPackageScripts(workspaceRoot: string): Record<string, string> {
  return readPackageMeta(workspaceRoot)?.scripts ?? {};
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
  if (isAiJunkWorkspacePackage(workspaceRoot)) {
    return {
      ran: false,
      commands: [],
      summary:
        'skipped verify: proiect corupt de scaffold AI (zero-latency-composer / src/index.ts invalid). Șterge fișierele junk sau restaurează package.json.',
    };
  }

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
