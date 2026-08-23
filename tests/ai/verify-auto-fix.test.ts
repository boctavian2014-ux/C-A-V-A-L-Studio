import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../ai/tools/workspace-command-runner', () => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

vi.mock('../../ai/scaffolds/workspace-cleanup.js', () => ({
  consolidateFashionWebWorkspace: vi.fn(() => ({
    deleted: [] as string[],
    created: [] as string[],
    fixed: [] as string[],
  })),
}));

import { consolidateFashionWebWorkspace } from '../../ai/scaffolds/workspace-cleanup.js';
import { runAllowedWorkspaceCommand } from '../../ai/tools/workspace-command-runner';
import {
  applyFashionWebImportFixes,
  autoFixMissingModulesFromVerify,
  ensureWorkspaceDependencies,
  extractMissingModules,
  extractRelativeModuleErrors,
  maybeAutoFixBeforeVerify,
} from '../../ai/tools/verify-auto-fix';
import { assertShellCommandAllowed } from '../../src/main/shell-security';

const tempRoots: string[] = [];

function makeWorkspace(files?: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-vaf-'));
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

function commandResult(command: string, ok: boolean, output: string) {
  return {
    command,
    ok,
    exitCode: ok ? 0 : 1,
    output,
  };
}

afterEach(() => {
  vi.mocked(runAllowedWorkspaceCommand).mockReset();
  vi.mocked(consolidateFashionWebWorkspace).mockReset();
  vi.mocked(consolidateFashionWebWorkspace).mockReturnValue({
    deleted: [],
    created: [],
    fixed: [],
  });
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('verify-auto-fix', () => {
  it('extracts bare and scoped packages from verify output', () => {
    const output = [
      "error TS2307: Cannot find module 'lucide-react' or its corresponding type declarations.",
      "Module not found: Error: Can't resolve '@tanstack/react-query'",
      "Cannot find module 'axios'",
    ].join('\n');
    const modules = extractMissingModules(output);
    expect(modules).toContain('lucide-react');
    expect(modules).toContain('@tanstack/react-query');
    expect(modules).toContain('axios');
    expect(modules.some((m) => m.startsWith('.'))).toBe(false);
  });

  it('ignores relative import paths in extractMissingModules', () => {
    const output = "Cannot find module './components/Header'";
    expect(extractMissingModules(output)).toEqual([]);
  });

  it('extracts relative module paths from TS2307 output', () => {
    const output = [
      "src/api.ts(1,50): error TS2307: Cannot find module '../types' or its corresponding type declarations.",
      "src/api/index.ts(1,30): error TS2307: Cannot find module './api' or its corresponding type declarations.",
    ].join('\n');
    const errors = extractRelativeModuleErrors(output);
    expect(errors.some((e) => e.modulePath === '../types')).toBe(true);
    expect(errors.some((e) => e.modulePath === './api')).toBe(true);
    expect(errors.find((e) => e.modulePath === '../types')?.file).toContain('api.ts');
  });

  it('handles a relative error with no file path without throwing', () => {
    const output = "Cannot find module './orphan' or its corresponding type declarations.";
    const errors = extractRelativeModuleErrors(output);
    expect(errors).toEqual([{ modulePath: './orphan' }]);
  });

  it('skips a previously-seen relative path instead of duplicating it', () => {
    const output = [
      "src/api.ts(1,1): error TS2307: Cannot find module './types' or its corresponding type declarations.",
      "src/api.ts(8,4): error TS2307: Cannot find module './types' or its corresponding type declarations.",
    ].join('\n');
    const errors = extractRelativeModuleErrors(output);
    expect(errors).toEqual([{ file: 'src/api.ts', modulePath: './types' }]);
  });
});

describe('applyFashionWebImportFixes', () => {
  it('reports a successful import correction from consolidation', async () => {
    const root = makeWorkspace();
    vi.mocked(consolidateFashionWebWorkspace).mockReturnValue({
      deleted: ['web/src/api.ts'],
      created: ['web/src/types.ts'],
      fixed: ['web/src/App.tsx'],
    });

    const result = await applyFashionWebImportFixes(root);

    expect(consolidateFashionWebWorkspace).toHaveBeenCalledWith(root);
    expect(result).toEqual({
      installed: false,
      ok: true,
      output: 'fashion-web consolidate: deleted 1, fixed imports 1, created 1',
    });
  });

  it('returns a no-op when consolidation makes no changes', async () => {
    const root = makeWorkspace();
    vi.mocked(consolidateFashionWebWorkspace).mockReturnValue({
      deleted: [],
      created: [],
      fixed: [],
    });

    const result = await applyFashionWebImportFixes(root);

    expect(result).toEqual({ installed: false, ok: true, output: '' });
  });

  it('treats relative import errors as an eligible scan even when files are unchanged', async () => {
    const root = makeWorkspace();
    vi.mocked(consolidateFashionWebWorkspace).mockReturnValue({
      deleted: [],
      created: [],
      fixed: [],
    });
    const verifyOutput =
      "src/App.tsx(1,1): error TS2307: Cannot find module './types' or its corresponding type declarations.";

    const result = await applyFashionWebImportFixes(root, verifyOutput);

    expect(result).toEqual({
      installed: false,
      ok: true,
      output: 'fashion-web consolidate: scanned',
    });
  });
});

describe('ensureWorkspaceDependencies and maybeAutoFixBeforeVerify', () => {
  it('invokes npm install when autoInstall is true and node_modules is missing', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }),
    });
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install', true, 'added 3 packages')
    );

    const result = await maybeAutoFixBeforeVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledTimes(1);
    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm install', root, 180_000);
    expect(result).toEqual({
      installed: true,
      command: 'npm install',
      ok: true,
      output: 'added 3 packages',
    });
  });

  it('surfaces an install failure without throwing', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo' }),
    });
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install', false, 'ENOTFOUND registry')
    );

    const result = await maybeAutoFixBeforeVerify(root, { autoInstall: true });

    expect(result).toEqual({
      installed: true,
      command: 'npm install',
      ok: false,
      output: 'ENOTFOUND registry',
    });
    expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'node_modules'))).toBe(false);
  });

  it('does not invoke installation when autoInstall is false', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo' }),
    });

    const result = await maybeAutoFixBeforeVerify(root, { autoInstall: false });

    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: false, ok: true, output: '' });
  });

  it('does not invoke installation when package.json is missing', async () => {
    const root = makeWorkspace();

    const result = await maybeAutoFixBeforeVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: false, ok: true, output: '' });
  });

  it('does not invoke installation when node_modules already exists', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo' }),
    });
    fs.mkdirSync(path.join(root, 'node_modules'));

    const result = await maybeAutoFixBeforeVerify(root, { autoInstall: true });

    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: false, ok: true, output: '' });
  });

  it('installs when package.json was written even if node_modules exists', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({ name: 'demo' }),
    });
    fs.mkdirSync(path.join(root, 'node_modules'));
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install', true, 'up to date')
    );

    const result = await maybeAutoFixBeforeVerify(root, {
      autoInstall: true,
      writtenFiles: ['src/App.tsx', 'package.json'],
    });

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm install', root, 180_000);
    expect(result.installed).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('deduplicates requested packages on the install command', async () => {
    const root = makeWorkspace();
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install lodash axios', true, 'ok')
    );

    await ensureWorkspaceDependencies(root, ['lodash', 'axios', 'lodash']);

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith(
      'npm install lodash axios',
      root,
      180_000
    );
  });
});

describe('autoFixMissingModulesFromVerify', () => {
  it('installs packages parsed from missing-module errors', async () => {
    const root = makeWorkspace();
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install lodash', true, 'added 1 package')
    );
    const output = "error TS2307: Cannot find module 'lodash' or its corresponding type declarations.";

    const result = await autoFixMissingModulesFromVerify(root, output);

    expect(runAllowedWorkspaceCommand).toHaveBeenCalledWith('npm install lodash', root, 180_000);
    expect(result).toEqual({
      installed: true,
      command: 'npm install lodash',
      ok: true,
      output: 'added 1 package',
    });
  });

  it('returns a no-op when no eligible package can be installed', async () => {
    const root = makeWorkspace();
    const output = [
      "Cannot find module './types' or its corresponding type declarations.",
      'SyntaxError: Unexpected token',
    ].join('\n');

    const result = await autoFixMissingModulesFromVerify(root, output);

    expect(runAllowedWorkspaceCommand).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: false, ok: true, output: '' });
  });

  it('returns the failed install result when the missing-module fix cannot install', async () => {
    const root = makeWorkspace();
    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue(
      commandResult('npm install missing-pkg', false, '404 Not Found')
    );

    const result = await autoFixMissingModulesFromVerify(
      root,
      "Cannot find module 'missing-pkg'"
    );

    expect(result).toEqual({
      installed: true,
      command: 'npm install missing-pkg',
      ok: false,
      output: '404 Not Found',
    });
  });
});

describe('shell-security npm install', () => {
  it('allows bare npm install', () => {
    expect(() => assertShellCommandAllowed('npm install')).not.toThrow();
  });

  it('allows npm install with package names', () => {
    expect(() => assertShellCommandAllowed('npm install lucide-react axios')).not.toThrow();
    expect(() =>
      assertShellCommandAllowed('npm install @tanstack/react-query')
    ).not.toThrow();
  });

  it('blocks chained shell injection', () => {
    expect(() => assertShellCommandAllowed('npm install foo; rm -rf /')).toThrow();
    expect(() => assertShellCommandAllowed('npm install foo && echo pwn')).toThrow();
  });
});
