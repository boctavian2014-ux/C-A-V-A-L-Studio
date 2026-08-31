/**
 * Agentic routing: tool-capable cloud only. Never auto-select local Qwen 7B.
 */

import { getModelProfile } from "../model-profiles";
import type { ModelRequest, RoutingIntent } from "../types";
import {
  AGENTIC_NVIDIA_FALLBACK_PROFILE_ID,
  AGENTIC_NVIDIA_PRIMARY_PROFILE_ID,
  LOCAL_OFFLINE_PROFILE_ID,
} from "./nvidia-nim-catalog";
import { hasOpenRouterKey } from "./model-readiness";
import { hasProviderCredentials } from "./provider-credentials";

export const AGENTIC_PROVIDER_REQUIRED = "AGENTIC_PROVIDER_REQUIRED";

export const AGENTIC_PROVIDER_REQUIRED_MESSAGE =
  "Agentic mode needs a tool-capable cloud provider (NVIDIA NIM, OpenRouter, or BYOK). Local Qwen 7B is for Ask, basic Code, autocomplete, and offline only. Open Settings → AI Providers to configure NVIDIA NIM.";

const OPENROUTER_AGENTIC_PROFILE_IDS = ["stepfun-step-3-7-flash", "nex-n2-pro"] as const;

export class AgenticProviderRequiredError extends Error {
  readonly code = AGENTIC_PROVIDER_REQUIRED;
  readonly action = "configure_nvidia_nim" as const;
  readonly settingsPath = "AI Providers";

  constructor(message = AGENTIC_PROVIDER_REQUIRED_MESSAGE) {
    super(message);
    this.name = "AgenticProviderRequiredError";
  }
}

export function isAgenticProviderRequiredError(
  error: unknown
): error is AgenticProviderRequiredError {
  return (
    error instanceof AgenticProviderRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === AGENTIC_PROVIDER_REQUIRED)
  );
}

export function isAgenticRoutingIntent(intent?: RoutingIntent): boolean {
  return intent === "agent" || intent === "tool_use";
}

export function isAgenticExecution(input: {
  mode?: string;
  intent?: RoutingIntent;
  capability?: string;
  tools?: unknown[] | null;
  useTools?: boolean;
}): boolean {
  if (input.mode === "agentic") return true;
  if (isAgenticRoutingIntent(input.intent)) return true;
  if (input.capability === "tool_use") return true;
  if (input.mode === "agentic" && (input.useTools || (input.tools && input.tools.length > 0))) {
    return true;
  }
  return false;
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/** Cloud BYOK (not Ollama). Does not return key material. */
export function hasAgenticByokCredentials(): boolean {
  return (
    envPresent("ANTHROPIC_API_KEY") || envPresent("OPENAI_API_KEY") || envPresent("GOOGLE_API_KEY")
  );
}

export function hasAgenticCloudProvider(): boolean {
  return (
    hasProviderCredentials("nvidia") ||
    hasOpenRouterKey() ||
    hasAgenticByokCredentials()
  );
}

function firstByokCloudModelId(): string | undefined {
  if (envPresent("ANTHROPIC_API_KEY")) return "claude-sonnet-4";
  if (envPresent("OPENAI_API_KEY")) return "gpt-4o";
  if (envPresent("GOOGLE_API_KEY")) return "gemini-2.5-flash";
  return undefined;
}

export function isForbiddenAgenticFallback(modelId: string): boolean {
  if (!modelId.trim()) return true;
  if (modelId === LOCAL_OFFLINE_PROFILE_ID || modelId === "ollama-local") return true;
  const profile = getModelProfile(modelId);
  if (!profile) {
    return modelId.includes("qwen2.5-coder:7b");
  }
  if (profile.provider === "open_source" || profile.costEstimate === "local") return true;
  if (!profile.supportsToolCalling) return true;
  return false;
}

/**
 * Ordered Agentic candidates: NVIDIA DeepSeek Flash → NVIDIA Qwen 3.5 → OpenRouter tool models → BYOK.
 */
export function listAgenticEligibleModelIds(): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!id || seen.has(id) || isForbiddenAgenticFallback(id)) return;
    seen.add(id);
    ids.push(id);
  };

  if (hasProviderCredentials("nvidia")) {
    add(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);
    add(AGENTIC_NVIDIA_FALLBACK_PROFILE_ID);
  }
  if (hasOpenRouterKey()) {
    for (const id of OPENROUTER_AGENTIC_PROFILE_IDS) add(id);
  }
  const byok = firstByokCloudModelId();
  if (byok) add(byok);

  return ids;
}

export function assertAgenticProvidersReady(): void {
  if (!hasAgenticCloudProvider() || listAgenticEligibleModelIds().length === 0) {
    throw new AgenticProviderRequiredError();
  }
}

export function orderAgenticTryList(resolvedModelId: string): string[] {
  const eligible = listAgenticEligibleModelIds();
  if (eligible.includes(resolvedModelId)) {
    return [resolvedModelId, ...eligible.filter((id) => id !== resolvedModelId)];
  }
  return eligible;
}

export function toAgenticUiError(error: unknown): {
  ok: false;
  error: string;
  code: typeof AGENTIC_PROVIDER_REQUIRED;
  action: "configure_nvidia_nim";
} {
  const err =
    error instanceof AgenticProviderRequiredError
      ? error
      : new AgenticProviderRequiredError();
  return {
    ok: false,
    error: err.message,
    code: AGENTIC_PROVIDER_REQUIRED,
    action: err.action,
  };
}

export function requestLooksAgentic(request: Pick<ModelRequest, "intent" | "capability" | "tools">): boolean {
  return isAgenticExecution({
    intent: request.intent,
    capability: request.capability,
    tools: request.tools,
  });
}
