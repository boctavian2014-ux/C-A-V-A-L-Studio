import { describe, expect, it, vi } from "vitest";
import { FraudAgent } from "../../ai/agents/fraud-agent";

vi.mock("../../ai/ai-client", () => ({
  AIClient: class {
    complete = vi.fn().mockRejectedValue(new Error("offline — heuristic only"));
  },
}));

describe("FraudAgent", () => {
  it("flags high amount transactions", async () => {
    const agent = new FraudAgent();
    const result = await agent.evaluate({
      userId: "u1",
      transactionId: "tx1",
      amount: 15_000,
      currency: "USD"
    });
    expect(result.flags).toContain("high_amount");
    expect(result.riskScore).toBeGreaterThanOrEqual(45);
  });

  it("blocks risky transactions above threshold", async () => {
    const agent = new FraudAgent();
    const result = await agent.evaluate({
      userId: "u2",
      transactionId: "tx2",
      amount: 50_000,
      currency: "US"
    });
    expect(result.allowed).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(70);
  });

  it("flags invalid currency codes", async () => {
    const agent = new FraudAgent();
    const result = await agent.evaluate({
      userId: "u3",
      transactionId: "tx3",
      amount: 10,
      currency: "US"
    });
    expect(result.flags).toContain("invalid_currency");
  });
});
