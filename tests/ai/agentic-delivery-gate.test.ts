import { describe, expect, it } from 'vitest';

import { evaluateCompletionGate } from '../../ai/composer/project-completion-gate';
import type { ArenaIssue } from '../../ai/composer/multi-agent/types';

describe('agentic completion gate', () => {
  const base = {
    workspaceRoot: process.cwd(),
    writtenFiles: [
      'src/index.ts',
      'src/app.tsx',
      'src/components/Header.tsx',
      'package.json',
      'README.md',
      'tests/app.test.ts',
      'vite.config.ts',
    ],
    userMessage: 'build a dashboard',
    taskCount: 3,
    consistencyOk: true,
  };

  it('blocks on critical arena issues', () => {
    const arenaIssues: ArenaIssue[] = [
      { severity: 'critical', source: 'user-sim-verify', message: 'npm test failed' },
    ];
    const result = evaluateCompletionGate({
      ...base,
      arenaIssues,
      supervisorApproved: true,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'arena_issue')).toBe(true);
  });

  it('blocks when supervisor rejected', () => {
    const result = evaluateCompletionGate({
      ...base,
      supervisorApproved: false,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === 'supervisor_rejected')).toBe(true);
  });

  it('passes when supervisor approved and no blocking issues', () => {
    const result = evaluateCompletionGate({
      ...base,
      supervisorApproved: true,
      arenaIssues: [{ severity: 'minor', source: 'user-sim', message: 'optional polish' }],
      verify: {
        ran: true,
        commands: [{ command: 'npm test', ok: true, output: '' }],
        summary: 'npm test: ok',
      },
    });
    expect(result.ok).toBe(true);
  });
});
