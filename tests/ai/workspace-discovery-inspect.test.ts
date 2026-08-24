import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ai/tools/workspace-command-runner', () => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

import { runAllowedWorkspaceCommand } from '../../ai/tools/workspace-command-runner';
import { inspectWorkspaceDiscovery } from '../../ai/workspace/workspace-discovery-inspect';
import { DISCOVERY_IGNORE_DIRS, DISCOVERY_SKIP_FILES } from '../../ai/workspace/workspace-discovery';
import { gitService } from '../../src/main/git/git-service';

const tempRoots: string[] = [];

function makeWorkspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-ws-disc-'));
  tempRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return root;
}

describe('workspace-discovery-inspect', () => {
  beforeEach(() => {
    vi.mocked(runAllowedWorkspaceCommand).mockReset();
    vi.spyOn(gitService, 'status').mockResolvedValue({
      isRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      files: [],
      hasConflicts: false,
      isClean: true,
    });
    vi.spyOn(gitService, 'log').mockResolvedValue([
      {
        shortHash: 'abc1234',
        message: 'init',
        author: 'test',
        date: '2026-01-01',
        hash: 'abc1234567890',
        email: 'test@example.com',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lists structure and reads package.json scripts', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({
        name: 'demo-app',
        scripts: { typecheck: 'tsc --noEmit', test: 'vitest run', lint: 'eslint .' },
        dependencies: { vite: '^6.0.0', electron: '^34.0.0' },
      }),
      'pnpm-lock.yaml': '',
      'README.md': '# Demo',
      'src/index.ts': 'export const ok = 1;\n',
      'vite.config.ts': 'export default {};\n',
    });

    const snapshot = await inspectWorkspaceDiscovery(root, { runVerify: false });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.projectName).toBe(path.basename(root));
    expect(snapshot.hasPackageJson).toBe(true);
    expect(snapshot.scripts.typecheck).toBe('tsc --noEmit');
    expect(snapshot.scripts.test).toBe('vitest run');
    expect(snapshot.lockfile).toBe('pnpm');
    expect(snapshot.keyDirs).toContain('src');
    expect(snapshot.rootEntries).toContain('package.json');
    expect(snapshot.rootEntries).toContain('src/');
    expect(snapshot.projectType).toMatch(/Electron/);
    expect(snapshot.projectType).toMatch(/Vite/);
  });

  it('detects git modifications and TODO markers in changed files', async () => {
    const root = makeWorkspace({
      'package.json': '{"name":"x","scripts":{"test":"vitest run"}}',
      'src/Settings.tsx': '// TODO: finish settings panel\nexport {};\n',
    });

    vi.spyOn(gitService, 'status').mockResolvedValue({
      isRepo: true,
      branch: 'feat/settings',
      ahead: 0,
      behind: 0,
      files: [{ path: 'src/Settings.tsx', status: 'modified', staged: false }],
      hasConflicts: false,
      isClean: false,
    });

    const snapshot = await inspectWorkspaceDiscovery(root, { runVerify: false });

    expect(snapshot.git?.modifiedCount).toBe(1);
    expect(snapshot.git?.modifiedFiles).toContain('src/Settings.tsx');
    expect(snapshot.todos.some((t) => t.tag === 'TODO' && t.file.includes('Settings'))).toBe(true);
  });

  it('handles missing package.json as generic project without crashing', async () => {
    const root = makeWorkspace({
      'README.md': '# Generic\n',
      'main.py': 'print("hi")\n',
    });

    const snapshot = await inspectWorkspaceDiscovery(root, { runVerify: false });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.hasPackageJson).toBe(false);
    expect(snapshot.projectType).toMatch(/generic/i);
    expect(snapshot.scripts).toEqual({});
  });

  it('does not enumerate ignored directories or env files', async () => {
    const root = makeWorkspace({
      'package.json': '{"name":"x"}',
      '.env': 'SECRET=1\n',
      'node_modules/pkg/index.js': 'module.exports = {};\n',
      '.git/config': '[core]\n',
    });

    const snapshot = await inspectWorkspaceDiscovery(root, { runVerify: false });
    const names = snapshot.rootEntries.map((e) => e.replace(/\/$/, ''));

    for (const ignored of DISCOVERY_IGNORE_DIRS) {
      expect(names).not.toContain(ignored);
    }
    for (const skipped of DISCOVERY_SKIP_FILES) {
      expect(names).not.toContain(skipped);
    }
  });

  it('can run verify when scripts exist', async () => {
    const root = makeWorkspace({
      'package.json': JSON.stringify({
        scripts: { typecheck: 'tsc --noEmit' },
      }),
    });

    vi.mocked(runAllowedWorkspaceCommand).mockResolvedValue({
      command: 'npm run typecheck',
      ok: true,
      exitCode: 0,
      output: 'ok',
    });

    const snapshot = await inspectWorkspaceDiscovery(root, { runVerify: true });

    expect(snapshot.verify?.ran).toBe(true);
    expect(snapshot.verify?.allOk).toBe(true);
    expect(runAllowedWorkspaceCommand).toHaveBeenCalled();
  });
});
