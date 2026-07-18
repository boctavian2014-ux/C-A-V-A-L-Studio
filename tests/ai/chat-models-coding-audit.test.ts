import { describe, expect, it } from 'vitest';
import { getModelCodingGuide, modeSupportsFileApply } from '../../ai/models/model-coding-guide';

describe('model coding guide', () => {
  it('modeSupportsFileApply includes code, debug, agentic only', () => {
    expect(modeSupportsFileApply('code')).toBe(true);
    expect(modeSupportsFileApply('debug')).toBe(true);
    expect(modeSupportsFileApply('agentic')).toBe(true);
    expect(modeSupportsFileApply('build')).toBe(false);
    expect(modeSupportsFileApply('release')).toBe(false);
    expect(modeSupportsFileApply('ask')).toBe(false);
    expect(modeSupportsFileApply('plan')).toBe(false);
  });

  it('code mode guide mentions workspace', () => {
    const guide = getModelCodingGuide('caval-auto/balanced', 'code');
    expect(guide.canCode).toBe(true);
    expect(guide.hint.toLowerCase()).toMatch(/fence|workspace|path/);
  });
});
