import type { ComposerContext } from "../composer/types";
import type { SymbolImpact, SuggestionSummary } from "./types";

export class SuggestionsAnalyzer {
  analyze(context: ComposerContext): {
    summary: SuggestionSummary;
    symbolImpacts: SymbolImpact[];
    sideEffects: string[];
    dependencies: string[];
  } {
    const symbolImpacts = this.extractSymbolImpacts(context);
    const dependencies = this.extractDependencies(context);
    const sideEffects = this.detectSideEffects(context, symbolImpacts);
    const affectedFiles = new Set([
      ...context.relevantFiles,
      ...symbolImpacts.map((impact) => impact.file)
    ]);

    const estimatedMin = Math.max(4, symbolImpacts.length * 3);
    const estimatedMax = Math.max(12, symbolImpacts.length * 8 + context.relevantFiles.length * 2);

    return {
      summary: {
        headline: this.buildHeadline(context.objective, affectedFiles.size, symbolImpacts.length),
        affectedFileCount: affectedFiles.size,
        affectedSymbolCount: symbolImpacts.length,
        estimatedLines: { min: estimatedMin, max: estimatedMax },
        complexity: this.estimateComplexity(affectedFiles.size, symbolImpacts.length, dependencies.length)
      },
      symbolImpacts,
      sideEffects,
      dependencies
    };
  }

  private buildHeadline(objective: string, fileCount: number, symbolCount: number): string {
    const trimmed = objective.trim().slice(0, 120);
    return `AI intends to touch ${fileCount} file(s) and ${symbolCount} symbol(s) for: ${trimmed}`;
  }

  private extractSymbolImpacts(context: ComposerContext): SymbolImpact[] {
    const objective = context.objective.toLowerCase();
    const impacts: SymbolImpact[] = [];

    for (const symbol of context.symbols.slice(0, 24)) {
      const mentioned = objective.includes(symbol.name.toLowerCase());
      const action = this.inferAction(objective, symbol.name);
      impacts.push({
        symbol: symbol.name,
        kind: symbol.kind,
        file: symbol.file,
        action,
        description: mentioned
          ? `Directly referenced in request (${symbol.kind} at line ${symbol.line})`
          : `Likely impacted via ${symbol.kind} dependency chain`
      });
    }

    for (const file of context.relevantFiles.slice(0, 12)) {
      if (!impacts.some((impact) => impact.file === file)) {
        impacts.push({
          symbol: file.split("/").pop() ?? file,
          kind: "module",
          file,
          action: "modify",
          description: "Relevant module identified by context engine"
        });
      }
    }

    return impacts;
  }

  private inferAction(objective: string, symbolName: string): SymbolImpact["action"] {
    const lower = objective.toLowerCase();
    const symbol = symbolName.toLowerCase();
    if (/(rename|redenum)/.test(lower) && lower.includes(symbol)) return "rename";
    if (/(delete|remove|sterge)/.test(lower)) return "delete";
    if (/(add|create|new|adauga|creeaza)/.test(lower)) return "create";
    if (/(refactor|extract|move|optimize|fix)/.test(lower)) return "modify";
    return "reference";
  }

  private extractDependencies(context: ComposerContext): string[] {
    return context.contextBundle.dependencyGraph
      .filter((edge) =>
        context.relevantFiles.includes(edge.from) || context.relevantFiles.includes(edge.to)
      )
      .map((edge) => `${edge.from} → ${edge.to} (${edge.kind})`)
      .slice(0, 32);
  }

  private detectSideEffects(context: ComposerContext, impacts: SymbolImpact[]): string[] {
    const effects: string[] = [];
    const hasRename = impacts.some((impact) => impact.action === "rename");
    const hasDelete = impacts.some((impact) => impact.action === "delete");
    const hasPublicApi = impacts.some((impact) =>
      /service|api|client|controller|export/i.test(impact.symbol)
    );

    if (hasRename) {
      effects.push("Renaming may require updating imports and test fixtures across the workspace.");
    }
    if (hasDelete) {
      effects.push("Deletion can break downstream consumers and runtime integrations.");
    }
    if (hasPublicApi) {
      effects.push("Public API surface detected — downstream modules may need contract updates.");
    }
    if (context.relevantFiles.length > 5) {
      effects.push("Multi-file change increases merge conflict and regression risk.");
    }
    if (effects.length === 0) {
      effects.push("Localized change with limited blast radius based on current context.");
    }
    return effects;
  }

  private estimateComplexity(
    fileCount: number,
    symbolCount: number,
    dependencyCount: number
  ): SuggestionSummary["complexity"] {
    const score = fileCount + symbolCount * 0.5 + dependencyCount * 0.25;
    if (score >= 18) return "high";
    if (score >= 8) return "medium";
    return "low";
  }
}
