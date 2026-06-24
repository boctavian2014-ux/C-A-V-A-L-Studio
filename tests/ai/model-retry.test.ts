import { describe, expect, it } from "vitest";
import { ModelRetryPolicy } from "../../ai/model-retry";

describe("ModelRetryPolicy", () => {
  const policy = new ModelRetryPolicy(3);

  it("switches provider when model appears down", () => {
    const decision = policy.decide(new Error("HTTP 503 service unavailable"), 0);
    expect(decision.retrySameModel).toBe(false);
    expect(decision.switchProvider).toBe(true);
  });

  it("retries same model on 429 at attempt 0", () => {
    const decision = policy.decide(new Error("HTTP 429 rate limited"), 0);
    expect(decision.retrySameModel).toBe(true);
  });

  it("switches model on second attempt", () => {
    const decision = policy.decide(new Error("timeout"), 1);
    expect(decision.switchModel).toBe(true);
    expect(decision.retrySameModel).toBe(false);
  });

  it("stops retrying at max attempts", () => {
    const decision = policy.decide(new Error("504 gateway"), 2);
    expect(decision.retrySameModel).toBe(false);
    expect(decision.switchModel).toBe(true);
  });

  it("does not retry non-retryable errors", () => {
    const decision = policy.decide(new Error("invalid API key"), 0);
    expect(decision.reason).toMatch(/not retryable/i);
  });
});
