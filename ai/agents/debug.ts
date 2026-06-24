import { AIClient } from "../ai-client";

export interface DebugSignal {
  source: "runtime" | "lint" | "test" | "user-report";
  message: string;
  file?: string;
}

export class DebugAgent {
  constructor(private readonly ai = new AIClient()) {}

  async diagnose(signals: DebugSignal[]): Promise<string> {
    const response = await this.ai.complete({
      capability: "debug",
      intent: "debug",
      system: "Esti Caval Debug, optimizat pentru Nemotron-3 Ultra. Identifica bug-uri, cauza probabila, probe si fix minim.",
      prompt: "Diagnosticheaza problema pe baza semnalelor.",
      context: { signals }
    });

    return response.content;
  }

  async suggestFix(signals: DebugSignal[], files: string[]): Promise<string> {
    const response = await this.ai.complete({
      capability: "debug",
      intent: "analysis",
      system: "Propune un fix minim si un plan de validare. Nu aplica modificari.",
      prompt: "Sugereaza fix-uri pentru bug-urile detectate.",
      context: { signals, files }
    });

    return response.content;
  }
}
