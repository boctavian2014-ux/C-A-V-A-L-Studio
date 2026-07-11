import { describe, expect, it } from 'vitest';
import {
  USER_SIM_RETEST_MARKER,
  buildUserSimRetestMessage,
  isUserSimRetestRequest,
} from '../../ai/prompts/user-sim-continue';

describe('user-sim-continue', () => {
  it('detects USER_SIM_RETEST marker', () => {
    expect(isUserSimRetestRequest('please USER_SIM_RETEST now')).toBe(true);
    expect(isUserSimRetestRequest('normal message')).toBe(false);
  });

  it('buildUserSimRetestMessage includes marker and issues', () => {
    const msg = buildUserSimRetestMessage({
      pages: [],
      issues: [{ severity: 'major', source: 'test', message: 'broken button' }],
      summary: 'failed',
      reportText: '',
      artifacts: { screenshots: [], traces: [] },
      routesDiscovered: 1,
    });
    expect(msg).toContain(USER_SIM_RETEST_MARKER);
    expect(msg).toContain('broken button');
  });
});
