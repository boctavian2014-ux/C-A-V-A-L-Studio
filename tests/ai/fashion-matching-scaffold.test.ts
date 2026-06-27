import { describe, it, expect } from 'vitest';
import { isFashionMatchingEngineRequest, isLlmRefusal } from '../../ai/scaffolds/fashion-matching/detect';
import { getFashionMatchingScaffoldFiles } from '../../ai/scaffolds/fashion-matching/manifest';

describe('fashion-matching scaffold', () => {
  it('detects product matching engine prompts', () => {
    expect(isFashionMatchingEngineRequest('AI Product Matching Engine (Fashion)')).toBe(true);
    expect(isFashionMatchingEngineRequest('fashion FAISS embedding matching')).toBe(true);
    expect(isFashionMatchingEngineRequest('hello world')).toBe(false);
  });

  it('detects LLM refusal text', () => {
    expect(isLlmRefusal('nu am capacitatea de a genera coduri')).toBe(true);
    expect(isLlmRefusal('Here is pipeline.py')).toBe(false);
  });

  it('includes core pipeline modules', () => {
    const paths = getFashionMatchingScaffoldFiles().map((f) => f.path);
    expect(paths.some((p) => p.includes('pipeline.py'))).toBe(true);
    expect(paths.some((p) => p.includes('normalization.py'))).toBe(true);
    expect(paths.some((p) => p.includes('scoring.py'))).toBe(true);
  });
});
