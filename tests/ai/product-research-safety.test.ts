import { describe, expect, it } from "vitest";

import { dedupeResearchHits, looksLikeCopiedHtml } from "../../ai/research/research-dedupe";
import { researchPayloadLooksSafe, sanitizePendingResearch, sanitizeProductBrief } from "../../ai/research/sanitize-research";
import { buildProductResearchBrief } from "../../ai/research/product-brief";
import { detectProductIntentSync } from "../../ai/research/detect-product-intent";

describe("product research safety", () => {
  it("dedupes by canonical URL and host", () => {
    const hits = dedupeResearchHits([
      {
        url: "https://www.Example.com/a?utm_source=x",
        title: "One",
        kind: "example",
        note: "First",
      },
      {
        url: "https://example.com/a",
        title: "Dup",
        kind: "example",
        note: "Second",
      },
      {
        url: "https://other.dev/b",
        title: "Two",
        kind: "trend",
        note: "Other",
      },
    ]);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.url).not.toMatch(/utm_/);
  });

  it("strips HTML and secrets from a brief", () => {
    const intent = detectProductIntentSync("Creează landing page pentru salon");
    const brief = buildProductResearchBrief(
      intent,
      [
        {
          url: "https://safe.example/p",
          title: "<html>steal</html>",
          kind: "example",
          note: "FIRECRAWL_API_KEY=secret sk-or-abcdefghijklmnop",
        },
      ],
      "ok"
    )!;
    const safe = sanitizeProductBrief(brief);
    expect(JSON.stringify(safe)).not.toMatch(/<html/i);
    expect(JSON.stringify(safe)).not.toMatch(/FIRECRAWL_API_KEY|sk-or-/i);
    expect(researchPayloadLooksSafe(safe)).toBe(true);
  });

  it("does not persist copied HTML on chat research metadata", () => {
    const intent = detectProductIntentSync("Creează landing page pentru salon cu rezervări");
    const brief = buildProductResearchBrief(intent, [], "unavailable")!;
    const persisted = sanitizePendingResearch({
      originalPrompt: "Creează landing page pentru salon cu rezervări",
      intent,
      brief,
      phase: "awaiting-confirm",
      messageId: "1",
    });
    expect(JSON.stringify(persisted)).not.toMatch(/<div|<html|sk-or-/i);
    expect(looksLikeCopiedHtml(JSON.stringify(persisted))).toBe(false);
  });
});
