import type { SuggestionAlternative, SuggestionSummary } from "./types";

export class SuggestionsAlternativesEngine {
  generate(summary: SuggestionSummary, objective: string): SuggestionAlternative[] {
    const baseFiles = Math.max(1, summary.affectedFileCount);
    const baseLines = summary.estimatedLines;

    return [
      {
        id: "alt-minimal",
        strategy: "minimal",
        title: "Minimal fix",
        summary: `Smallest viable change to satisfy: ${objective.slice(0, 80)}`,
        pros: ["Lowest regression risk", "Fastest to review", "Minimal diff size"],
        cons: ["May leave technical debt", "Might not address root cause"],
        estimatedFiles: Math.max(1, Math.ceil(baseFiles * 0.4)),
        estimatedLines: {
          min: Math.max(2, Math.floor(baseLines.min * 0.3)),
          max: Math.max(6, Math.floor(baseLines.max * 0.45))
        }
      },
      {
        id: "alt-optimized",
        strategy: "optimized",
        title: "Balanced optimization",
        summary: "Refactor affected symbols with maintainability and performance in mind.",
        pros: ["Better long-term structure", "Addresses likely root cause", "Moderate scope"],
        cons: ["Larger review surface", "Requires more validation"],
        estimatedFiles: baseFiles,
        estimatedLines: baseLines,
        recommended: true
      },
      {
        id: "alt-complete",
        strategy: "complete",
        title: "Complete solution",
        summary: "End-to-end update including types, tests, and documentation where needed.",
        pros: ["Highest completeness", "Reduces follow-up patches", "Better team alignment"],
        cons: ["Longest generation time", "Highest review effort"],
        estimatedFiles: Math.ceil(baseFiles * 1.4),
        estimatedLines: {
          min: Math.ceil(baseLines.min * 1.2),
          max: Math.ceil(baseLines.max * 1.8)
        }
      },
      {
        id: "alt-aggressive",
        strategy: "aggressive",
        title: "Aggressive refactor",
        summary: "Broad restructuring of modules and public contracts for maximum improvement.",
        pros: ["Maximum architectural payoff", "Can eliminate legacy patterns"],
        cons: ["High breaking-change risk", "May require migration plan"],
        estimatedFiles: Math.ceil(baseFiles * 2),
        estimatedLines: {
          min: Math.ceil(baseLines.min * 1.5),
          max: Math.ceil(baseLines.max * 2.5)
        }
      }
    ];
  }
}
