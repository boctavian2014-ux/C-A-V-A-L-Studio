import { AIClient } from "../ai-client";
import type { ModelRequest, ModelResponse } from "../types";

export interface TaskAgentInput {
  objective: string;
  workspaceRoot: string;
  constraints?: string[];
}

export class TaskAgent {
  constructor(private readonly client = new AIClient()) {}

  async run(input: TaskAgentInput): Promise<ModelResponse> {
    return this.client.complete({
      prompt: input.objective,
      system: "You are TaskAgent. Break work into actionable engineering tasks with file targets and acceptance criteria.",
      capability: "planning",
      intent: "agent",
      metadata: { workspaceRoot: input.workspaceRoot },
      context: { constraints: input.constraints ?? [] }
    });
  }
}
