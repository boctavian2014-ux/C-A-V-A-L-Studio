import { describe, expect, it } from 'vitest';
import { getCavalloSystemPrompt, resolveEffectiveMode } from '../../ai/modes/mode-router';

describe('mode-router build', () => {
  it('returns build engine prompt for build mode', () => {
    const prompt = getCavalloSystemPrompt('build', { workspaceRoot: '/tmp/proj' });
    expect(prompt).toContain('Autonomous Build Engine');
    expect(prompt).toContain('/tmp/proj');
  });

  it('returns release engineer prompt for release mode', () => {
    const prompt = getCavalloSystemPrompt('release', { workspaceRoot: '/tmp/caval' });
    expect(prompt).toContain('Release Engineer');
    expect(prompt).toContain('release:win');
    expect(prompt).toContain('/tmp/caval');
  });

  it('switches to release on explicit trigger', () => {
    const result = resolveEffectiveMode('code', 'RELEASE MODE — build installer');
    expect(result.mode).toBe('release');
    expect(result.switched).toBe(true);
  });

  it('includes Cavallo identity and end label for plan mode', () => {
    const prompt = getCavalloSystemPrompt('plan');
    expect(prompt).toContain('Cavallo AI');
    expect(prompt).toContain('PLAN MODE');
    expect(prompt).toContain('[END PLAN]');
  });

  it('includes end labels for code, ask, debug', () => {
    expect(getCavalloSystemPrompt('code')).toContain('[END CODE]');
    expect(getCavalloSystemPrompt('ask')).toContain('[END ASK]');
    expect(getCavalloSystemPrompt('debug')).toContain('[END DEBUG]');
  });

  it('does not switch mode on Test Cavallo modes', () => {
    const result = resolveEffectiveMode('code', 'Test Cavallo modes');
    expect(result.mode).toBe('code');
    expect(result.switched).toBe(false);
  });
});
