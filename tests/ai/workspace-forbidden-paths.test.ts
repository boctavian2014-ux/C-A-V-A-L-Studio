import { describe, expect, it } from 'vitest';
import fixture from './fixtures/haine-postmortem/checkpoint-fragment.json';
import {
  filterForbiddenTasks,
  findForbiddenPathsInFileList,
  isForbiddenTaskDescription,
  isForbiddenUserWorkspacePath,
} from '../../ai/scaffolds/workspace-forbidden-paths';

describe('workspace-forbidden-paths', () => {
  it('blocks Cavallo-internal paths from haine postmortem', () => {
    for (const p of fixture.junkFiles) {
      if (p.startsWith('src/zero-latency') || p.startsWith('cavallo')) {
        expect(isForbiddenUserWorkspacePath(p)).toBe(true);
      }
    }
  });

  it('findForbiddenPathsInFileList', () => {
    const found = findForbiddenPathsInFileList([
      'web/src/App.tsx',
      'src/zero-latency/server.ts',
      'cavallo_task_generator/core.py',
    ]);
    expect(found).toEqual(['src/zero-latency/server.ts', 'cavallo_task_generator/core.py']);
  });

  it('filters forbidden decomposition tasks', () => {
    const { kept, removed } = filterForbiddenTasks([
      {
        id: '1',
        module: 'core',
        description: 'Implement fashion-matching-engine/api/main.py',
      },
      {
        id: '2',
        module: 'bad',
        description: fixture.forbiddenTasks[0] as string,
      },
    ]);
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(1);
    expect(isForbiddenTaskDescription(fixture.forbiddenTasks[1] as string)).toBe(true);
  });
});
