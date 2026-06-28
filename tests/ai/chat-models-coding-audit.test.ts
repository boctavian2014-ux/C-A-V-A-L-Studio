import { describe, expect, it } from 'vitest';
import { buildModelCatalog } from '../../ai/models/model-catalog';
import { getModelCodingGuide, modeSupportsFileApply } from '../../ai/models/model-coding-guide';

describe('chat models coding audit', () => {
  it('catalog has auto, free, paid and coding groups', async () => {
    const catalog = await buildModelCatalog(true);
    expect(catalog.auto.length).toBeGreaterThanOrEqual(3);
    expect(catalog.all.length).toBeGreaterThan(10);
  });

  it('every catalog model has a coding guide in Code mode', async () => {
    const catalog = await buildModelCatalog(true);
    for (const entry of catalog.all) {
      const guide = getModelCodingGuide(entry.id, 'code');
      expect(guide.requirement.length).toBeGreaterThan(0);
      expect(guide.hint.length).toBeGreaterThan(0);
    }
  });

  it('Code and Debug apply files; Ask and Architect do not', () => {
    expect(modeSupportsFileApply('code')).toBe(true);
    expect(modeSupportsFileApply('debug')).toBe(true);
    expect(modeSupportsFileApply('agentic')).toBe(true);
    expect(modeSupportsFileApply('ask')).toBe(false);
    expect(modeSupportsFileApply('architect')).toBe(false);
  });

  it('Auto Balanced uses tools path when OpenRouter configured', () => {
    const guide = getModelCodingGuide('caval-auto/balanced', 'code');
    expect(guide.canCode).toBe(true);
    expect(guide.path).toBe('tools');
  });

  it('Ask mode blocks file apply', () => {
    const guide = getModelCodingGuide('nex-n2-pro', 'ask');
    expect(guide.canCode).toBe(false);
  });
});
