import { afterEach, describe, expect, it } from "vitest";

import {
  AGENTIC_PROVIDER_REQUIRED,
  AGENTIC_PROVIDER_REQUIRED_MESSAGE,
  AgenticProviderRequiredError,
  assertAgenticProvidersReady,
  hasAgenticCloudProvider,
  isForbiddenAgenticFallback,
  isAgenticExecution,
  listAgenticEligibleModelIds,
  orderAgenticTryList,
  toAgenticUiError,
} from "../../ai/models/agentic-routing-policy";
import { AGENTIC_NVIDIA_FALLBACK_PROFILE_ID, AGENTIC_NVIDIA_PRIMARY_PROFILE_ID } from "../../ai/models/nvidia-nim-catalog";
import { ModelFallbackPlanner } from "../../ai/model-fallback";
import type { ModelRequest } from "../../ai/types";
import { resolveAutoModel } from "../../ai/models/auto-router";

const KEYS = [
  "NVIDIA_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  for (const key of KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function clearCloudKeys(): void {
  for (const key of KEYS) delete process.env[key];
}

snapshotEnv();

afterEach(() => {
  restoreEnv();
});

describe("agentic routing policy", () => {
  it("treats Agentic mode and agent/tool_use intents as agentic execution", () => {
    expect(isAgenticExecution({ mode: "agentic" })).toBe(true);
    expect(isAgenticExecution({ intent: "agent" })).toBe(true);
    expect(isAgenticExecution({ intent: "tool_use" })).toBe(true);
    expect(isAgenticExecution({ capability: "tool_use" })).toBe(true);
    expect(isAgenticExecution({ mode: "ask", intent: "fallback" })).toBe(false);
    expect(isAgenticExecution({ mode: "code", intent: "kilocode" })).toBe(false);
  });

  it("marks local Qwen 7B as forbidden agentic fallback", () => {
    expect(isForbiddenAgenticFallback("qwen2.5-coder:7b")).toBe(true);
    expect(isForbiddenAgenticFallback("ollama-local")).toBe(true);
    expect(isForbiddenAgenticFallback("nvidia-deepseek-v4-flash")).toBe(false);
    expect(isForbiddenAgenticFallback("nvidia-qwen3.5-122b")).toBe(false);
  });

  it("selects NVIDIA DeepSeek V4 Flash first when NVIDIA is configured", () => {
    clearCloudKeys();
    process.env.NVIDIA_API_KEY = "nvapi-test-not-a-real-key-xxxx";
    expect(hasAgenticCloudProvider()).toBe(true);
    expect(listAgenticEligibleModelIds()[0]).toBe(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);
    expect(listAgenticEligibleModelIds()).toContain(AGENTIC_NVIDIA_FALLBACK_PROFILE_ID);
    expect(listAgenticEligibleModelIds()).not.toContain("qwen2.5-coder:7b");
  });

  it("throws AGENTIC_PROVIDER_REQUIRED without NVIDIA/OpenRouter/BYOK", () => {
    clearCloudKeys();
    expect(hasAgenticCloudProvider()).toBe(false);
    expect(listAgenticEligibleModelIds()).toEqual([]);
    expect(() => assertAgenticProvidersReady()).toThrow(AgenticProviderRequiredError);
    try {
      assertAgenticProvidersReady();
    } catch (error) {
      expect(error).toBeInstanceOf(AgenticProviderRequiredError);
      const ui = toAgenticUiError(error);
      expect(ui.code).toBe(AGENTIC_PROVIDER_REQUIRED);
      expect(ui.action).toBe("configure_nvidia_nim");
      expect(JSON.stringify(ui)).not.toMatch(/nvapi-|sk-or-|sk-ant-/i);
      expect(ui.error).toBe(AGENTIC_PROVIDER_REQUIRED_MESSAGE);
    }
  });

  it("does not include API keys in serialized agentic errors", () => {
    clearCloudKeys();
    process.env.NVIDIA_API_KEY = "nvapi-LEAK-TEST-SECRET-VALUE";
    const ui = toAgenticUiError(new AgenticProviderRequiredError());
    expect(JSON.stringify(ui)).not.toContain("nvapi-LEAK-TEST-SECRET-VALUE");
    expect(JSON.stringify(ui)).not.toContain(process.env.NVIDIA_API_KEY);
  });

  it("keeps Auto Ask/fallback local 7B when no cloud keys", async () => {
    clearCloudKeys();
    const resolved = await resolveAutoModel("caval-auto/free", "fallback");
    expect(resolved.modelId).toBe("qwen2.5-coder:7b");
    expect(resolved.provider).toBe("open_source");
  });

  it("refuses Auto Agentic local 7B when no cloud keys", async () => {
    clearCloudKeys();
    await expect(resolveAutoModel("caval-auto/free", "agent")).rejects.toBeInstanceOf(
      AgenticProviderRequiredError
    );
  });

  it("orders DeepSeek then Qwen 3.5 for agentic try list", () => {
    clearCloudKeys();
    process.env.NVIDIA_API_KEY = "nvapi-test-not-a-real-key-yyyy";
    expect(orderAgenticTryList("nvidia-deepseek-v4-flash")).toEqual([
      AGENTIC_NVIDIA_PRIMARY_PROFILE_ID,
      AGENTIC_NVIDIA_FALLBACK_PROFILE_ID,
    ]);
  });
});

describe("ModelFallbackPlanner agentic", () => {
  it("never includes qwen2.5-coder:7b for agent intent", () => {
    const planner = new ModelFallbackPlanner();
    const request: ModelRequest = {
      prompt: "implement feature with tools",
      capability: "tool_use",
      intent: "agent",
    };
    const result = planner.candidatesFor(request);
    expect(result.candidates.some((c) => c.id === "qwen2.5-coder:7b")).toBe(false);
    expect(result.candidates.every((c) => c.supportsToolCalling)).toBe(true);
  });
});
