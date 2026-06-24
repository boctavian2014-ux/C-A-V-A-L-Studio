import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import type { ModelDescriptor, ModelRequest } from "../types";

export class NvidiaProvider extends HttpChatProvider {
  readonly name = "nvidia";

  constructor() {
    super({
      name: "nvidia",
      apiKeyEnv: "NVIDIA_API_KEY"
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("nvidia");
  }

  protected override payload(request: ModelRequest, model: ModelDescriptor, stream: boolean): Record<string, unknown> {
    return {
      ...super.payload(request, model, stream),
      extra_body: {
        reasoning_mode: request.intent === "debug" || request.intent === "analysis" ? "debug" : "balanced"
      }
    };
  }
}
