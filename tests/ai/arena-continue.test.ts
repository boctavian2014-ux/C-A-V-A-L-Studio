import { describe, expect, it } from 'vitest';
import {
  ARENA_CONTINUE_MARKER,
  buildArenaContinueMessage,
  isArenaContinueRequest,
} from '../../ai/prompts/arena-continue';

describe('arena-continue', () => {
  it('detects ARENA_CONTINUE marker', () => {
    expect(isArenaContinueRequest('please ARENA_CONTINUE now')).toBe(true);
    expect(isArenaContinueRequest('normal message')).toBe(false);
  });

  it('buildArenaContinueMessage includes marker', () => {
    const msg = buildArenaContinueMessage({
      ok: false,
      syntax: [{ level: 'error', source: 'syntax-checker', file: 'a.ts', message: 'err' }],
      importIssues: [],
      summary: 'failed',
    });
    expect(msg).toContain(ARENA_CONTINUE_MARKER);
    expect(msg).toContain('syntax');
  });
});
