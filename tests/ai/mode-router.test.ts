import { describe, expect, it } from 'vitest';
import { resolveEffectiveMode, getCavalloSystemPrompt } from '../../ai/modes/mode-router';
import { CAVALLO_PLAN_PROMPT, CAVALLO_CODE_PROMPT } from '../../ai/prompts/cavallo-enterprise-modes';

describe('mode-router', () => {
  it('never switches agentic mode', () => {
    const r = resolveEffectiveMode('agentic', 'explică cum funcționează React', { autoSwitch: true });
    expect(r.mode).toBe('agentic');
    expect(r.switched).toBe(false);
  });

  it('auto-switches to debug on high-confidence error message', () => {
    const r = resolveEffectiveMode('ask', 'DEBUG MODE: fix stack trace error', { autoSwitch: true });
    expect(r.mode).toBe('debug');
    expect(r.switched).toBe(true);
  });

  it('does not switch when autoSwitch is disabled', () => {
    const r = resolveEffectiveMode('ask', 'scrie cod pentru login', { autoSwitch: false });
    expect(r.mode).toBe('ask');
    expect(r.switched).toBe(false);
  });

  it('plan prompt has no scaffold rule', () => {
    const prompt = getCavalloSystemPrompt('plan');
    expect(prompt).toContain(CAVALLO_PLAN_PROMPT.slice(0, 40));
    expect(prompt).not.toContain('SCAFFOLD EMISSION');
  });

  it('code prompt includes scaffold emission', () => {
    const prompt = getCavalloSystemPrompt('code', { workspaceRoot: '/tmp/proj' });
    expect(prompt).toContain(CAVALLO_CODE_PROMPT.slice(0, 30));
    expect(prompt).toContain('SCAFFOLD EMISSION');
    expect(prompt).toContain('/tmp/proj');
  });

  it('agentic system prompt is empty from cavallo router', () => {
    expect(getCavalloSystemPrompt('agentic')).toBe('');
  });
});
