/** Aggregated product-research metrics — no prompts, keys, or page bodies. */

export interface ProductResearchMetrics {
  researchTriggered: number;
  durationMsTotal: number;
  durationMsCount: number;
  resultCountTotal: number;
  cacheHit: number;
  briefAccepted: number;
  generationStarted: number;
  previewPassed: number;
}

const metrics: ProductResearchMetrics = {
  researchTriggered: 0,
  durationMsTotal: 0,
  durationMsCount: 0,
  resultCountTotal: 0,
  cacheHit: 0,
  briefAccepted: 0,
  generationStarted: 0,
  previewPassed: 0,
};

export function recordResearchRun(input: {
  durationMs: number;
  resultCount: number;
  cacheHit: boolean;
}): void {
  metrics.researchTriggered += 1;
  metrics.durationMsTotal += Math.max(0, Math.round(input.durationMs));
  metrics.durationMsCount += 1;
  metrics.resultCountTotal += Math.max(0, input.resultCount);
  if (input.cacheHit) metrics.cacheHit += 1;
}

export function recordBriefAccepted(): void {
  metrics.briefAccepted += 1;
}

export function recordGenerationStarted(): void {
  metrics.generationStarted += 1;
}

export function recordPreviewPassed(): void {
  metrics.previewPassed += 1;
}

export function getProductResearchMetrics(): ProductResearchMetrics {
  return { ...metrics };
}

export function resetProductResearchMetrics(): void {
  metrics.researchTriggered = 0;
  metrics.durationMsTotal = 0;
  metrics.durationMsCount = 0;
  metrics.resultCountTotal = 0;
  metrics.cacheHit = 0;
  metrics.briefAccepted = 0;
  metrics.generationStarted = 0;
  metrics.previewPassed = 0;
}
