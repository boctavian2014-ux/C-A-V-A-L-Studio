import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildZeroFenceWriteError,
  shouldRetryScaffoldOnEmptyFences,
  shouldSkipGenericViteFallback,
} from "../../ai/composer/code-mode-done-contract";
import { planFinishDiskWritesForUserMessage } from "../../ai/composer/finish-disk-write-gate";
import { shouldRecoverProductWorkspaceScaffold } from "../../ai/composer/deterministic-explicit-writes";
import { shouldBlockScaffoldApplyOnDiff } from "../../ai/composer/finish-scaffold-guard";
import { looksLikeFileCreationPrompt } from "../../ai/context-engine/context-builder";
import { isAgenticPipelineMode } from "../../ai/modes/agent-modes";
import {
  resolveTrustedExecutionCapability,
  shouldGrantChatWriteTurn,
} from "../../ai/modes/execution-mode";
import { shouldAbortAutoCompletionWithoutBackend, shouldRunCompletionWithTools } from "../../ai/pipeline/model-completion";
import { shouldPersistAutoModeSwitch } from "../../ai/modes/mode-router";
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

  it("chat panel does not enable Agentic tools for Code mode", () => {
    expect(chatPanelUsesTools("code", "C:/proj", "caval-auto/free")).toBe(false);
    expect(chatPanelUsesTools("code", "C:/proj", "qwen2.5-coder:7b")).toBe(false);
    expect(chatPanelUsesTools("code", "C:/proj", "caval-auto/balanced")).toBe(false);
    expect(chatPanelUsesTools("agentic", "C:/proj", "caval-auto/balanced")).toBe(true);
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

  it("parses unambiguous hello.txt for deterministic timeout writes", async () => {
    const { parseUnambiguousSingleFileCreate } = await import(
      "../../ai/composer/code-mode-done-contract"
    );
    expect(parseUnambiguousSingleFileCreate("Creează hello.txt cu Hello")).toEqual({
      path: "hello.txt",
      content: "Hello",
    });
  });

  it("uses actionable zero-fence errors after the final retry", () => {
    expect(
      shouldRetryScaffoldOnEmptyFences({
        allowWriteFollowup: true,
        scaffoldParsed: 0,
        createIntent: true,
        canApply: true,
        autonomousFinish: true,
        canContinueRepair: false,
      })
    ).toBe(false);
    expect(buildZeroFenceWriteError("Creează hello.txt cu Hello")).toMatch(/nu generez un proiect Vite/i);
    expect(buildZeroFenceWriteError("fă un magazin de baschet")).toMatch(
      /Nu am primit fișiere valide de la model|Creează scaffold Vite minim/i
    );
  });

  it("Code stays Code — never persist-switch to Agentic", () => {
    expect(shouldPersistAutoModeSwitch("code", "agentic")).toBe(false);
    expect(shouldPersistAutoModeSwitch("code", "ask")).toBe(false);
    expect(shouldPersistAutoModeSwitch("code", "debug")).toBe(true);
    expect(shouldPersistAutoModeSwitch("ask", "code")).toBe(false);
    expect(shouldPersistAutoModeSwitch("plan", "code")).toBe(false);
  });
});

describe("Code Mode product brief without listed files", () => {
  const BRIEFS = ["fă un landing page", "fă un magazin", "fă un site de baschet"] as const;

  it("grants SCAFFOLD + finish fences/fallback without explicit filenames", () => {
    for (const userMessage of BRIEFS) {
      const capability = resolveTrustedExecutionCapability({
        userMessage,
        agentMode: "code",
      });
      expect(capability.effective, userMessage).toBe("SCAFFOLD");
      expect(shouldGrantChatWriteTurn(capability), userMessage).toBe(true);
      expect(
        looksLikeFileCreationPrompt(userMessage) || capability.effective === "SCAFFOLD",
        userMessage
      ).toBe(true);

      const plan = planFinishDiskWritesForUserMessage({
        userMessage,
        agentMode: "code",
      });
      expect(plan.applyParsedFences, userMessage).toBe(true);
      expect(plan.applyFallbackScaffold, userMessage).toBe(true);
      expect(shouldSkipGenericViteFallback(userMessage), userMessage).toBe(false);
      expect(shouldRecoverProductWorkspaceScaffold(userMessage), userMessage).toBe(true);
    }
  });

  it("Ask stays propose-only for the same brief", () => {
    const plan = planFinishDiskWritesForUserMessage({
      userMessage: "fă un landing page",
      agentMode: "ask",
    });
    expect(plan.applyParsedFences).toBe(false);
    expect(plan.applyFallbackScaffold).toBe(false);
  });
});

describe("Code Mode cloud fail-fast", () => {
  const KEYS = [
    "NVIDIA_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  function snapshotEnv(): void {
    for (const key of KEYS) saved[key] = process.env[key];
  }
  function restoreEnv(): void {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
  function clearCloudKeys(): void {
    for (const key of KEYS) delete process.env[key];
  }

  beforeEach(() => {
    snapshotEnv();
    clearCloudKeys();
  });
  afterEach(() => {
    restoreEnv();
  });

  it("does not abort Auto Balanced when NVIDIA is in env (secrets→env)", () => {
    process.env.NVIDIA_API_KEY = "nvapi-test-not-a-real-key-code";
    expect(shouldAbortAutoCompletionWithoutBackend("caval-auto/balanced", false)).toBe(false);
    expect(shouldAbortAutoCompletionWithoutBackend("caval-auto/free", false)).toBe(false);
  });

  it("aborts Auto Balanced only when neither cloud nor Ollama exists", () => {
    expect(shouldAbortAutoCompletionWithoutBackend("caval-auto/balanced", false)).toBe(true);
    expect(shouldAbortAutoCompletionWithoutBackend("caval-auto/balanced", true)).toBe(false);
  });
});
