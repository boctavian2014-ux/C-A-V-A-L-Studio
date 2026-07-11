import { describe, expect, it } from 'vitest';
import {
  BUILD_CONTINUE_MARKER,
  buildScaffoldContinueMessage,
  isBuildContinueRequest,
} from '../../ai/prompts/build-continue';

describe('build-continue', () => {
  it('detects BUILD_CONTINUE marker', () => {
    expect(isBuildContinueRequest('please BUILD_CONTINUE now')).toBe(true);
    expect(isBuildContinueRequest('normal message')).toBe(false);
  });

  it('buildScaffoldContinueMessage includes marker', () => {
    const msg = buildScaffoldContinueMessage({
      ok: false,
      syntax: [{ level: 'error', source: 'syntax-checker', file: 'a.ts', message: 'err' }],
      importIssues: [],
      summary: 'failed',
    });
    expect(msg).toContain(BUILD_CONTINUE_MARKER);
    expect(msg).toContain('syntax');
  });
});
