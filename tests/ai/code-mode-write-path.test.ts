import { describe, expect, it } from "vitest";

import { shouldRetryScaffoldOnEmptyFences, shouldSkipGenericViteFallback } from "../../ai/composer/code-mode-done-contract";
import { planFinishDiskWritesForUserMessage } from "../../ai/composer/finish-disk-write-gate";
import { shouldBlockScaffoldApplyOnDiff } from "../../ai/composer/finish-scaffold-guard";
import { isAgenticPipelineMode } from "../../ai/modes/agent-modes";
import {
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
} from "../../ai/modes/execution-mode";
import { shouldRunCompletionWithTools } from "../../ai/pipeline/model-completion";
import { chatPanelUsesTools } from "../../src/main/model-handlers";

/** Documented: Code Mode stays on the single-model stream, not Memory→Compose. */
function shouldSkipMultiAgentForChat(agentMode: string): boolean {
  return !isAgenticPipelineMode(agentMode);
}

describe("Code Mode scaffold write path", () => {
  it('Code + "Creează hello.txt" is SCAFFOLD and finish applies parsed fences', () => {
    const capability = resolveTrustedExecutionCapability({
      userMessage: "Creează hello.txt cu Hello",
      agentMode: "code",
    });
    expect(capability.effective).toBe("SCAFFOLD");
    expect(shouldGrantChatWriteTurn(capability)).toBe(true);

    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "Creează hello.txt cu Hello",
      agentMode: "code",
    });
    expect(plan.applyParsedFences).toBe(true);
    expect(plan.applyFallbackScaffold).toBe(true);
  });

  it("Code mode keeps skipMultiAgent true (not the Agentic pipeline)", () => {
    expect(shouldSkipMultiAgentForChat("code")).toBe(true);
    expect(shouldSkipMultiAgentForChat("agentic")).toBe(false);
  });

  it("capability code runs tools when a registry is attached", () => {
    expect(
      shouldRunCompletionWithTools({
        capability: "code",
        useTools: true,
        toolRegistry: {} as never,
      })
    ).toBe(true);
    expect(
      shouldRunCompletionWithTools({
        capability: "code",
        useTools: true,
      })
    ).toBe(false);
  });

  it("chat panel enables tools for Code + caval-auto/free / Ollama when workspace is bound", () => {
    expect(chatPanelUsesTools("code", "C:/proj", "caval-auto/free")).toBe(true);
    expect(chatPanelUsesTools("code", "C:/proj", "qwen2.5-coder:7b")).toBe(true);
    expect(chatPanelUsesTools("ask", "C:/proj", "caval-auto/free")).toBe(false);
    expect(chatPanelUsesTools("code", "", "caval-auto/free")).toBe(false);
  });

  it("diff preview does not block SCAFFOLD fence apply", () => {
    expect(
      shouldBlockScaffoldApplyOnDiff(
        {
          applyParsedFences: true,
          applyFallbackScaffold: true,
          timeoutRecovery: false,
        },
        true
      )
    ).toBe(false);
  });

  it("empty fences on create retry instead of generic Vite for a single txt", () => {
    expect(
      shouldRetryScaffoldOnEmptyFences({
        allowWriteFollowup: true,
        scaffoldParsed: 0,
        createIntent: true,
        canApply: true,
        autonomousFinish: true,
        canContinueRepair: true,
      })
    ).toBe(true);
    expect(shouldSkipGenericViteFallback("Creează hello.txt cu Hello")).toBe(true);
    expect(shouldSkipGenericViteFallback("Creează un proiect Vite complet")).toBe(false);
  });
});
