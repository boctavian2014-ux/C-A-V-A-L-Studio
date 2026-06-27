import { describe, expect, it } from "vitest";
import { getAutoBalancedModelCandidates } from "../../ai/models/auto-router";

describe("getAutoBalancedModelCandidates", () => {
  it("returns cloud non-premium models", () => {
    const candidates = getAutoBalancedModelCandidates("kilocode");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContain("stepfun-step-3-7-flash");
    expect(candidates).not.toContain("poolside-laguna-m-1");
    expect(candidates).not.toContain("qwen2.5-coder:7b");
  });
});
