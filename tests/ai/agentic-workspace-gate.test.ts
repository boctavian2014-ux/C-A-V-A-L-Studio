import { describe, expect, it } from 'vitest';
import { shouldUseMultiAgentPipeline } from '../../ai/composer/multi-agent/config';
import { DEFAULT_MULTI_AGENT_CONFIG, type MultiAgentConfig } from '../../ai/composer/multi-agent/types';

const baseCfg: MultiAgentConfig = {
  ...DEFAULT_MULTI_AGENT_CONFIG,
  enabled: true,
  agenticRuntime: 'pipeline',
  maxTasks: 8,
  parallelSubAgents: 3,
  supervisorRetries: 1,
  persistArtifacts: true,
};

describe('agentic workspace gate', () => {
  it('requires workspace root for agentic pipeline', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', 'build app', undefined, baseCfg, {
        userBoundWorkspace: true,
      })
    ).toBe(false);
  });

  it('requires user-bound workspace (not cwd fallback)', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', 'build app', '/tmp/proj', baseCfg, {
        userBoundWorkspace: false,
      })
    ).toBe(false);
  });

  it('allows agentic when workspace is explicitly bound', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', 'build app', '/tmp/proj', baseCfg, {
        userBoundWorkspace: true,
      })
    ).toBe(true);
  });

  it('disables the pipeline when agentic runtime uses tools', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', 'build app', '/tmp/proj', { ...baseCfg, agenticRuntime: 'tools' }, {
        userBoundWorkspace: true,
      })
    ).toBe(false);
  });

  it('never uses pipeline for non-agentic modes', () => {
    expect(
      shouldUseMultiAgentPipeline('code', 'build app', '/tmp/proj', baseCfg, {
        userBoundWorkspace: true,
      })
    ).toBe(false);
  });
});
