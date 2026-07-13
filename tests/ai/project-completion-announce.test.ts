import { describe, expect, it } from 'vitest';

import {
  buildProjectCompletionRecap,
  buildProjectCompletionToast,
  findPipelineVerifyTargetMessage,
  formatProjectCompletionWaitMessage,
} from '../../ai/composer/project-completion-announce';

describe('project-completion-announce', () => {
  it('buildProjectCompletionRecap includes project title', () => {
    const recap = buildProjectCompletionRecap({
      projectTitle: 'haine',
      writtenFiles: ['src/a.ts', 'src/b.ts'],
      brief: { goal: 'App', approach: 'Modular', modules: ['core'] },
    });
    expect(recap).toContain('Proiect: haine');
    expect(recap).toContain('Implementat: 2 fișier(e)');
  });

  it('formatProjectCompletionWaitMessage uses project name', () => {
    expect(formatProjectCompletionWaitMessage('haine', 5)).toBe('haine gata — 5 fișier(e) scrise');
  });

  it('buildProjectCompletionToast reflects verify pending', () => {
    expect(
      buildProjectCompletionToast({
        projectTitle: 'haine',
        writtenFiles: ['a.ts'],
        verifyPending: true,
      })
    ).toBe('Proiect haine — verify în background');
  });

  it('findPipelineVerifyTargetMessage skips other workspace', () => {
    const target = findPipelineVerifyTargetMessage(
      [
        {
          id: 'a1',
          role: 'assistant',
          workspacePath: 'C:\\other',
          streamId: 's1',
        },
      ],
      { workspaceRoot: 'C:\\other', streamId: 's1', runId: 'r1' },
      'C:\\haine'
    );
    expect(target).toBeUndefined();
  });

  it('findPipelineVerifyTargetMessage matches by streamId', () => {
    const msg = {
      id: 'a1',
      role: 'assistant' as const,
      workspacePath: 'C:\\haine',
      streamId: 's1',
    };
    const target = findPipelineVerifyTargetMessage(
      [msg],
      { workspaceRoot: 'C:\\haine', streamId: 's1', runId: 'r1' },
      'C:\\haine'
    );
    expect(target?.id).toBe('a1');
  });
});
