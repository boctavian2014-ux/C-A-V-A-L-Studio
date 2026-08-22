/**
 * Pas 7f.1 / 7f.4 — Build unified AI provider registry snapshot (main-process).
 */

import { safeStorage } from "electron";

import { getLocalAiStatus } from "../local-ai-setup";
import { toProviderStatus, type LocalAiStatus } from "../../shared/local-ai-contract";
import {
  AI_PREFERRED_PROVIDER_SETTING,
  AI_PROVIDER_IDS,
  getCustomProviderStatus,
  type AiProviderEntry,
  type AiProviderId,
  type AiProvidersSnapshot,
  isAiProviderId,
  mapCloudKeyConfigured,
} from "../../shared/ai-provider-contract";

export interface BuildProvidersRegistryInput {
  /** configured map from secrets-get (booleans only). */
  configured: Record<string, boolean>;
  preferredProviderId?: string | null;
  /** Injected for tests. */
  localAiStatus?: LocalAiStatus;
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
  if (isAiProviderId(raw)) return raw;
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

  const ollamaStatus = toProviderStatus(local);

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

  const customStatus = getCustomProviderStatus({
    CUSTOM_PROVIDER_BASE_URL: Boolean(input.configured.CUSTOM_PROVIDER_BASE_URL),
    CUSTOM_PROVIDER_MODEL_ID: Boolean(input.configured.CUSTOM_PROVIDER_MODEL_ID),
  });

  const custom: AiProviderEntry = {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    description: "LM Studio, vLLM, LocalAI, Azure OpenAI proxy, and other OpenAI-compatible servers",
    status: customStatus,
    selectable: true,
    requiresBaseUrl: true,
    detail:
      customStatus === "configured"
        ? "Base URL and model configured"
        : undefined,
  };

  const providers: AiProviderEntry[] = [ollama, ...cloud, custom];

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
