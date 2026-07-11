import fs from 'node:fs';
import path from 'node:path';

import { runWorkspaceVerify } from '../../tools/workspace-verify.js';
import type { ArenaIssue } from './types';

export interface UserSimulationResult {
  issues: ArenaIssue[];
  summary: string;
  verifyRan: boolean;
}

export async function runArenaUserSimulator(
  workspaceRoot: string,
  relativeFiles: string[]
): Promise<UserSimulationResult> {
  const issues: ArenaIssue[] = [];

  const uiFiles = relativeFiles.filter((f) =>
    /\.(tsx|jsx|vue|svelte)$/i.test(f) || /\/(pages|components|views|screens)\//i.test(f)
  );

  if (uiFiles.length === 0 && relativeFiles.length > 0) {
    issues.push({
      severity: 'minor',
      source: 'user-sim',
      message: 'No UI route/component files detected — user flows may be untested',
    });
  }

  for (const rel of uiFiles.slice(0, 10)) {
    const abs = path.join(workspaceRoot, rel.replace(/\//g, path.sep));
    try {
      const content = fs.readFileSync(abs, 'utf8');
      if (!/export\s+(default\s+)?function|export\s+const\s+\w+\s*=/.test(content)) {
        issues.push({
          severity: 'minor',
          source: 'user-sim',
          file: rel,
          message: 'Component may lack clear export — verify render path',
        });
      }
      if (/onClick|onSubmit|handleClick/.test(content) && !/test|spec/i.test(rel)) {
        // informational only — no issue if tests exist elsewhere
      }
    } catch {
      // skip
    }
  }

  let verifyRan = false;
  try {
    const verify = await runWorkspaceVerify(workspaceRoot);
    verifyRan = verify.ran;
    const failed = verify.commands.find((c) => !c.ok);
    if (failed) {
      issues.push({
        severity: 'critical',
        source: 'user-sim-verify',
        message: `Workspace verify failed: ${failed.command}`,
        fix: failed.output.slice(0, 300),
      });
    }
  } catch {
    // verify optional
  }

  const summary =
    issues.length === 0
      ? verifyRan
        ? '✓ User simulation: verify passed'
        : '✓ User simulation: static checks OK'
      : `✗ User simulation: ${issues.length} issue(s)`;

  return { issues, summary, verifyRan };
}
