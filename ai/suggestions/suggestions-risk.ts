import type { ComposerContext } from "../composer/types";
import type { SuggestionRisk, SymbolImpact } from "./types";

export class SuggestionsRiskEngine {
  assess(
    context: ComposerContext,
    symbolImpacts: SymbolImpact[],
    dependencies: string[]
  ): SuggestionRisk[] {
    const risks: SuggestionRisk[] = [];
    const objective = context.objective.toLowerCase();

    if (symbolImpacts.some((impact) => impact.action === "rename" || impact.action === "delete")) {
      risks.push({
        id: "risk-breaking",
        category: "breaking_change",
        level: "high",
        title: "Potential breaking change",
        description: "Rename or delete operations can break imports, tests, and external integrations.",
        mitigation: "Prefer additive changes or provide compatibility shims before removal."
      });
    }

    if (dependencies.length > 10) {
      risks.push({
        id: "risk-architecture",
        category: "architecture",
        level: "medium",
        title: "Wide dependency footprint",
        description: `${dependencies.length} dependency edges intersect the affected scope.`,
        mitigation: "Stage changes per module and validate dependency graph after each step."
      });
    }

    if (/(auth|token|password|secret|jwt|crypto)/.test(objective)) {
      risks.push({
        id: "risk-security",
        category: "security",
        level: "critical",
        title: "Security-sensitive area",
        description: "Request touches authentication, secrets, or cryptographic flows.",
        mitigation: "Run security review and avoid logging sensitive values."
      });
    }

    if (/(performance|optimize|cache|latency|memory)/.test(objective)) {
      risks.push({
        id: "risk-performance",
        category: "performance",
        level: "medium",
        title: "Performance regression risk",
        description: "Optimization changes may trade readability for speed or introduce hot-path regressions.",
        mitigation: "Benchmark critical paths and add regression tests."
      });
    }

    if (context.relevantFiles.length > 1) {
      risks.push({
        id: "risk-side-effect",
        category: "side_effect",
        level: "medium",
        title: "Cross-file side effects",
        description: "Multiple files may change together, increasing unintended coupling.",
        mitigation: "Review each file independently before proceeding to patch generation."
      });
    }

    if (risks.length === 0) {
      risks.push({
        id: "risk-low",
        category: "architecture",
        level: "low",
        title: "Low structural risk",
        description: "Current analysis shows a contained change with limited architectural impact.",
        mitigation: "Proceed with standard validation after patch generation."
      });
    }

    return risks;
  }
}
