export * from "./types";
export { detectProductIntent, detectProductIntentSync, isProductPromptClear } from "./detect-product-intent";
export { runProductResearch } from "./research-orchestrator";
export { buildProductResearchBrief, applyDirectionRefinement, serializeProductBrief, productBriefWorkspacePath } from "./product-brief";
export { formatProductResearchContext, mergeProjectContextWithResearchBrief } from "./format-research-context";
export {
  resolveProductResearchGate,
  resolveProductBuildMode,
  shouldUseCodeInsteadOfAgentic,
} from "./research-gate";
export { canonicalizeResearchUrl, dedupeResearchHits, looksLikeCopiedHtml } from "./research-dedupe";
export { hashResearchKey, clearResearchCache, readResearchCache, writeResearchCache } from "./research-cache";
export {
  getProductResearchMetrics,
  resetProductResearchMetrics,
  recordBriefAccepted,
  recordGenerationStarted,
  recordPreviewPassed,
} from "./research-metrics";
export { sanitizeProductBrief, sanitizePendingResearch, researchPayloadLooksSafe } from "./sanitize-research";
export { selectDesignPatterns, selectVisualTraits, DESIGN_PATTERN_LIBRARY } from "./design-pattern-library";
export { createMcpWebResearchProvider } from "./web-research-provider";
