import { describe, expect, it } from 'vitest';
import { shouldUseMultiAgentPipeline } from '../../ai/composer/multi-agent/config';

const baseCfg = {
  enabled: true,
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

  it('never uses pipeline for non-agentic modes', () => {
    expect(
      shouldUseMultiAgentPipeline('code', 'build app', '/tmp/proj', baseCfg, {
        userBoundWorkspace: true,
      })
    ).toBe(false);
  });
});
