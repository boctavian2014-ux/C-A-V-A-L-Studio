import fs from "node:fs/promises";
import path from "node:path";
import type { ComposerContext, ComposerDiagnostic, ComposerPlan } from "../types";

export class PlanValidator {
  async validate(plan: ComposerPlan, context: ComposerContext): Promise<ComposerDiagnostic[]> {
    const diagnostics: ComposerDiagnostic[] = [];

    if (plan.steps.length === 0) {
      diagnostics.push({ level: "error", source: "plan-validator", message: "Plan has no steps." });
    }

    for (const step of plan.steps) {
      if (!step.title.trim()) {
        diagnostics.push({ level: "error", source: "plan-validator", message: `Step ${step.id} has no title.` });
      }

      for (const file of step.files) {
        try {
          await fs.access(path.resolve(context.workspaceRoot, file));
        } catch {
          diagnostics.push({ level: "warning", source: "plan-validator", message: `Referenced file does not exist: ${file}`, file });
        }
      }

      for (const symbol of step.symbols) {
        if (!context.symbols.some((candidate) => candidate.name === symbol)) {
          diagnostics.push({ level: "warning", source: "plan-validator", message: `Referenced symbol not found in context: ${symbol}` });
        }
      }
    }

    return diagnostics;
  }
}
