import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyPipelineScaffold,
  applyProposedWritesToDisk,
  applyScaffoldToWorkspaceNode,
  collectPipelineScaffoldContent,
  proposeScaffoldWrites,
  revertNewProposedWrites,
  writeScaffoldDiagnostics,
} from '../../ai/composer/scaffold-apply-node';
import { PipelineContextStore } from '../../ai/composer/multi-agent/pipeline-context-store';
import type { ProposedWrite } from '../../src/shared/ai-chat-apply-contract';

const tempRoots: string[] = [];

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-scaffold-'));
  tempRoots.push(root);
  return root;
}

function tsFence(rel: string, body: string): string {
  return ['```typescript:' + rel, body, '```'].join('\n');
}

function writeOf(rel: string, content: string, isNew: boolean): ProposedWrite {
  return { path: rel, content, isNew };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scaffold-apply-node', () => {
  it('writes files from compose output on disk', () => {
    const root = makeWorkspace();
    const content = [
      'Plan recap here.',
      '```typescript:src/hello.ts',
      'export const hello = "world";',
      '```',
    ].join('\n');

    const written = applyScaffoldToWorkspaceNode(root, content);
    expect(written).toContain('src/hello.ts');
    expect(fs.readFileSync(path.join(root, 'src', 'hello.ts'), 'utf8')).toContain('hello');
  });

  it('collects sub-agent outputs when composer is empty', () => {
    const store = PipelineContextStore.createFallback('build app');
    store.setTasks([
      {
        id: 't1',
        module: 'core',
        purpose: 'core',
        description: 'core module',
        dependencies: [],
      },
    ]);
    store.setSubAgentOutput(
      't1',
      '```typescript:src/core.ts\nexport const core = 1;\n```'
    );

    const collected = collectPipelineScaffoldContent('', store);
    expect(collected).toContain('src/core.ts');
    expect(parseFrom(collected)).toContain('src/core.ts');
  });

  it('treats a throwing workspace stat/read as a new file without crashing', () => {
    const root = makeWorkspace();
    const content = tsFence('src/stat.ts', 'export const stat = 1;\n');
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('EACCES: stat failed');
    });

    const proposed = proposeScaffoldWrites(root, content);
    vi.restoreAllMocks();

    expect(proposed).toEqual([
      expect.objectContaining({ path: 'src/stat.ts', isNew: true }),
    ]);
    expect(proposed[0]?.previousContent).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'src', 'stat.ts'))).toBe(false);
  });

  it('rejects an invalid path without writing outside the change list', () => {
    const root = makeWorkspace();
    const ok = writeOf('src/ok.ts', 'export const ok = 1;\n', true);
    const invalid = writeOf('   ', 'should-not-land', true);

    const result = applyProposedWritesToDisk(root, [ok, invalid]);

    expect(result.applied).toEqual(['src/ok.ts']);
    expect(result.errors).toContain('Invalid path');
    expect(fs.readFileSync(path.join(root, 'src', 'ok.ts'), 'utf8')).toContain('ok');
    expect(fs.readdirSync(root)).toEqual(['src']);
  });

  it('returns the documented no-workspace result and writes nothing', () => {
    const writes = [writeOf('src/ghost.ts', 'export const ghost = 1;\n', true)];

    const result = applyProposedWritesToDisk('   ', writes);

    expect(result).toEqual({ applied: [], errors: ['No workspace'] });
    expect(applyScaffoldToWorkspaceNode('', tsFence('src/ghost.ts', 'export const ghost = 1;\n'))).toEqual([]);
  });

  it('surfaces a write failure while keeping successful files on disk', () => {
    const root = makeWorkspace();
    fs.mkdirSync(path.join(root, 'src', 'blocked.ts'), { recursive: true });
    const writes = [
      writeOf('src/ok.ts', 'export const ok = true;\n', true),
      writeOf('src/blocked.ts', 'export const blocked = true;\n', true),
    ];

    const result = applyProposedWritesToDisk(root, writes);

    expect(result.applied).toEqual(['src/ok.ts']);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((err) => /EISDIR|illegal operation|directory/i.test(err))).toBe(true);
    expect(fs.readFileSync(path.join(root, 'src', 'ok.ts'), 'utf8')).toContain('ok');
    expect(fs.statSync(path.join(root, 'src', 'blocked.ts')).isDirectory()).toBe(true);
  });

  it('skips revert for files that were not newly created', () => {
    const root = makeWorkspace();
    const keep = path.join(root, 'src', 'keep.ts');
    fs.mkdirSync(path.dirname(keep), { recursive: true });
    fs.writeFileSync(keep, 'export const keep = 1;\n', 'utf8');

    const result = revertNewProposedWrites(root, [
      writeOf('src/keep.ts', 'export const keep = 2;\n', false),
    ]);

    expect(result).toEqual({ deleted: [], errors: [] });
    expect(fs.readFileSync(keep, 'utf8')).toBe('export const keep = 1;\n');
  });

  it('records unlink failure on revert without throwing or deleting the file', () => {
    const root = makeWorkspace();
    const created = path.join(root, 'src', 'new.ts');
    fs.mkdirSync(path.dirname(created), { recursive: true });
    fs.writeFileSync(created, 'export const created = 1;\n', 'utf8');
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: unlink failed');
    });

    const result = revertNewProposedWrites(root, [
      writeOf('src/new.ts', 'export const created = 1;\n', true),
    ]);

    expect(result.deleted).toEqual([]);
    expect(result.errors).toContain('EPERM: unlink failed');
    expect(fs.readFileSync(created, 'utf8')).toContain('created');
  });

  it('writes immediately when pipeline apply is not deferred', () => {
    const root = makeWorkspace();
    const store = PipelineContextStore.createFallback('build app');
    const content = tsFence('src/live.ts', 'export const live = 1;\n');

    const written = applyPipelineScaffold(root, content, store, { defer: false });

    expect(written).toContain('src/live.ts');
    expect(fs.readFileSync(path.join(root, 'src', 'live.ts'), 'utf8')).toContain('live');
  });

  it('does not write files when deferred pipeline apply only proposes paths', () => {
    const root = makeWorkspace();
    const store = PipelineContextStore.createFallback('build app');
    const content = tsFence('src/deferred.ts', 'export const deferred = 1;\n');

    const proposed = applyPipelineScaffold(root, content, store, { defer: true });

    expect(proposed).toContain('src/deferred.ts');
    expect(fs.existsSync(path.join(root, 'src', 'deferred.ts'))).toBe(false);
  });

  it('writes diagnostics when fences parse to no writable files', () => {
    const root = makeWorkspace();
    const store = PipelineContextStore.createFallback('build app');
    const content = ['```ts', 'return ctx;', '```'].join('\n');

    expect(applyScaffoldToWorkspaceNode(root, content)).toEqual([]);
    writeScaffoldDiagnostics(root, 'run-empty', content, store, []);

    const debugPath = path.join(root, '.cavalo', 'pipeline', 'run-empty', 'write-debug.json');
    expect(fs.existsSync(debugPath)).toBe(true);
    const debug = JSON.parse(fs.readFileSync(debugPath, 'utf8')) as {
      fencePairs: number;
      parsedCount: number;
      parsedPaths: string[];
    };
    expect(debug.fencePairs).toBeGreaterThanOrEqual(1);
    expect(debug.parsedCount).toBe(0);
    expect(debug.parsedPaths).toEqual([]);
    expect(fs.existsSync(path.join(root, 'src'))).toBe(false);
  });
});

function parseFrom(content: string): string[] {
  const re = /```[\w.-]+(?::([^\n`]+))?\s*\n/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) paths.push(m[1].trim());
  }
  return paths;
}
