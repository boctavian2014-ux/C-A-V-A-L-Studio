import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearResearchCache } from "../../ai/research/research-cache";
import { resetProductResearchMetrics, getProductResearchMetrics } from "../../ai/research/research-metrics";
import { runProductResearch } from "../../ai/research/research-orchestrator";
import { resolveProductResearchGate } from "../../ai/research/research-gate";
import type { ResearchSourceHit, WebResearchProvider } from "../../ai/research/types";

const liveHit: ResearchSourceHit = {
  url: "https://example.com/booking-demo?utm_source=ad",
  title: "Booking demo",
  kind: "example",
  note: "Keep the slot picker on the first conversion screen.",
};

function okProvider(hits: ResearchSourceHit[] = [liveHit]): WebResearchProvider {
  return {
    search: async () => hits,
  };
}

beforeEach(() => {
  clearResearchCache();
  resetProductResearchMetrics();
});

afterEach(() => {
  clearResearchCache();
  resetProductResearchMetrics();
});

describe("runProductResearch", () => {
  it("runs automatically for a landing page and caches the brief hash", async () => {
    const first = await runProductResearch({
      prompt: "Creează landing page pentru salon cu rezervări",
      provider: okProvider(),
    });
    expect(first.status === "ok" || first.status === "unavailable").toBe(true);
    expect(first.brief?.productType).toBe("landing");
    expect(first.cacheHit).toBe(false);
    const second = await runProductResearch({
      prompt: "Creează landing page pentru salon cu rezervări",
      provider: okProvider(),
    });
    expect(second.cacheHit).toBe(true);
    expect(getProductResearchMetrics().cacheHit).toBeGreaterThan(0);
  });

  it("does not run live search for a bugfix", async () => {
    let searches = 0;
    const result = await runProductResearch({
      prompt: "Repară eroarea TypeScript",
      provider: {
        search: async () => {
          searches += 1;
          return [liveHit];
        },
      },
    });
    expect(result.status).toBe("skipped");
    expect(result.brief).toBeNull();
    expect(searches).toBe(0);
  });

  it("continues when the web provider is absent", async () => {
    const result = await runProductResearch({
      prompt: "Creează landing page pentru salon cu rezervări",
      provider: null,
    });
    expect(result.status).toBe("unavailable");
    expect(result.brief).toBeTruthy();
    expect(result.brief?.researchStatus).toBe("unavailable");
  });

  it("times out a hanging provider without blocking a brief", async () => {
    const result = await runProductResearch({
      prompt: "Creează landing page pentru salon cu rezervări",
      timeoutMs: 30,
      provider: {
        search: (_queries, signal) =>
          new Promise((resolve) => {
            signal.addEventListener("abort", () => resolve([]), { once: true });
          }),
      },
    });
    expect(result.status).toBe("timeout");
    expect(result.brief?.researchStatus).toBe("timeout");
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it("keeps a user URL after dedupe and drops tracking params", async () => {
    const result = await runProductResearch({
      prompt: "Creează landing page pentru salon https://www.Example.com/look?utm_source=ad",
      provider: okProvider([
        {
          url: "https://www.example.com/look?utm_source=ad",
          title: "Example look",
          kind: "example",
          note: "User overlap",
        },
      ]),
    });
    const urls = result.sources.map((s) => s.url);
    expect(urls.some((url) => url.includes("example.com"))).toBe(true);
    expect(urls.join(" ")).not.toMatch(/utm_source/);
    expect(result.sources.length).toBeLessThanOrEqual(6);
  });

  it("treats zero live results as empty but still builds an offline brief", async () => {
    const result = await runProductResearch({
      prompt: "Creează landing page pentru salon cu rezervări",
      provider: okProvider([]),
    });
    expect(result.brief).toBeTruthy();
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

describe("resolveProductResearchGate", () => {
  it("shows a brief for a landing page and generates immediately for a bugfix", async () => {
    const landing = await resolveProductResearchGate({
      userText: "Creează landing page pentru salon cu rezervări",
      pending: null,
      provider: null,
      messageId: "m1",
    });
    expect(landing.action).toBe("show-brief");
    if (landing.action === "show-brief") {
      expect(landing.content).toMatch(/Am înțeles produsul|Research unavailable/i);
    }

    const fix = await resolveProductResearchGate({
      userText: "Repară eroarea TypeScript",
      pending: null,
      provider: null,
      messageId: "m2",
    });
    expect(fix.action).toBe("generate");
    expect(fix.action === "generate" && fix.brief).toBeNull();
  });
});
