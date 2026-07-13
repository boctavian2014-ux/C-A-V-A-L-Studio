import { describe, expect, it } from 'vitest';
import {
  isPartialRunRequest,
  shouldUseMultiAgentPipeline,
  applyMultiAgentOverrides,
} from '../../../ai/composer/multi-agent/config';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../../ai/composer/multi-agent/types';

const baseCfg = {
  enabled: true,
  maxTasks: 8,
  parallelSubAgents: 3,
  supervisorRetries: 1,
  persistArtifacts: true,
};

describe('multi-agent config', () => {
  it('detects partial run markers', () => {
    expect(isPartialRunRequest('doar fix typo')).toBe(true);
    expect(isPartialRunRequest('/quick patch')).toBe(true);
    expect(isPartialRunRequest('build full app')).toBe(false);
  });

  it('uses pipeline for agentic mode with workspace', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', 'build app', '/tmp/proj', baseCfg)
    ).toBe(true);
  });

  it('skips pipeline for direct code mode', () => {
    expect(
      shouldUseMultiAgentPipeline('code', 'build app', '/tmp/proj', baseCfg)
    ).toBe(false);
  });

  it('skips pipeline for partial requests', () => {
    expect(
      shouldUseMultiAgentPipeline('agentic', '/quick fix', '/tmp/proj', baseCfg)
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
        waitMessageRotateMs: 4800,
      },
    };
    expect(applyMultiAgentOverrides(base, { strictReview: false }).fastPipeline).toBe(true);
    expect(applyMultiAgentOverrides(base, { strictReview: true }).fastPipeline).toBe(false);
  });

  it('keeps fastPipeline when fullDelivery is enabled', () => {
    const cfg = applyMultiAgentOverrides({
      ...DEFAULT_MULTI_AGENT_CONFIG,
      fastPipeline: true,
      fullDelivery: { ...DEFAULT_MULTI_AGENT_CONFIG.fullDelivery, enabled: true },
    });
    expect(cfg.fastPipeline).toBe(true);
    expect(cfg.fullDelivery.enabled).toBe(true);
  });
});
