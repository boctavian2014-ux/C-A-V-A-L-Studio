import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../ai/tools/workspace-command-runner', () => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

import { runAllowedWorkspaceCommand } from '../../ai/tools/workspace-command-runner';
import { detectVerifyCommands, runWorkspaceVerify } from '../../ai/tools/workspace-verify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('workspace-verify', () => {
  beforeEach(() => {
    vi.mocked(runAllowedWorkspaceCommand).mockReset();
  });

  it('detects typecheck, build, and test from package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-verify-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        scripts: { typecheck: 'tsc --noEmit', build: 'webpack', test: 'vitest run' },
      })
    );
    expect(detectVerifyCommands(root)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stops on first failed command', async () => {
    vi.mocked(runAllowedWorkspaceCommand)
      .mockResolvedValueOnce({
        command: 'npm run build',
        ok: true,
        exitCode: 0,
        output: 'built',
      })
      .mockResolvedValueOnce({
        command: 'npm test',
        ok: false,
        exitCode: 1,
        output: 'test failed',
      });

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-verify-'));
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { build: 'x', test: 'y' } })
    );

    const result = await runWorkspaceVerify(root);
    expect(result.ran).toBe(true);
    expect(result.commands).toHaveLength(2);
    expect(result.summary).toContain('failed');
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(2);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('run_command tool', () => {
  it('is listed in builtin tools', async () => {
    const { BUILTIN_TOOLS } = await import('../../ai/tools/tool-registry');
    expect(BUILTIN_TOOLS.some((t) => t.name === 'run_command')).toBe(true);
  });
});
