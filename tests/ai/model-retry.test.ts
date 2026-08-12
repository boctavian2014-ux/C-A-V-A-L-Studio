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
    expect(decision.switchModel).toBe(false);
    expect(decision.switchProvider).toBe(false);
  });

  it("counts 429 retries and stops at max attempts", () => {
    const first = policy.decide(new Error("HTTP 429 rate limited"), 0);
    const second = policy.decide(new Error("HTTP 429 rate limited"), 1);
    const last = policy.decide(new Error("HTTP 429 rate limited"), 2);
    expect(first.retrySameModel).toBe(true);
    expect(second.retrySameModel).toBe(false);
    expect(second.switchModel).toBe(true);
    expect(last.retrySameModel).toBe(false);
    expect(last.switchProvider).toBe(true);
    expect(last.reason).toMatch(/max retry attempts/i);
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

  it("never retries 401/403 or invalid API key (C5.1)", () => {
    for (const message of ["HTTP 401 unauthorized", "HTTP 403 forbidden", "invalid API key"]) {
      const decision = policy.decide(new Error(message), 0);
      expect(decision.retrySameModel).toBe(false);
      expect(decision.switchModel).toBe(false);
      expect(decision.switchProvider).toBe(false);
      expect(decision.reason).toMatch(/never retry/i);
    }
  });
});
