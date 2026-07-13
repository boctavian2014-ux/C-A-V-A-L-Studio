import { describe, expect, it } from 'vitest';
import { applyComplexPromptOverrides } from '../../ai/composer/multi-agent/config';
import { DEFAULT_MULTI_AGENT_CONFIG } from '../../ai/composer/multi-agent/types';

describe('applyComplexPromptOverrides', () => {
  it('enables full pipeline for long multi-module Romanian prompts', () => {
    const message = `
Hai să facem o simulare practică pentru Primăria Constanța.
Module 1: Forexebug scraper
Module 2: SEAP integration
Module 3: Backend API FastAPI
Module 4: Frontend dashboard React
`.repeat(3);

    const cfg = applyComplexPromptOverrides(DEFAULT_MULTI_AGENT_CONFIG, message);
    expect(cfg.fastPipeline).toBe(false);
    expect(cfg.skipContextLlm).toBe(false);
    expect(cfg.antiCollapseDecomposition).toBe(true);
    expect(cfg.decompositionMaxTokens).toBeGreaterThanOrEqual(8192);
    expect(cfg.fullDelivery.minFencesAbsolute).toBeGreaterThanOrEqual(6);
  });

  it('leaves short prompts on fast pipeline', () => {
    const cfg = applyComplexPromptOverrides(DEFAULT_MULTI_AGENT_CONFIG, 'fix typo in readme');
    expect(cfg.fastPipeline).toBe(true);
    expect(cfg.skipContextLlm).toBe(true);
  });

  it('skips overrides when applyComplexPromptOverrides is false', () => {
    const cfg = applyComplexPromptOverrides(
      { ...DEFAULT_MULTI_AGENT_CONFIG, applyComplexPromptOverrides: false },
      'module frontend backend dashboard'.repeat(20)
    );
    expect(cfg.fastPipeline).toBe(true);
  });
});
