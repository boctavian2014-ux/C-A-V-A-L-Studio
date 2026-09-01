import { describe, expect, it } from "vitest";

import {
  ProviderCircuitBreaker,
  parseRetryAfterMs,
} from "../../ai/providers/circuit-breaker";
import { safeErrorFromHttpStatus } from "../../ai/providers/provider-errors";

describe("ProviderCircuitBreaker", () => {
  it("stays closed until failureThreshold then opens for cooldownMs", () => {
    let now = 1_000;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 10_000,
      now: () => now,
    });
    expect(breaker.getState("nvidia")).toBe("closed");
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    expect(breaker.getState("nvidia")).toBe("closed");
    expect(breaker.allowRequest("nvidia")).toBe(true);
    breaker.recordFailure("nvidia");
    expect(breaker.getState("nvidia")).toBe("open");
    expect(breaker.allowRequest("nvidia")).toBe(false);
    expect(breaker.getCooldownRemainingMs("nvidia")).toBe(10_000);
  });

  it("uses NVIDIA Retry-After when longer than cooldown", () => {
    let now = 5_000;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: () => now,
    });
    breaker.recordFailure("nvidia", { retryAfterMs: 30_000 });
    expect(breaker.getState("nvidia")).toBe("open");
    expect(breaker.getCooldownRemainingMs("nvidia")).toBe(30_000);
  });

  it("enters half-open after cooldown, one probe, success closes", () => {
    let now = 0;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 5_000,
      now: () => now,
    });
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    now = 5_000;
    expect(breaker.getState("nvidia")).toBe("half-open");
    expect(breaker.allowRequest("nvidia")).toBe(true);
    expect(breaker.allowRequest("nvidia")).toBe(false);
    breaker.recordSuccess("nvidia");
    expect(breaker.getState("nvidia")).toBe("closed");
    expect(breaker.allowRequest("nvidia")).toBe(true);
  });

  it("re-opens from half-open on probe failure", () => {
    let now = 0;
    const breaker = new ProviderCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 4_000,
      now: () => now,
    });
    breaker.recordFailure("nvidia");
    breaker.recordFailure("nvidia");
    now = 4_000;
    expect(breaker.allowRequest("nvidia")).toBe(true);
    breaker.recordFailure("nvidia");
    expect(breaker.getState("nvidia")).toBe("open");
    expect(breaker.allowRequest("nvidia")).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfterMs("12")).toBe(12_000);
  });

  it("attaches retryAfterMs on 429 SafeProviderError", () => {
    const headers = new Headers({ "Retry-After": "8" });
    const err = safeErrorFromHttpStatus("nvidia", 429, undefined, headers);
    expect(err.retryAfterMs).toBe(8_000);
    expect(JSON.stringify(err)).not.toMatch(/nvapi-|sk-/i);
  });
});
