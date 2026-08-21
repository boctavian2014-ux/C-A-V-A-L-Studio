/**
 * Pas 7f.1 — Build unified AI provider registry snapshot (main-process).
 * Reuses secrets configured map + getLocalAiStatus — does not alter Ollama lifecycle.
 */

import { safeStorage } from "electron";

import {
  AI_PREFERRED_PROVIDER_SETTING,
  AI_PROVIDER_IDS,
  type AiProviderEntry,
  type AiProviderId,
  type AiProvidersSnapshot,
  isAiProviderId,
  mapCloudKeyConfigured,
  mapOllamaToProviderStatus,
} from "../../shared/ai-provider-contract";
import { getLocalAiStatus } from "../local-ai-setup";

export interface BuildProvidersRegistryInput {
  /** configured map from secrets-get (booleans only). */
  configured: Record<string, boolean>;
  preferredProviderId?: string | null;
  /** Injected for tests. */
  localAiStatus?: Awaited<ReturnType<typeof getLocalAiStatus>>;
  encryptionAvailable?: boolean;
}

const CLOUD_PROVIDERS: Array<{
  id: Exclude<AiProviderId, "ollama" | "custom">;
  label: string;
  description: string;
  secretKey: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models via your API key",
    secretKey: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models via your API key",
    secretKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini models via your API key",
    secretKey: "GOOGLE_API_KEY",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Multi-model hub via your API key",
    secretKey: "OPENROUTER_API_KEY",
  },
];

export function resolvePreferredProviderId(
  raw: string | null | undefined
): AiProviderId {
  if (isAiProviderId(raw) && raw !== "custom") return raw;
  return "ollama";
}

export async function buildAiProvidersSnapshot(
  input: BuildProvidersRegistryInput
): Promise<AiProvidersSnapshot> {
  const local =
    input.localAiStatus ??
    (await getLocalAiStatus());
  const encryptionAvailable =
    typeof input.encryptionAvailable === "boolean"
      ? input.encryptionAvailable
      : safeStorage.isEncryptionAvailable();

  const ollamaStatus = mapOllamaToProviderStatus({
    installed: local.installed,
    running: local.running,
    defaultModelReady: local.defaultModelReady,
    phase: local.phase,
    inProgress: local.inProgress,
  });

  const ollama: AiProviderEntry = {
    id: "ollama",
    label: "Local & Free",
    description: "Ollama — local, private, no API credits",
    status: ollamaStatus,
    selectable: true,
    detail: local.defaultModel
      ? `Model: ${local.defaultModel}`
      : undefined,
  };

  const cloud: AiProviderEntry[] = CLOUD_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    status: mapCloudKeyConfigured(Boolean(input.configured[p.secretKey])),
    selectable: true,
    secretKey: p.secretKey,
  }));

  const custom: AiProviderEntry = {
    id: "custom",
    label: "Custom OpenAI-compatible",
    description: "Base URL + API key — coming in a later release",
    status: "not-configured",
    selectable: false,
    comingSoon: true,
  };

  // Order: Ollama first, then cloud, then custom.
  const providers: AiProviderEntry[] = [ollama, ...cloud, custom];

  // Sanity: all six ids present.
  for (const id of AI_PROVIDER_IDS) {
    if (!providers.some((p) => p.id === id)) {
      throw new Error(`Provider registry missing id: ${id}`);
    }
  }

  return {
    providers,
    preferredProviderId: resolvePreferredProviderId(input.preferredProviderId),
    encryptionAvailable,
  };
}

export { AI_PREFERRED_PROVIDER_SETTING };
