import { looksLikeCopiedHtml } from "./research-dedupe";
import type { PendingProductResearch, ProductResearchBrief, ResearchSourceHit } from "./types";

const SECRET_RE = /(sk-[a-z0-9_-]{8,}|nvapi-[a-z0-9_-]{8,}|FIRECRAWL_API_KEY|api[_-]?key\s*[:=])/i;

export function stripUnsafeResearchText(text: string): string {
  if (SECRET_RE.test(text) || looksLikeCopiedHtml(text)) return "";
  return text.replace(/\s+/g, " ").trim();
}

export function sanitizeResearchHits(hits: ResearchSourceHit[]): ResearchSourceHit[] {
  return hits
    .map((hit) => ({
      url: hit.url,
      title: stripUnsafeResearchText(hit.title).slice(0, 120),
      kind: hit.kind,
      note: stripUnsafeResearchText(hit.note).slice(0, 160),
    }))
    .filter((hit) => hit.url && hit.title);
}

export function sanitizeProductBrief(brief: ProductResearchBrief): ProductResearchBrief {
  return {
    ...brief,
    industry: stripUnsafeResearchText(brief.industry).slice(0, 80),
    audience: stripUnsafeResearchText(brief.audience).slice(0, 120),
    visualDirection: {
      ...brief.visualDirection,
      style: stripUnsafeResearchText(brief.visualDirection.style).slice(0, 40),
    },
    references: brief.references.map((ref) => ({
      ...ref,
      title: stripUnsafeResearchText(ref.title).slice(0, 120),
      takeaway: stripUnsafeResearchText(ref.takeaway).slice(0, 160),
    })),
    clarifyingQuestion: brief.clarifyingQuestion
      ? stripUnsafeResearchText(brief.clarifyingQuestion).slice(0, 180)
      : undefined,
  };
}

export function sanitizePendingResearch(
  pending: PendingProductResearch | undefined
): PendingProductResearch | undefined {
  if (!pending) return undefined;
  return {
    ...pending,
    brief: sanitizeProductBrief(pending.brief),
  };
}

export function researchPayloadLooksSafe(value: unknown): boolean {
  const dumped = JSON.stringify(value);
  if (!dumped) return true;
  if (SECRET_RE.test(dumped)) return false;
  if (looksLikeCopiedHtml(dumped)) return false;
  return dumped.length < 12_000;
}
