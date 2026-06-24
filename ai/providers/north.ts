import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import type { ModelDescriptor, ModelRequest } from "../types";

export class NorthProvider extends HttpChatProvider {
  readonly name = "north";

  constructor() {
    super({
      name: "north",
      apiKeyEnv: "NORTH_API_KEY"
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("north");
  }

  protected override payload(request: ModelRequest, model: ModelDescriptor, stream: boolean): Record<string, unknown> {
    return {
      ...super.payload(request, model, stream),
      latency_mode: "low",
      temperature: request.temperature ?? 0.1
    };
  }
}
