import { describe, expect, it } from 'vitest';
import { getModelCodingGuide, modeSupportsFileApply } from '../../ai/models/model-coding-guide';

describe('model coding guide', () => {
  it('modeSupportsFileApply includes build', () => {
    expect(modeSupportsFileApply('build')).toBe(true);
    expect(modeSupportsFileApply('code')).toBe(true);
    expect(modeSupportsFileApply('debug')).toBe(true);
    expect(modeSupportsFileApply('agentic')).toBe(true);
    expect(modeSupportsFileApply('ask')).toBe(false);
    expect(modeSupportsFileApply('plan')).toBe(false);
  });

  it('build mode guide mentions workspace', () => {
    const guide = getModelCodingGuide('caval-auto/balanced', 'build');
    expect(guide.canCode).toBe(true);
    expect(guide.hint.toLowerCase()).toContain('workspace');
  });
});
