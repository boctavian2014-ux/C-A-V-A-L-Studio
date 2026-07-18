import { describe, expect, it } from 'vitest';
import { getCavalloSystemPrompt, resolveEffectiveMode } from '../../ai/modes/mode-router';

describe('mode-router', () => {
  it('maps legacy build mode to code prompt', () => {
    const prompt = getCavalloSystemPrompt('build', { workspaceRoot: '/tmp/proj' });
    expect(prompt).toContain('CODE MODE');
    expect(prompt).toContain('/tmp/proj');
    expect(prompt).not.toContain('Autonomous Build Engine');
  });

  it('maps legacy release mode to code prompt', () => {
    const prompt = getCavalloSystemPrompt('release', { workspaceRoot: '/tmp/caval' });
    expect(prompt).toContain('CODE MODE');
    expect(prompt).not.toContain('Release Engineer');
  });

  it('does not switch to release on legacy trigger', () => {
    const result = resolveEffectiveMode('code', 'RELEASE MODE — build installer');
    expect(result.mode).toBe('code');
    expect(result.switched).toBe(false);
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
