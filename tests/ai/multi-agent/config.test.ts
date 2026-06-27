import { describe, expect, it } from 'vitest';
import {
  isPartialRunRequest,
  shouldUseMultiAgentPipeline,
} from '../../../ai/composer/multi-agent/config';

describe('multi-agent config', () => {
  it('detects partial run markers', () => {
    expect(isPartialRunRequest('doar fix typo')).toBe(true);
    expect(isPartialRunRequest('/quick patch')).toBe(true);
    expect(isPartialRunRequest('build full app')).toBe(false);
  });

  it('uses pipeline for code mode with workspace', () => {
    expect(
      shouldUseMultiAgentPipeline('code', 'build app', '/tmp/proj', {
        enabled: true,
        maxTasks: 8,
        parallelSubAgents: 3,
        supervisorRetries: 1,
        persistArtifacts: true,
      })
    ).toBe(true);
  });

  it('skips pipeline for partial requests', () => {
    expect(
      shouldUseMultiAgentPipeline('code', '/quick fix', '/tmp/proj', {
        enabled: true,
        maxTasks: 8,
        parallelSubAgents: 3,
        supervisorRetries: 1,
        persistArtifacts: true,
      })
    ).toBe(false);
  });
});
