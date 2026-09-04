import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../ai/tools/workspace-command-runner', () => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

import { runAllowedWorkspaceCommand } from '../../ai/tools/workspace-command-runner';
import {
  detectVerifyCommands,
  formatVerifySummary,
  isAiJunkWorkspacePackage,
  runWorkspaceVerify,
  runWorkspaceVerifyWithAutoFix,
} from '../../ai/tools/workspace-verify';

const tempRoots: string[] = [];

function makeWorkspace(files?: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-verify-'));
  tempRoots.push(root);
  if (files) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }
  return root;
}

function withNodeModules(root: string): string {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  return root;
}

function commandResult(command: string, ok: boolean, output: string) {
  return {
    command,
    ok,
    exitCode: ok ? 0 : 1,
    output,
  };
}

describe('workspace-verify', () => {
  beforeEach(() => {
    vi.mocked(runAllowedWorkspaceCommand).mockReset();
  });

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects typecheck, build, and test from package.json', () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({
        scripts: { typecheck: 'tsc --noEmit', build: 'webpack', test: 'vitest run' },
      }),
    });
    expect(detectVerifyCommands(root)).toEqual([
      'npm run typecheck',
      'npm run build',
      'npm test',
    ]);
  });

  it('skips verify for AI junk zero-latency-composer package', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({
        name: 'zero-latency-composer',
        version: '1.0.0',
        scripts: { build: 'tsc' },
      }),
      'src/index.ts': '## PROJECT SUMMARY\nBroken',
    });

    expect(isAiJunkWorkspacePackage(root)).toBe(true);
    const result = await runWorkspaceVerify(root);
    expect(result.ran).toBe(false);
    expect(result.summary).toContain('skipped verify');
    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
  });

  it('treats a missing package.json as having no verify scripts', async () => {
    const root = makeWorkspace();

    expect(detectVerifyCommands(root)).toEqual([]);
    const result = await runWorkspaceVerify(root);
    expect(result).toEqual({
      ran: false,
      commands: [],
      summary: 'no verify scripts (build/test/typecheck) in package.json',
    });
    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
  });

  it('treats invalid package.json as having no verify scripts', async () => {
    const root = makeWorkspace({
      'package.json': '{ not json',
      'src/index.ts': 'export const ok = 1;\n',
    });

    expect(isAiJunkWorkspacePackage(root)).toBe(false);
    expect(detectVerifyCommands(root)).toEqual([]);
    const result = await runWorkspaceVerify(root);
    expect(result).toEqual({
      ran: false,
      commands: [],
      summary: 'no verify scripts (build/test/typecheck) in package.json',
    });
    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
  });

  it('detects markdown junk in src/index.ts even when the package name is ordinary', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({
        name: 'demo-shop',
        scripts: { build: 'tsc' },
      }),
      'src/index.ts': '# Project brief\nThis is not TypeScript.\n',
    });

    expect(isAiJunkWorkspacePackage(root)).toBe(true);
    const result = await runWorkspaceVerify(root);
    expect(result.ran).toBe(false);
    expect(result.summary).toContain('src/index.ts invalid');
    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
  });

  it('records a successful pre-install before running verify scripts', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
    });
    vi.mocked(runAllowedWorkspaceCommand)
      .mockResolvedValueOnce(commandResult('npm install', true, 'added 2 packages'))
      .mockResolvedValueOnce(commandResult('npm run build', true, 'built'));

    const result = await runWorkspaceVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).toHaveBeenNthCalledWith(1, 'npm install', root, 180_000);
    expect(runAllowedWorkspaceCommand).toHaveBeenNthCalledWith(2, 'npm run build', root);
    expect(result.ran).toBe(true);
    expect(result.commands).toEqual([
      commandResult('npm install', true, 'added 2 packages'),
      commandResult('npm run build', true, 'built'),
    ]);
    expect(result.summary).toBe('npm install: ok; npm run build: ok');
    expect(formatVerifySummary(result)).toBe('npm install: ok; npm run build: ok');
  });

  it('stops after a failed pre-install and does not run verify scripts', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
    });
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValueOnce(
      commandResult('npm install', false, 'ENOTFOUND registry')
    );

    const result = await runWorkspaceVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm install', root, 180_000);
    expect(result.ran).toBe(true);
    expect(result.commands).toEqual([commandResult('npm install', false, 'ENOTFOUND registry')]);
    expect(result.summary).toBe('failed at npm install');
  });

  it('runs npm install for a Vite-only scaffold even without build/test scripts', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'vite-app', scripts: { dev: 'vite' } }),
    });
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValueOnce(
      commandResult('npm install', true, 'added 80 packages')
    );

    const result = await runWorkspaceVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm install', root, 180_000);
    expect(result.ran).toBe(true);
    expect(result.commands).toEqual([commandResult('npm install', true, 'added 80 packages')]);
    expect(result.summary).toBe('npm install: ok');
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

    const root = makeWorkspace({
      'package.json': JSON.stringify({ scripts: { build: 'x', test: 'y' } }),
    });

    const result = await runWorkspaceVerify(root);
    expect(result.ran).toBe(true);
    expect(result.commands).toHaveLength(2);
    expect(result.summary).toContain('failed');
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(2);
  });
});

describe('runWorkspaceVerifyWithAutoFix', () => {
  beforeEach(() => {
    vi.mocked(runAllowedWorkspaceCommand).mockReset();
  });

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('retries verify exactly once after an eligible missing-module install', async () => {
    const root = withNodeModules(
      makeWorkspace({
        'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
      })
    );
    vi.mocked(runAllowedWorkspaceCommand)
      .mockResolvedValueOnce(
        commandResult(
          'npm run build',
          false,
          "error TS2307: Cannot find module 'lodash' or its corresponding type declarations."
        )
      )
      .mockResolvedValueOnce(commandResult('npm install lodash', true, 'added 1 package'))
      .mockResolvedValueOnce(commandResult('npm run build', true, 'built'));

    const result = await runWorkspaceVerifyWithAutoFix(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand.mock.calls.map((call) => call[0])).toEqual([
      'npm run build',
      'npm install lodash',
      'npm run build',
    ]);
    expect(result.ran).toBe(true);
    expect(result.summary).toBe('npm run build: ok');
    expect(result.commands).toEqual([commandResult('npm run build', true, 'built')]);
  });

  it('retries verify when fashion-web import repair reports an eligible change', async () => {
    const root = withNodeModules(
      makeWorkspace({
        'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
      })
    );
    vi.mocked(runAllowedWorkspaceCommand)
      .mockResolvedValueOnce(
        commandResult(
          'npm run build',
          false,
          "src/App.tsx(1,1): error TS2307: Cannot find module './types' or its corresponding type declarations."
        )
      )
      .mockResolvedValueOnce(commandResult('npm run build', true, 'built'));

    const result = await runWorkspaceVerifyWithAutoFix(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand.mock.calls.map((call) => call[0])).toEqual([
      'npm run build',
      'npm run build',
    ]);
    expect(result.summary).toBe('npm run build: ok');
  });

  it('does not retry when no eligible auto-fix applies', async () => {
    const root = withNodeModules(
      makeWorkspace({
        'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
      })
    );
    const failed = commandResult('npm run build', false, 'SyntaxError: Unexpected token');
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValueOnce(failed);

    const result = await runWorkspaceVerifyWithAutoFix(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe('failed at npm run build');
    expect(result.commands).toEqual([failed]);
  });

  it('does not retry when autoInstall is false even if modules are missing', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
    });
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValueOnce(
      commandResult(
        'npm run build',
        false,
        "Cannot find module 'lodash' or its corresponding type declarations."
      )
    );

    const result = await runWorkspaceVerifyWithAutoFix(root, { autoInstall: false });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm run build', root);
    expect(result.summary).toBe('failed at npm run build');
  });

  it('propagates the retried verify failure after a successful module install', async () => {
    const root = withNodeModules(
      makeWorkspace({
        'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
      })
    );
    vi.mocked(runAllowedWorkspaceCommand)
      .mockResolvedValueOnce(
        commandResult('npm run build', false, "Cannot find module 'lodash'")
      )
      .mockResolvedValueOnce(commandResult('npm install lodash', true, 'added 1 package'))
      .mockResolvedValueOnce(commandResult('npm run build', false, 'still failing'));

    const result = await runWorkspaceVerifyWithAutoFix(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand.mock.calls.map((call) => call[0])).toEqual([
      'npm run build',
      'npm install lodash',
      'npm run build',
    ]);
    expect(result.ran).toBe(true);
    expect(result.summary).toBe('failed at npm run build');
    expect(result.commands).toEqual([commandResult('npm run build', false, 'still failing')]);
  });
});

describe('run_command tool', () => {
  it('is listed in builtin tools', async () => {
    const { BUILTIN_TOOLS } = await import('../../ai/tools/tool-registry.js');
    expect(BUILTIN_TOOLS.some((t) => t.name === 'run_command')).toBe(true);
  });
});
