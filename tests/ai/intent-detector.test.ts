import { describe, expect, it } from 'vitest';
import { detectIntent, normalizeAgentModeId } from '../../ai/modes/intent-detector';

describe('intent-detector', () => {
  it('detects explicit PLAN MODE trigger', () => {
    const r = detectIntent('PLAN MODE: design the billing module');
    expect(r.mode).toBe('plan');
    expect(r.confidence).toBe('high');
  });

  it('detects code intent in Romanian', () => {
    const r = detectIntent('Scrie cod pentru un API REST cu autentificare');
    expect(r.mode).toBe('code');
  });

  it('detects debug intent', () => {
    const r = detectIntent('Rezolvă eroarea: TypeError undefined is not a function');
    expect(r.mode).toBe('debug');
  });

  it('detects ask intent for explanations', () => {
    const r = detectIntent('Explică cum funcționează WebSockets');
    expect(r.mode).toBe('ask');
  });

  it('defaults to ask when ambiguous', () => {
    const r = detectIntent('hello');
    expect(r.mode).toBe('ask');
    expect(r.confidence).toBe('low');
  });

  it('migrates architect to plan', () => {
    expect(normalizeAgentModeId('architect')).toBe('plan');
    expect(normalizeAgentModeId('code')).toBe('code');
  });
});
