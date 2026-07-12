import { randomUUID } from "node:crypto";
import { AIClient } from "../ai-client";
import { SuggestionsAlternativesEngine } from "./suggestions-alternatives";
import { SuggestionsAnalyzer } from "./suggestions-analyzer";
import { SuggestionsRiskEngine } from "./suggestions-risk";
import type { SuggestionsBundle, SuggestionsGenerateInput } from "./types";

export class SuggestionsGenerator {
  constructor(
    private readonly analyzer = new SuggestionsAnalyzer(),
    private readonly riskEngine = new SuggestionsRiskEngine(),
    private readonly alternativesEngine = new SuggestionsAlternativesEngine(),
    private readonly ai = new AIClient()
  ) {}

  async generate(input: SuggestionsGenerateInput): Promise<SuggestionsBundle> {
    const analysis = this.analyzer.analyze(input.context);
    const risks = this.riskEngine.assess(input.context, analysis.symbolImpacts, analysis.dependencies);
    const alternatives = this.alternativesEngine.generate(analysis.summary, input.request);

    let aiNarrative = "";
    try {
      const response = await this.ai.complete({
        capability: "reasoning",
        intent: "deep_thinking",
        system: "You are the CAVALLO Studio AI Suggestions Engine. Analyze the request and codebase BEFORE generating patches. Provide suggestions, risks, alternatives, and estimated impact. Never generate code or patches.",
        prompt: [
          `User request: ${input.request}`,
          `Summary: ${analysis.summary.headline}`,
          `Affected symbols: ${analysis.symbolImpacts.map((s) => s.symbol).join(", ")}`,
          `Risks: ${risks.map((r) => r.title).join("; ")}`,
          "Respond with a concise 3-5 sentence conceptual preview for the developer."
        ].join("\n"),
        metadata: { workspaceRoot: input.workspaceRoot }
      });
      aiNarrative = response.content.trim();
    } catch {
      aiNarrative = analysis.summary.headline;
    }

    return {
      id: randomUUID(),
      request: input.request,
      workspaceRoot: input.workspaceRoot,
      context: input.context,
      summary: {
        ...analysis.summary,
        headline: aiNarrative || analysis.summary.headline
      },
      symbolImpacts: analysis.symbolImpacts,
      risks,
      alternatives,
      sideEffects: analysis.sideEffects,
      dependencies: analysis.dependencies,
      createdAt: new Date().toISOString(),
      status: "pending",
      selectedAlternativeId: alternatives.find((alt) => alt.recommended)?.id ?? "alt-optimized"
    };
  }
}
