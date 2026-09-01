import { describe, expect, it } from "vitest";

import { detectProductIntentSync } from "../../ai/research/detect-product-intent";
import { selectVisualTraits } from "../../ai/research/design-pattern-library";
import { buildProductResearchBrief } from "../../ai/research/product-brief";
import { formatProductResearchContext } from "../../ai/research/format-research-context";
import { looksLikeCopiedHtml } from "../../ai/research/research-dedupe";
import type { ResearchSourceHit } from "../../ai/research/types";

const SAMPLE_PROMPTS = [
  "Creează landing page pentru salon cu rezervări",
  "Fă un AI SaaS cu onboarding și dashboard",
  "Fă o aplicație mobilă marketplace pentru haine",
  "Website restaurant cu rezervări la masă",
  "Aplicație fitness cu antrenamente",
  "Platformă de cursuri online",
  "Portofoliu pentru un fotograf",
  "Dashboard B2B pentru analytics",
  "Aplicație de livrări pentru clienți",
  "Magazin e-commerce cu checkout",
];

const offline: ResearchSourceHit[] = [
  {
    url: "https://web.dev/learn/design/",
    title: "web.dev Learn Design",
    kind: "ux-pattern",
    note: "Put the primary conversion action on the first screen.",
  },
];

describe("product research briefs", () => {
  it("builds a beauty booking brief with the critical flows", () => {
    const intent = detectProductIntentSync("Creează landing page pentru salon cu rezervări");
    const brief = buildProductResearchBrief(intent, offline, "ok");
    expect(brief).toBeTruthy();
    expect(brief!.requiredFlows).toEqual(expect.arrayContaining(["booking", "confirmation", "primary-cta"]));
    expect(brief!.proposedPages).toEqual(
      expect.arrayContaining(["services", "gallery", "booking", "confirmation"])
    );
    expect(brief!.patterns.some((p) => p.id === "booking")).toBe(true);
    expect(brief!.patterns.some((p) => p.id === "hero-cta")).toBe(true);
    expect(brief!.constraints.mobileFirst).toBe(true);
    expect(brief!.constraints.wcagAa).toBe(true);
    expect(brief!.references[0]?.takeaway).not.toMatch(/<html/i);
    expect(brief!.patterns.length).toBeLessThanOrEqual(5);
  });

  it("refuses to stack competing visual traits", () => {
    const intent = detectProductIntentSync("Creează landing page dark mode glassmorphism 3d bento animații pentru salon");
    intent.style = "dark glass 3d animation bento";
    const visual = selectVisualTraits(intent);
    expect(visual.traits.length).toBeLessThanOrEqual(2);
    expect(visual.rejectedTraits.length).toBeGreaterThan(0);
  });

  it("grounds generation text without copied markup", () => {
    const intent = detectProductIntentSync("Creează landing page pentru salon cu rezervări");
    const brief = buildProductResearchBrief(intent, offline, "ok")!;
    const ctx = formatProductResearchContext(brief);
    expect(ctx).toMatch(/ORIGINAL OUTPUT REQUIRED/);
    expect(looksLikeCopiedHtml(ctx)).toBe(false);
    expect(ctx).toMatch(/web.dev/);
  });

  it("produces a compact brief for the ten reference prompts", () => {
    for (const prompt of SAMPLE_PROMPTS) {
      const intent = detectProductIntentSync(prompt);
      expect(intent.shouldResearch, prompt).toBe(true);
      const brief = buildProductResearchBrief(intent, offline, "ok");
      expect(brief, prompt).toBeTruthy();
      expect(brief!.patterns.length, prompt).toBeGreaterThan(0);
      expect(brief!.patterns.length, prompt).toBeLessThanOrEqual(5);
      expect(brief!.buildPlan.length, prompt).toBeGreaterThan(0);
      expect(JSON.stringify(brief)).not.toMatch(/<html|<script|sk-or-|nvapi-/i);
    }
  });
});
