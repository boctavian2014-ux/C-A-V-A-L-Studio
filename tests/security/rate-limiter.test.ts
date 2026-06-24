import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../ai/safety/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests under the limit", () => {
    const limiter = new RateLimiter(3, 60_000);
    const now = 1_000_000;
    expect(limiter.consume("workspace-a", now)).toBe(true);
    expect(limiter.consume("workspace-a", now + 1)).toBe(true);
    expect(limiter.consume("workspace-a", now + 2)).toBe(true);
  });

  it("blocks requests over the limit within the window", () => {
    const limiter = new RateLimiter(2, 60_000);
    const now = 2_000_000;
    expect(limiter.consume("key", now)).toBe(true);
    expect(limiter.consume("key", now + 1)).toBe(true);
    expect(limiter.consume("key", now + 2)).toBe(false);
  });

  it("resets after window expires", () => {
    const limiter = new RateLimiter(1, 1_000);
    const start = 3_000_000;
    expect(limiter.consume("k", start)).toBe(true);
    expect(limiter.consume("k", start + 100)).toBe(false);
    expect(limiter.consume("k", start + 1_001)).toBe(true);
  });
});
