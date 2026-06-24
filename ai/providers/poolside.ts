import { HttpChatProvider } from "./http-chat-provider";
import { getProviderProfiles } from "../model-profiles";
import type { ModelDescriptor } from "../types";

export class PoolsideProvider extends HttpChatProvider {
  readonly name = "poolside";

  constructor() {
    super({
      name: "poolside",
      apiKeyEnv: "POOLSIDE_API_KEY"
    });
  }

  models(): ModelDescriptor[] {
    return getProviderProfiles("poolside");
  }
}
