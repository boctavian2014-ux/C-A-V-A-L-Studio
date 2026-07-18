import { describe, expect, it } from 'vitest';
import {
  AGENT_MODES,
  getAgentMode,
  isAgenticPipelineMode,
} from '../../ai/modes/agent-modes';

describe('agent modes', () => {
  it('exposes exactly five modes in UI order', () => {
    expect(AGENT_MODES.map((m) => m.id)).toEqual(['ask', 'plan', 'code', 'debug', 'agentic']);
  });

  it('includes agentic mode', () => {
    const agentic = AGENT_MODES.find((m) => m.id === 'agentic');
    expect(agentic).toBeDefined();
    expect(agentic?.label).toBe('Agentic');
  });

  it('does not include build or release modes', () => {
    expect(AGENT_MODES.some((m) => m.id === 'build')).toBe(false);
    expect(AGENT_MODES.some((m) => m.id === 'release')).toBe(false);
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

  it('includes plan mode (enterprise planning)', () => {
    const plan = AGENT_MODES.find((m) => m.id === 'plan');
    expect(plan).toBeDefined();
    expect(plan?.intent).toBe('planning');
  });

  it('migrates architect via getAgentMode', () => {
    expect(getAgentMode('architect').id).toBe('plan');
  });

  it('migrates legacy build/release to code via getAgentMode', () => {
    expect(getAgentMode('build').id).toBe('code');
    expect(getAgentMode('release').id).toBe('code');
  });

  it('ask is first in mode list', () => {
    expect(AGENT_MODES[0]?.id).toBe('ask');
  });
});
