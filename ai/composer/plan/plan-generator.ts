import { AIClient } from "../../ai-client";
import type { ComposerContext, ComposerPlan } from "../types";

export class ComposerPlanGenerator {
  constructor(private readonly ai = new AIClient()) {}

  async generate(context: ComposerContext, constraints: string[] = []): Promise<ComposerPlan> {
    const response = await this.ai.complete({
      capability: "planning",
      intent: constraints.some((constraint) => constraint.includes("tool")) ? "tool_use" : "deep_thinking",
      system: "You are Caval Composer Planner. Produce safe, logical, multi-step JSON plans for multi-file edits.",
      prompt: [
        `Objective: ${context.objective}`,
        `Relevant files: ${context.relevantFiles.join(", ")}`,
        `Affected symbols: ${context.symbols.map((symbol) => `${symbol.name}@${symbol.file}:${symbol.line}`).join(", ")}`,
        `Constraints: ${constraints.join("; ")}`,
        "Return JSON: {\"steps\":[{\"id\":\"step-1\",\"title\":\"\",\"rationale\":\"\",\"files\":[],\"symbols\":[],\"risk\":\"low\"}],\"risks\":[],\"validation\":[]}"
      ].join("\n"),
      context: {
        files: context.relevantFiles,
        symbols: context.symbols,
        notes: context.notes
      },
      metadata: {
        workspaceRoot: context.workspaceRoot
      }
    });

    return this.parse(response.content, context.objective);
  }

  private parse(content: string, objective: string): ComposerPlan {
    try {
      const parsed = JSON.parse(content) as Partial<ComposerPlan>;
      return {
        objective,
        steps: parsed.steps ?? [],
        risks: parsed.risks ?? [],
        validation: parsed.validation ?? ["typecheck", "build"]
      };
    } catch {
      return {
        objective,
        steps: content.split("\n").filter(Boolean).map((line, index) => ({
          id: `step-${index + 1}`,
          title: line,
          rationale: "Model returned plain text; converted to a plan step.",
          files: [],
          symbols: [],
          risk: "medium"
        })),
        risks: ["Plan response was not JSON."],
        validation: ["typecheck", "build"]
      };
    }
  }
}
