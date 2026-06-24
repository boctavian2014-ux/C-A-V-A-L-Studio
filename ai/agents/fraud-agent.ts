import { AIClient } from "../ai-client";
import type { ModelResponse } from "../types";

export interface FraudCheckInput {
  userId: string;
  transactionId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface FraudCheckResult {
  riskScore: number;
  flags: string[];
  allowed: boolean;
  model?: ModelResponse;
}

export class FraudAgent {
  constructor(private readonly client = new AIClient()) {}

  async evaluate(input: FraudCheckInput): Promise<FraudCheckResult> {
    const flags: string[] = [];
    if (input.amount > 10_000) flags.push("high_amount");
    if (!input.currency || input.currency.length !== 3) flags.push("invalid_currency");

    let model: ModelResponse | undefined;
    try {
      model = await this.client.complete({
        prompt: JSON.stringify(input),
        system: "You are FraudAgent. Return a concise fraud risk assessment as JSON with riskScore 0-100 and flags array.",
        capability: "reasoning",
        intent: "analysis",
        temperature: 0.1
      });
    } catch {
      // fallback to heuristic only
    }

    const riskScore = Math.min(100, flags.length * 25 + (input.amount > 5000 ? 20 : 0));
    return {
      riskScore,
      flags,
      allowed: riskScore < 70,
      model
    };
  }
}
