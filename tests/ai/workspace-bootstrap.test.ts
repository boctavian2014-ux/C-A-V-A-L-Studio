import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceBootstrap,
  WORKSPACE_BOOTSTRAP_MARKER,
} from '../../ai/context/workspace-bootstrap';
import { mergeProjectContextWithBootstrap } from '../../ai/context/workspace-bootstrap-shared';

describe('workspace-bootstrap', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  function makeProject(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caval-bootstrap-'));
    tmpDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
  }

  it('includes marker, workspace path, tree, and package.json', () => {
    const root = makeProject({
      'package.json': '{"name":"demo","version":"1.0.0"}',
      'README.md': '# Demo\n\nHello',
      'src/index.ts': 'export {}',
    });

    const block = buildWorkspaceBootstrap(root);
    expect(block).toContain(WORKSPACE_BOOTSTRAP_MARKER);
    expect(block).toContain(root);
    expect(block).toContain('package.json');
    expect(block).toContain('"name":"demo"');
    expect(block).toContain('README.md');
    expect(block).toContain('src');
  });

  it('mergeProjectContextWithBootstrap prepends once', () => {
    const bootstrap = `${WORKSPACE_BOOTSTRAP_MARKER}\nWorkspace: /tmp/x`;
    const merged = mergeProjectContextWithBootstrap('warm cache snippet', bootstrap);
    expect(merged.startsWith(WORKSPACE_BOOTSTRAP_MARKER)).toBe(true);
    expect(merged).toContain('warm cache snippet');

    const again = mergeProjectContextWithBootstrap(merged, bootstrap);
    expect(again).toBe(merged);
  });

  it('returns empty for missing workspace root', () => {
    expect(buildWorkspaceBootstrap('')).toBe('');
  });
});
