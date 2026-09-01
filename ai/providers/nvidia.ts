import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import { NVIDIA_NIM_BASE_URL } from "../models/nvidia-nim-catalog";
import type { ModelDescriptor, ModelRequest } from "../types";
import { probeCustomProviderConnection } from "./custom-openai-compatible";

export { NVIDIA_NIM_BASE_URL, NVIDIA_NIM_CHAT_COMPLETIONS_URL } from "../models/nvidia-nim-catalog";

export class NvidiaProvider extends HttpChatProvider {
  readonly name = "nvidia";

  constructor() {
    super({
      name: "nvidia",
      apiKeyEnv: "NVIDIA_API_KEY",
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("nvidia");
  }

  protected override payload(
    request: ModelRequest,
    model: ModelDescriptor,
    stream: boolean
  ): Record<string, unknown> {
    const base = super.payload(request, model, stream);
    if (model.id !== "nvidia-nemotron-3-ultra") {
      return base;
    }
    return {
      ...base,
      extra_body: {
        reasoning_mode:
          request.intent === "debug" || request.intent === "analysis" ? "debug" : "balanced",
      },
    };
  }
}

/** Reuses the OpenAI-compatible probe against the fixed NIM base URL. */
export function probeNvidiaNimConnection(input: {
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true } | { ok: false; result: "invalid" | "unreachable" }> {
  return probeCustomProviderConnection({
    baseUrl: NVIDIA_NIM_BASE_URL,
    apiKey: input.apiKey,
    signal: input.signal,
  });
}
