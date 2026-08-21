/**
 * Pas 7f.4 — OpenAI-compatible custom endpoint (LM Studio, vLLM, LocalAI, etc.).
 * Reuses HttpChatProvider SSE/stream parsing — no second HTTP client.
 */

import { HttpChatProvider } from "./http-chat-provider";
import type { CustomProviderConfig } from "../../src/shared/ai-provider-contract";
import { normalizeCustomBaseUrl } from "../../src/shared/ai-provider-contract";
import type { ModelDescriptor } from "../types";

export class CustomOpenAiCompatibleProvider extends HttpChatProvider {
  readonly name = "custom";

  constructor(private readonly customConfig: CustomProviderConfig) {
    super({
      name: "custom",
      apiKeyEnv: "CUSTOM_PROVIDER_API_KEY",
      apiKey: customConfig.apiKey,
    });
  }

  models(): ModelDescriptor[] {
    const base = normalizeCustomBaseUrl(this.customConfig.baseUrl);
    return [
      {
        id: `custom/${this.customConfig.modelId}`,
        displayName: this.customConfig.label || this.customConfig.modelId,
        provider: "custom",
        capabilities: ["chat"],
        priority: 40,
        contextWindow: 32_768,
        supportsStreaming: true,
        supportsToolCalling: true,
        preferredIntents: ["agent"],
        endpoint: `${base}/chat/completions`,
        providerModelId: this.customConfig.modelId,
      },
    ];
  }
}

export function createCustomProvider(config: CustomProviderConfig): CustomOpenAiCompatibleProvider {
  return new CustomOpenAiCompatibleProvider({
    ...config,
    baseUrl: normalizeCustomBaseUrl(config.baseUrl),
    modelId: config.modelId.trim(),
    label: (config.label || "Custom").trim() || "Custom",
    apiKey: config.apiKey?.trim() || undefined,
  });
}

/** Probe OpenAI-compatible `/models` (or base) without saving secrets. */
export async function probeCustomProviderConnection(input: {
  baseUrl: string;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true } | { ok: false; result: "invalid" | "unreachable" }> {
  const base = normalizeCustomBaseUrl(input.baseUrl);
  const modelsUrl = `${base}/models`;
  try {
    const res = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        ...(input.apiKey?.trim()
          ? { authorization: `Bearer ${input.apiKey.trim()}` }
          : {}),
      },
      signal: input.signal ?? AbortSignal.timeout(3_000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, result: "invalid" };
    }
    if (!res.ok) {
      // Some servers lack /models — try a lightweight OPTIONS/HEAD fallback via chat path existence.
      if (res.status === 404) {
        const chatProbe = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(input.apiKey?.trim()
              ? { authorization: `Bearer ${input.apiKey.trim()}` }
              : {}),
          },
          body: JSON.stringify({ model: "probe", messages: [], max_tokens: 1 }),
          signal: input.signal ?? AbortSignal.timeout(3_000),
        });
        if (chatProbe.status === 401 || chatProbe.status === 403) {
          return { ok: false, result: "invalid" };
        }
        // 400/422 means the server is reachable and parsing our request.
        if (chatProbe.status < 500) return { ok: true };
        return { ok: false, result: "unreachable" };
      }
      return { ok: false, result: "unreachable" };
    }
    return { ok: true };
  } catch {
    return { ok: false, result: "unreachable" };
  }
}
