import { AIClient } from "../ai-client";
import type { ModelResponse } from "../types";

export interface CampaignAgentInput {
  campaignName: string;
  audience: string;
  goals: string[];
}

export class CampaignAgent {
  constructor(private readonly client = new AIClient()) {}

  async plan(input: CampaignAgentInput): Promise<ModelResponse> {
    return this.client.complete({
      prompt: [
        `Campaign: ${input.campaignName}`,
        `Audience: ${input.audience}`,
        `Goals: ${input.goals.join("; ")}`
      ].join("\n"),
      system: "You are CampaignAgent. Produce a launch plan with channels, messaging, and measurable KPIs.",
      capability: "reasoning",
      intent: "planning"
    });
  }
}
