import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import type { ModelDescriptor, ModelRequest } from "../types";

export class OpenRouterProvider extends HttpChatProvider {
  readonly name = "openrouter";

  constructor() {
    super({
      name: "openrouter",
      apiKeyEnv: "OPENROUTER_API_KEY",
      defaultHeaders: {
        "HTTP-Referer": "https://caval.studio",
        "X-Title": "CAVALLO Studio"
      }
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("openrouter");
  }

  protected payload(request: ModelRequest, model: ModelDescriptor, stream: boolean): Record<string, unknown> {
    const base = {
      ...super.payload(request, model, stream),
      provider: { sort: "latency" },
      max_tokens: request.maxTokens ?? 8192,
    };
    if (stream && request.metadata?.responseFormat !== "json_object") {
      return {
        ...base,
        reasoning: { effort: model.capabilities.includes("reasoning") ? "medium" : "low" },
      };
    }
    return base;
  }
}
