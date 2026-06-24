import { describe, expect, it } from "vitest";
import { SuggestionsRiskEngine } from "../../ai/suggestions/suggestions-risk";
import type { ComposerContext } from "../../ai/composer/types";

const baseContext = (overrides: Partial<ComposerContext> = {}): ComposerContext => ({
  objective: "Refactor module",
  workspaceRoot: "/workspace",
  relevantFiles: ["src/a.ts"],
  symbols: [],
  contextBundle: { query: "", semanticResults: [], dependencyGraph: [], queryEmbedding: [] },
  notes: [],
  ...overrides
});

describe("SuggestionsRiskEngine", () => {
  const engine = new SuggestionsRiskEngine();

  it("flags security-sensitive objectives", () => {
    const risks = engine.assess(
      baseContext({ objective: "Improve JWT auth token validation" }),
      [],
      []
    );
    expect(risks.some((r) => r.category === "security" && r.level === "critical")).toBe(true);
  });

  it("flags breaking rename/delete impacts", () => {
    const risks = engine.assess(
      baseContext(),
      [{ symbol: "foo", kind: "function", file: "a.ts", action: "rename", description: "rename foo" }],
      []
    );
    expect(risks.some((r) => r.category === "breaking_change")).toBe(true);
  });

  it("returns low risk when no signals detected", () => {
    const risks = engine.assess(baseContext(), [], []);
    expect(risks.some((r) => r.level === "low")).toBe(true);
  });

  it("flags wide dependency footprint", () => {
    const deps = Array.from({ length: 12 }, (_, i) => `dep-${i}`);
    const risks = engine.assess(baseContext(), [], deps);
    expect(risks.some((r) => r.category === "architecture")).toBe(true);
  });
});
