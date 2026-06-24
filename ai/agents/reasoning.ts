import { AIClient } from "../ai-client";

export interface ReasoningTask {
  question: string;
  evidence: string[];
  expectedOutput: "decision" | "plan" | "risk-assessment";
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export class ReasoningAgent {
  constructor(private readonly ai = new AIClient()) {}

  async run(task: ReasoningTask): Promise<string> {
    const response = await this.ai.complete({
      capability: "reasoning",
      intent: "deep_thinking",
      system: [
        "Esti Caval Reasoning.",
        "Fa rationamentul intern, dar returneaza doar concluzia verificabila, planul sau evaluarea de risc.",
        "Citeaza dovezile furnizate si cere tool calls cand lipsesc probe."
      ].join("\n"),
      prompt: task.question,
      context: { ...task },
      tools: task.tools
    });

    return response.content;
  }
}
