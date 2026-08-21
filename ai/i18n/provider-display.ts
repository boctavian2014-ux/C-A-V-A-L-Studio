import type { AiProviderId, ProviderStatus } from "../../src/shared/ai-provider-contract";
import type { MessageKey, TranslateFn } from "./index";

const PROVIDER_LABEL_KEYS: Record<AiProviderId, MessageKey> = {
  ollama: "ai.providers.ollama.label",
  openai: "ai.providers.openai.label",
  anthropic: "ai.providers.anthropic.label",
  gemini: "ai.providers.gemini.label",
  openrouter: "ai.providers.openrouter.label",
  custom: "ai.providers.custom.label",
};

const PROVIDER_DESC_KEYS: Record<AiProviderId, MessageKey> = {
  ollama: "ai.providers.ollama.desc",
  openai: "ai.providers.openai.desc",
  anthropic: "ai.providers.anthropic.desc",
  gemini: "ai.providers.gemini.desc",
  openrouter: "ai.providers.openrouter.desc",
  custom: "ai.providers.custom.desc",
};

const STATUS_KEYS: Record<ProviderStatus, MessageKey> = {
  configured: "ai.status.configured",
  "not-configured": "ai.status.not-configured",
  starting: "ai.status.starting",
  unavailable: "ai.status.unavailable",
  "not-installed": "ai.status.not-installed",
  "model-missing": "ai.status.model-missing",
};

export function providerDisplayLabel(id: AiProviderId, t: TranslateFn): string {
  if (id === "ollama") return t("ai.providers.ollama.title");
  return t(PROVIDER_LABEL_KEYS[id]);
}

export function providerDisplayDescription(id: AiProviderId, t: TranslateFn): string {
  return t(PROVIDER_DESC_KEYS[id]);
}

export function providerStatusDisplay(status: ProviderStatus, t: TranslateFn): string {
  return t(STATUS_KEYS[status] ?? "ai.status.unavailable");
}
