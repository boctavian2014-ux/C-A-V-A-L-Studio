import { describe, expect, it } from 'vitest';
import { AGENT_MODES } from '../../ai/modes/agent-modes';

describe('agent modes UI', () => {
  it('lists exactly five modes for ChatModeSelect', () => {
    expect(AGENT_MODES).toHaveLength(5);
  });

  it('orders modes Ask → Plan → Code → Debug → Agentic', () => {
    expect(AGENT_MODES.map((m) => m.label)).toEqual([
      'Ask',
      'Plan',
      'Code',
      'Debug',
      'Agentic',
    ]);
  });

  it('each mode has shortLabel for compact UI', () => {
    for (const mode of AGENT_MODES) {
      expect(mode.shortLabel.trim().length).toBeGreaterThan(0);
    }
  });
});
