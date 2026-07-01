import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { DevToolsIntegrationResult } from './types';
import { runWorkspaceVerify } from '../../tools/workspace-verify';

const execAsync = promisify(exec);

async function gitExec(cwd: string, args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string };
    return e.stdout?.trim() ?? '';
  }
}

async function probeGit(workspaceRoot: string): Promise<DevToolsIntegrationResult['git']> {
  try {
    const inside = await gitExec(workspaceRoot, 'rev-parse --is-inside-work-tree');
    if (inside !== 'true') {
      return { isRepo: false };
    }
    const branch = await gitExec(workspaceRoot, 'rev-parse --abbrev-ref HEAD');
    const status = await gitExec(workspaceRoot, 'status --porcelain');
    const changedFiles = status ? status.split('\n').filter(Boolean).length : 0;
    let remoteUrl: string | undefined;
    try {
      remoteUrl = await gitExec(workspaceRoot, 'remote get-url origin');
    } catch {
      remoteUrl = undefined;
    }
    return {
      isRepo: true,
      branch: branch || undefined,
      changedFiles,
      remoteUrl: remoteUrl || undefined,
    };
  } catch {
    return { isRepo: false };
  }
}

function probePackageJson(workspaceRoot: string): DevToolsIntegrationResult['terminal'] {
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) {
      return { packageJson: false, testScript: false };
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return {
      packageJson: true,
      testScript: Boolean(pkg.scripts?.test),
      buildScript: Boolean(pkg.scripts?.build),
    };
  } catch {
    return { packageJson: false, testScript: false };
  }
}

export async function runDevToolsIntegration(
  workspaceRoot: string,
  options?: { mcpServersReady?: number; verify?: boolean }
): Promise<DevToolsIntegrationResult> {
  const git = await probeGit(workspaceRoot);
  const terminal = probePackageJson(workspaceRoot);

  const result: DevToolsIntegrationResult = {
    git,
    mcp: { serversReady: options?.mcpServersReady ?? 0 },
    terminal,
    github: git?.remoteUrl ? { remoteUrl: git.remoteUrl } : undefined,
  };

  if (options?.verify) {
    result.verify = await runWorkspaceVerify(workspaceRoot);
  }

  return result;
}
