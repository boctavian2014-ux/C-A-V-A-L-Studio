import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPathInWorkspace } from '../../src/main/path-security';

/**
 * Documents C3 contract for caval:save-file:
 * in-workspace paths must pass assertPathInWorkspace; escapes must throw.
 */
describe('caval:save-file path binding (C3)', () => {
  const root = path.resolve('/tmp/caval-workspace-c3');

  it('allows files inside workspace', () => {
    const resolved = assertPathInWorkspace(root, path.join(root, 'src', 'a.ts'));
    expect(resolved.toLowerCase()).toContain('a.ts');
  });

  it('rejects path traversal outside workspace', () => {
    expect(() =>
      assertPathInWorkspace(root, path.join(root, '..', 'escape.txt'))
    ).toThrow(/outside workspace/i);
  });
});
