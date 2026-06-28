import { describe, expect, it } from 'vitest';
import {
  isPartialRunRequest,
  shouldUseMultiAgentPipeline,
  applyMultiAgentOverrides,
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

  it('strictReview override disables fastPipeline', () => {
    const base = {
      enabled: true,
      maxTasks: 3,
      parallelSubAgents: 2,
      supervisorRetries: 1,
      persistArtifacts: true,
      skipContextLlm: true,
      fastPipeline: true,
      enableDevToolsIntegration: true,
      reasoningLayer: {
        enabled: true,
        showEarlyBrief: true,
        showFinalRecap: true,
        showPipelineTimeline: true,
        showLiveReasoning: true,
        showHorseWaitAnimation: true,
        waitMessageRotateMs: 3500,
      },
    };
    expect(applyMultiAgentOverrides(base, { strictReview: false }).fastPipeline).toBe(true);
    expect(applyMultiAgentOverrides(base, { strictReview: true }).fastPipeline).toBe(false);
  });
});
