import { describe, expect, it } from 'vitest';
import {
  describeFastPipeline,
  fastPipelineRecapLabel,
  isFastPipelineAvailable,
  resolveFastPipelineMode,
  FAST_PIPELINE_MODULES,
} from '../../ai/pipeline/fast-pipeline';

describe('fast-pipeline', () => {
  it('is always available (never report missing)', () => {
    expect(isFastPipelineAvailable()).toBe(true);
  });

  it('lists core pipeline modules including fast-pipeline.ts', () => {
    expect(FAST_PIPELINE_MODULES).toContain('ai/pipeline/fast-pipeline.ts');
  });

  it('resolveFastPipelineMode respects strictReview over config', () => {
    expect(resolveFastPipelineMode({ configFastPipeline: true })).toBe('fast');
    expect(resolveFastPipelineMode({ configFastPipeline: true, strictReview: true })).toBe(
      'full'
    );
    expect(resolveFastPipelineMode({ configFastPipeline: false })).toBe('full');
  });

  it('recap labels avoid ambiguous Lipsă wording', () => {
    expect(fastPipelineRecapLabel('fast')).toContain('skipped');
    expect(fastPipelineRecapLabel('full')).toContain('merge+supervisor');
    expect(describeFastPipeline()).toContain('Fast Pipeline');
  });
});
