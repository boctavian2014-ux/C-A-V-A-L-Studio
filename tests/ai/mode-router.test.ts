import { describe, expect, it } from 'vitest';
import { getCavalloSystemPrompt } from '../../ai/modes/mode-router';

describe('mode-router build', () => {
  it('returns build engine prompt for build mode', () => {
    const prompt = getCavalloSystemPrompt('build', { workspaceRoot: '/tmp/proj' });
    expect(prompt).toContain('Autonomous Build Engine');
    expect(prompt).toContain('/tmp/proj');
  });
});
