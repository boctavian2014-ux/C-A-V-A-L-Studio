import { describe, expect, it } from "vitest";

import { detectProductIntent, detectProductIntentSync, isProductPromptClear } from "../../ai/research/detect-product-intent";

describe("detectProductIntent", () => {
  it("detects a beauty booking landing page", async () => {
    const intent = await detectProductIntent("Creează landing page pentru salon cu rezervări");
    expect(intent.shouldResearch).toBe(true);
    expect(intent.category).toBe("landing");
    expect(intent.primaryGoal).toBe("booking");
    expect(intent.industry).toBe("beauty");
    expect(intent.classifiedBy).toBe("rules");
  });

  it("detects a fashion mobile marketplace", async () => {
    const intent = await detectProductIntent("Fă o aplicație mobilă marketplace pentru haine");
    expect(intent.shouldResearch).toBe(true);
    expect(intent.category).toBe("marketplace");
    expect(intent.secondaryCategory).toBe("mobile-app");
    expect(intent.industry).toBe("fashion");
  });

  it("skips TypeScript bugfixes", async () => {
    const intent = await detectProductIntent("Repară eroarea TypeScript");
    expect(intent.shouldResearch).toBe(false);
    expect(intent.skipReason).toBe("debug-or-fix");
  });

  it("skips simple explanations", async () => {
    const intent = await detectProductIntent("Explică această funcție");
    expect(intent.shouldResearch).toBe(false);
    expect(intent.skipReason).toBe("explanation");
  });

  it("extracts a user URL without putting it in raw assistant text", () => {
    const intent = detectProductIntentSync("Creează un website ca https://example.com/salon");
    expect(intent.references).toEqual(["https://example.com/salon"]);
    expect(intent.shouldResearch).toBe(true);
  });

  it("calls the LLM classifier only when the rule result is ambiguous", async () => {
    let called = 0;
    const classify = async () => {
      called += 1;
      return { industry: "beauty", audience: "local clients" };
    };
    await detectProductIntent("Creează landing page pentru salon cu rezervări", undefined, classify);
    expect(called).toBe(0);
    await detectProductIntent("fă un website", undefined, classify);
    expect(called).toBe(1);
  });

  it("treats a bare website request as incomplete", () => {
    const intent = detectProductIntentSync("fă un website");
    expect(intent.shouldResearch).toBe(true);
    expect(isProductPromptClear(intent)).toBe(false);
  });
});
