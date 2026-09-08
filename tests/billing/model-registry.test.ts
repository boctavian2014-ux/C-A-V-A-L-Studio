import { describe, expect, it } from "vitest";
import {
  getModelEntry,
  listModelsForTier,
  managedProviderEnvConfigured,
  resolveModelTier,
} from "../../billing/model-registry";

describe("model-registry", () => {
  it("maps OpenAI/Anthropic models to entitlement tiers", () => {
    expect(resolveModelTier("claude-haiku-4-5")).toBe("fast");
    expect(resolveModelTier("gpt-4o-mini")).toBe("fast");
    expect(resolveModelTier("claude-sonnet-5")).toBe("standard");
    expect(resolveModelTier("gpt-4o")).toBe("standard");
    expect(resolveModelTier("claude-opus-5")).toBe("ultra");
    expect(resolveModelTier("claude-fable-5-1")).toBe("ultra");
  });

  it("includes existing vault providers on tiers", () => {
    expect(resolveModelTier("stepfun-step-3-7-flash")).toBe("fast");
    expect(resolveModelTier("zoo-text-to-cad")).toBe("ultra");
    expect(resolveModelTier("piapi-trellis")).toBe("standard");
    expect(getModelEntry("NVIDIA-NEMOTRON-ULTRA")?.provider).toBe("nvidia");
  });

  it("lists models per tier", () => {
    const fast = listModelsForTier("fast");
    expect(fast.some((m) => m.provider === "anthropic")).toBe(true);
    expect(fast.some((m) => m.provider === "openai")).toBe(true);
  });

  it("reports managed env presence without values", () => {
    const configured = managedProviderEnvConfigured({
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "",
    } as NodeJS.ProcessEnv);
    expect(configured.OPENAI_API_KEY).toBe(true);
    expect(configured.ANTHROPIC_API_KEY).toBe(false);
    expect(JSON.stringify(configured)).not.toContain("sk-test");
  });
});
