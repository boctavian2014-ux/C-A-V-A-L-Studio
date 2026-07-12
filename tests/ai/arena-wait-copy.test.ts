import { describe, expect, it } from 'vitest';
import {
  getWaitMessage,
  getWaitMessagesForPhase,
  getWaitGlowFilter,
  getWaitGlowBoxShadow,
  resolveWaitPhase,
  activePhaseFromSteps,
  createWaitMessagePicker,
  formatWaitElapsed,
} from '../../ai/composer/arena-wait-copy';
import type { MultiAgentPhase } from '../../ai/composer/chat-activity-types';

const ALL_PHASES: MultiAgentPhase[] = [
  'memory',
  'integrate',
  'context',
  'orchestrator',
  'decompose',
  'subagent',
  'merge',
  'supervisor',
  'compose',
];

describe('arena-wait-copy', () => {
  it('each phase has at least two rotating messages', () => {
    for (const phase of ALL_PHASES) {
      expect(getWaitMessagesForPhase(phase).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('getWaitMessage rotates within phase', () => {
    const a = getWaitMessage('decompose', 0);
    const b = getWaitMessage('decompose', 1);
    expect(a).not.toBe(b);
  });

  it('fallback when phase undefined', () => {
    const msg = getWaitMessage(undefined, 0);
    expect(msg.length).toBeGreaterThan(5);
    expect(msg).toContain('CAVALLO');
  });

  it('activePhaseFromSteps returns last active step', () => {
    const phase = activePhaseFromSteps([
      { phase: 'memory', status: 'done', at: 1 },
      { phase: 'decompose', status: 'active', at: 2 },
    ]);
    expect(phase).toBe('decompose');
  });

  it('getWaitGlowFilter returns non-empty filter per phase', () => {
    const fallback = getWaitGlowFilter(undefined);
    expect(fallback).toContain('drop-shadow');
    expect(fallback).toContain('hue-rotate');
    for (const phase of ALL_PHASES) {
      const filter = getWaitGlowFilter(phase);
      expect(filter.length).toBeGreaterThan(10);
      expect(filter).toContain('drop-shadow');
      expect(filter).toContain('hue-rotate');
    }
  });

  it('getWaitGlowFilter differs by phase hue', () => {
    const decompose = getWaitGlowFilter('decompose');
    const compose = getWaitGlowFilter('compose');
    expect(decompose).not.toBe(compose);
    expect(decompose).toContain('251, 146, 60');
    expect(decompose).toContain('hue-rotate(55deg)');
    expect(compose).toContain('34, 197, 94');
    expect(compose).toContain('hue-rotate(85deg)');
  });

  it('getWaitGlowBoxShadow returns colored halo per phase', () => {
    const shadow = getWaitGlowBoxShadow('compose');
    expect(shadow).toContain('34, 197, 94');
    expect(getWaitGlowBoxShadow('decompose')).not.toBe(shadow);
  });

  it('resolveWaitPhase falls back to status label', () => {
    expect(resolveWaitPhase(undefined, 'Compose · streaming')).toBe('compose');
    expect(resolveWaitPhase(undefined, 'Architect · 3 tasks')).toBe('decompose');
  });

  it('resolveWaitPhase prefers active step over status', () => {
    expect(
      resolveWaitPhase(
        [{ phase: 'subagent', status: 'active', at: 1 }],
        'Compose · streaming'
      )
    ).toBe('subagent');
  });

  it('createWaitMessagePicker never repeats consecutive messages', () => {
    const picker = createWaitMessagePicker('decompose');
    let prev = picker.next();
    for (let i = 0; i < 20; i++) {
      const next = picker.next();
      expect(next).not.toBe(prev);
      prev = next;
    }
  });

  it('createWaitMessagePicker resets bag on phase change', () => {
    const picker = createWaitMessagePicker('memory');
    const first = picker.next();
    picker.reset('decompose');
    const afterReset = picker.next();
    expect(getWaitMessagesForPhase('decompose')).toContain(afterReset);
    expect(first.length).toBeGreaterThan(0);
  });

  it('formatWaitElapsed includes phase label', () => {
    expect(formatWaitElapsed(12, 'compose')).toBe('12s · Compose');
    expect(formatWaitElapsed(3)).toBe('3s · Pipeline');
  });

  it('expanded phases have at least six messages', () => {
    for (const phase of ['context', 'decompose', 'subagent', 'compose'] as const) {
      expect(getWaitMessagesForPhase(phase).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('phase pools contain only unique messages', () => {
    for (const phase of ALL_PHASES) {
      const pool = getWaitMessagesForPhase(phase);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it('default picker exhausts a full unique bag before reshuffling', () => {
    const picker = createWaitMessagePicker();
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      seen.add(picker.next());
    }
    expect(seen.size).toBe(16);
  });
});
