import { describe, expect, it, afterEach } from "vitest";
import { getAutoBalancedModelCandidates } from "../../ai/models/auto-router";

describe("getAutoBalancedModelCandidates", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (prevKey) process.env.OPENROUTER_API_KEY = prevKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  it("returns cloud non-premium models when OpenRouter is configured", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const candidates = getAutoBalancedModelCandidates("kilocode");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContain("stepfun-step-3-7-flash");
    expect(candidates).not.toContain("poolside-laguna-m-1");
    expect(candidates).not.toContain("qwen2.5-coder:7b");
  });

  it("excludes models without provider credentials", () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.POOLSIDE_API_KEY;
    const candidates = getAutoBalancedModelCandidates("kilocode");
    expect(candidates).not.toContain("poolside-laguna-m-1");
  });
});
