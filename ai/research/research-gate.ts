import type { AgentModeId } from "../modes/agent-modes";
import { isStrictReadOnlyUiMode, uiModeGrantsCreateWrites } from "../modes/execution-mode";
import { applyDirectionRefinement, isBuildConfirmText, isDirectionRefinementText } from "./product-brief";
import { runProductResearch } from "./research-orchestrator";
import { recordBriefAccepted, recordGenerationStarted } from "./research-metrics";
import type { PendingProductResearch, ProductIntentClassifier, ProductResearchBrief, ProductWorkspaceContext } from "./types";
import type { WebResearchHost, WebResearchProvider } from "./web-research-provider";

export type AgenticAvailabilityHost = {
  getAgenticAvailability?: () => Promise<{ ok?: boolean; available?: boolean }>;
};

export type ProductResearchGate =
  | { action: "generate"; brief: ProductResearchBrief | null; prompt: string }
  | { action: "show-brief"; pending: PendingProductResearch; content: string }
  | { action: "update-brief"; pending: PendingProductResearch; content: string };

function cardCopy(brief: ProductResearchBrief, agentMode?: AgentModeId | string): string {
  const status =
    brief.researchStatus === "unavailable" || brief.researchStatus === "timeout"
      ? "Research unavailable"
      : brief.researchStatus === "empty"
        ? "Research unavailable"
        : "";
  const question = brief.clarifyingQuestion ? `\n\n${brief.clarifyingQuestion}` : "";
  const readOnlyHint = isStrictReadOnlyUiMode(agentMode)
    ? "\n\nPentru a construi proiectul, schimbă în Code sau folosește o acțiune explicită „Open in Code”."
    : "";
  return [
    "Am înțeles produsul.",
    status,
    question,
    readOnlyHint,
  ]
    .filter(Boolean)
    .join(" ");
}

function rendererCaval(): AgenticAvailabilityHost | undefined {
  const g = globalThis as { caval?: AgenticAvailabilityHost };
  return g.caval;
}

/** Safe default is unavailable (Code mode) when IPC is missing or fails. */
export async function queryAgenticCloudProviderAvailable(
  host?: AgenticAvailabilityHost
): Promise<boolean> {
  const api = host ?? rendererCaval();
  if (!api?.getAgenticAvailability) return false;
  try {
    const result = await api.getAgenticAvailability();
    return result?.ok === true && result.available === true;
  } catch {
    return false;
  }
}

export function shouldUseCodeInsteadOfAgentic(mode: string, hasCloud: boolean): boolean {
  return mode === "agentic" && !hasCloud;
}

export async function resolveProductBuildMode(
  mode: AgentModeId,
  host?: AgenticAvailabilityHost
): Promise<AgentModeId> {
  if (mode !== "agentic") return mode;
  const available = await queryAgenticCloudProviderAvailable(host);
  return shouldUseCodeInsteadOfAgentic(mode, available) ? "code" : mode;
}

export async function resolveProductResearchGate(input: {
  userText: string;
  pending: PendingProductResearch | null;
  workspaceContext?: string | ProductWorkspaceContext;
  classify?: ProductIntentClassifier;
  provider?: WebResearchProvider | null;
  host?: WebResearchHost;
  messageId: string;
  agentMode?: AgentModeId | string;
}): Promise<ProductResearchGate> {
  const pending = input.pending;
  if (pending?.phase === "accepted") {
    recordGenerationStarted();
    return { action: "generate", brief: pending.brief, prompt: pending.originalPrompt };
  }

  if (pending?.phase === "awaiting-confirm") {
    if (isBuildConfirmText(input.userText)) {
      recordBriefAccepted();
      recordGenerationStarted();
      return {
        action: "generate",
        brief: pending.brief,
        prompt: pending.originalPrompt,
      };
    }
    if (isDirectionRefinementText(input.userText)) {
      const brief = applyDirectionRefinement(pending.brief, input.userText);
      const next: PendingProductResearch = { ...pending, brief };
      return { action: "update-brief", pending: next, content: cardCopy(brief, input.agentMode) };
    }
  }

  const run = await runProductResearch({
    prompt: input.userText,
    workspaceContext: input.workspaceContext,
    classify: input.classify,
    provider: input.provider,
    host: input.host,
  });

  if (!run.intent.shouldResearch || !run.brief) {
    return { action: "generate", brief: null, prompt: input.userText };
  }

  // Code / Agentic / Debug: infer files and write immediately — do not wait for confirm.
  if (uiModeGrantsCreateWrites(input.agentMode)) {
    recordGenerationStarted();
    return { action: "generate", brief: run.brief, prompt: input.userText };
  }

  const next: PendingProductResearch = {
    originalPrompt: input.userText,
    intent: run.intent,
    brief: run.brief,
    phase: "awaiting-confirm",
    messageId: input.messageId,
  };
  return { action: "show-brief", pending: next, content: cardCopy(run.brief, input.agentMode) };
}
