import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import type { ModelDescriptor } from "../types";

export class OpenRouterProvider extends HttpChatProvider {
  readonly name = "openrouter";

  constructor() {
    super({
      name: "openrouter",
      apiKeyEnv: "OPENROUTER_API_KEY",
      defaultHeaders: {
        "HTTP-Referer": "https://caval.studio",
        "X-Title": "Caval Studio"
      }
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("openrouter");
  }
}
