import fs from "node:fs";
import path from "node:path";
import { AIClient } from "../../../ai/ai-client";
import type { LogicFlowExplainRequest, LogicFlowExplainResponse } from "./types";

const FALLBACK: Record<LogicFlowExplainRequest["nodeId"], string> = {
  suggestions:
    "AI Suggestions analyzes your Composer objective, expands context, and proposes alternatives before any plan or patch is generated. It activates in Plan mode when phase is awaiting_suggestions. Use the AI Suggestions side panel to approve or proceed via caval:suggestions-proceed.",
  composer:
    "AI Composer generates the implementation plan and unified diff patches after suggestions are approved. It runs context expansion, plan validation, patch generation, and conflict resolution. In the pipeline view it is active while plan/patch work is in progress.",
  review:
    "Code Review presents generated patches for human approval before apply. It activates at awaiting_review. Use the Code Review panel to accept/reject files, hunks, or lines, then apply via caval:review-apply.",
  debug:
    "AI Debug explains build, lint, and runtime errors and suggests minimal fixes. It supports Mobile Build and future Composer validation failures. It is the support stage after review when errors need diagnosis."
};

const loadSystemPrompt = (): string => {
  const candidates = [
    path.join(process.cwd(), "components", "ui", "logicflow", "prompts", "logicflow-explain.md"),
    path.join(__dirname, "..", "..", "components", "ui", "logicflow", "prompts", "logicflow-explain.md")
  ];
  for (const candidate of candidates) {
    try {
      return fs.readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
  }
  return "Explain Caval Studio Composer pipeline nodes clearly and concisely.";
};

export class LogicFlowAgent {
  private readonly system = loadSystemPrompt();

  constructor(private readonly ai = new AIClient()) {}

  async explainNode(request: LogicFlowExplainRequest): Promise<LogicFlowExplainResponse> {
    try {
      const response = await this.ai.complete({
        capability: "documentation",
        intent: "analysis",
        system: this.system,
        prompt: `Explain pipeline node "${request.label}" (${request.nodeId}).`,
        context: {
          nodeId: request.nodeId,
          label: request.label,
          description: request.description,
          composerPhase: request.context?.composerPhase,
          workspaceRoot: request.context?.workspaceRoot
        }
      });

      return { ok: true, content: response.content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        content: FALLBACK[request.nodeId],
        error: message
      };
    }
  }
}

export const logicFlowAgent = new LogicFlowAgent();
