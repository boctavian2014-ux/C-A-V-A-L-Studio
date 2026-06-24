import { describe, expect, it } from "vitest";
import { SafetyGuard } from "../../ai/safety/guard";
import type { ModelRequest } from "../../ai/types";

const baseRequest = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  prompt: "Explain this function",
  capability: "chat",
  ...overrides
});

describe("SafetyGuard", () => {
  it("allows normal chat requests", () => {
    const guard = new SafetyGuard();
    expect(() => guard.assertRequestAllowed(baseRequest())).not.toThrow();
  });

  it("throws when rate limit exceeded", () => {
    const guard = new SafetyGuard();
    const request = baseRequest({ metadata: { workspaceRoot: "/tmp/rate-test" } });
    for (let i = 0; i < 60; i += 1) {
      guard.assertRequestAllowed(request);
    }
    expect(() => guard.assertRequestAllowed(request)).toThrow(/rate limit/i);
  });

  it("blocks patches exceeding size limits", () => {
    const guard = new SafetyGuard();
    expect(() => guard.assertPatchAllowed([
      { path: "large.ts", patch: "x".repeat(600_000) }
    ])).toThrow(/exceeds limit/i);
  });
});
