import { describe, expect, it } from 'vitest';
import {
  AGENT_MODES,
  getAgentMode,
  isBuildEngineMode,
  isAgenticPipelineMode,
} from '../../ai/modes/agent-modes';

describe('agent modes', () => {
  it('includes agentic mode', () => {
    const agentic = AGENT_MODES.find((m) => m.id === 'agentic');
    expect(agentic).toBeDefined();
    expect(agentic?.label).toBe('Agentic');
  });

  it('includes build mode', () => {
    const build = AGENT_MODES.find((m) => m.id === 'build');
    expect(build).toBeDefined();
    expect(build?.description.toLowerCase()).toContain('autonomous');
  });

  it('isBuildEngineMode is true only for build', () => {
    expect(isBuildEngineMode('build')).toBe(true);
    expect(isBuildEngineMode('code')).toBe(false);
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

  it('agentic is first in mode list', () => {
    expect(AGENT_MODES[0]?.id).toBe('agentic');
  });
});
