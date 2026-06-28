import { describe, expect, it } from 'vitest';
import {
  AGENT_MODES,
  getAgentMode,
  isAgenticPipelineMode,
} from '../../ai/modes/agent-modes';

describe('agent modes', () => {
  it('includes agentic mode', () => {
    const agentic = AGENT_MODES.find((m) => m.id === 'agentic');
    expect(agentic).toBeDefined();
    expect(agentic?.label).toBe('Agentic');
  });

  it('isAgenticPipelineMode is true only for agentic', () => {
    expect(isAgenticPipelineMode('agentic')).toBe(true);
    expect(isAgenticPipelineMode('code')).toBe(false);
    expect(isAgenticPipelineMode('ask')).toBe(false);
  });

  it('code mode has direct-model description', () => {
    const code = getAgentMode('code');
    expect(code.description.toLowerCase()).toContain('direct');
  });

  it('defaults to code mode definition when unknown', () => {
    const fallback = getAgentMode('code');
    expect(getAgentMode('code').id).toBe(fallback.id);
  });
});
