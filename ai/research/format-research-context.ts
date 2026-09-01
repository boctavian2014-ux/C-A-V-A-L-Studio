import type { ProductResearchBrief } from "./types";

export const PRODUCT_RESEARCH_CONTEXT_HEADER = "=== PRODUCT RESEARCH BRIEF (COMPACT, ORIGINAL OUTPUT) ===";

export function formatProductResearchContext(brief: ProductResearchBrief): string {
  const refs = brief.references
    .slice(0, 6)
    .map((r) => `- ${r.title} (${r.url}) — ${r.takeaway}`)
    .join("\n");
  const patterns = brief.patterns.map((p) => `- ${p.name}: ${p.why}`).join("\n");
  return [
    PRODUCT_RESEARCH_CONTEXT_HEADER,
    `Product: ${brief.productType} · ${brief.industry} · goal=${brief.primaryGoal}`,
    `Audience: ${brief.audience}`,
    `Style: ${brief.visualDirection.style}`,
    brief.visualDirection.rejectedTraits.length
      ? `Do not stack: ${brief.visualDirection.rejectedTraits.join(", ")}`
      : "",
    `Flows: ${brief.requiredFlows.join(", ") || "critical path only"}`,
    `Pages: ${brief.proposedPages.join(", ")}`,
    `Constraints: mobile-first=${brief.constraints.mobileFirst}; WCAG AA; ${brief.constraints.performance}`,
    "Patterns:",
    patterns,
    "Inspiration analyzed (structure only — never copy HTML, CSS, copy, images, or layout):",
    refs || "- none",
    "Build vertically:",
    ...brief.buildPlan.map((step) => `- ${step}`),
    "ORIGINAL OUTPUT REQUIRED: invent your own components, tokens, copy, and structure. References are takeaways, not source files.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function mergeProjectContextWithResearchBrief(
  projectContext: string,
  brief: ProductResearchBrief | null | undefined
): string {
  if (!brief) return projectContext;
  const block = formatProductResearchContext(brief);
  if (!projectContext.trim()) return block;
  return `${projectContext}\n\n---\n\n${block}`;
}
