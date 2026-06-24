import { AIClient } from "../../ai-client";
import { SafetyGuard } from "../../safety/guard";
import type { ComposerContext, ComposerPatchSet, ComposerPlan } from "../types";

export class ComposerPatchGenerator {
  constructor(
    private readonly ai = new AIClient(),
    private readonly safety = new SafetyGuard()
  ) {}

  async generate(plan: ComposerPlan, context: ComposerContext): Promise<ComposerPatchSet> {
    const response = await this.ai.complete({
      capability: "patching",
      intent: "multi_file",
      system: "You are Caval Patch Generator. Return strict JSON with unified diffs or fullContent per file.",
      prompt: [
        `Objective: ${plan.objective}`,
        `Steps: ${JSON.stringify(plan.steps)}`,
        `Relevant files: ${context.relevantFiles.join(", ")}`,
        "Return JSON: {\"summary\":\"\",\"files\":[{\"path\":\"relative.ts\",\"patch\":\"unified diff\",\"fullContent\":\"optional\",\"semanticSummary\":\"\"}]}"
      ].join("\n"),
      context: {
        plan,
        symbols: context.symbols,
        notes: context.notes
      },
      metadata: {
        workspaceRoot: context.workspaceRoot
      }
    });

    const patchSet = this.parse(response.content);
    this.safety.assertPatchAllowed(patchSet.files);
    return patchSet;
  }

  private parse(content: string): ComposerPatchSet {
    try {
      const parsed = JSON.parse(content) as Partial<ComposerPatchSet>;
      return {
        summary: parsed.summary ?? "Generated patch set",
        files: parsed.files ?? []
      };
    } catch {
      return {
        summary: content,
        files: []
      };
    }
  }
}
