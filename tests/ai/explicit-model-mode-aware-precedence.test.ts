import { describe, expect, it } from "vitest";

import { FAST_CHAT_MODEL_ID } from "../../ai/models/auto-router";
import { AGENTIC_NVIDIA_PRIMARY_PROFILE_ID } from "../../ai/models/nvidia-nim-catalog";
import { ModelRouter } from "../../ai/model-router";
import {
  inferFallbackChatMode,
  resolveCompletionAttemptPlan,
} from "../../ai/pipeline/model-completion";
import type { ModelRequest } from "../../ai/types";

const STEPFUN = FAST_CHAT_MODEL_ID;

describe("explicit model vs mode-aware fallback precedence", () => {
  it("StepFun explicit + ask + planning keeps StepFun as first attempt", () => {
    const plan = resolveCompletionAttemptPlan(
      {
        model: STEPFUN,
        chatMode: "ask",
        intent: "planning",
        capability: "chat",
      },
      STEPFUN
    );
    expect(inferFallbackChatMode({ model: STEPFUN, chatMode: "ask", intent: "planning" })).toBeNull();
    expect(plan.usesModeAwareFallback).toBe(false);
    expect(plan.firstAttemptModelId).toBe(STEPFUN);
  });

  it("StepFun explicit + ask + chat keeps StepFun as first attempt", () => {
    const plan = resolveCompletionAttemptPlan(
      {
        model: STEPFUN,
        chatMode: "ask",
        intent: "fallback",
        capability: "chat",
      },
      STEPFUN
    );
    expect(plan.usesModeAwareFallback).toBe(false);
    expect(plan.firstAttemptModelId).toBe(STEPFUN);
  });

  it("caval-auto + ask + planning still uses the ask NVIDIA chain", () => {
    const plan = resolveCompletionAttemptPlan(
      {
        model: "caval-auto/frontier",
        chatMode: "ask",
        intent: "planning",
        capability: "chat",
      },
      STEPFUN
    );
    expect(plan.usesModeAwareFallback).toBe(true);
    expect(plan.fallbackMode).toBe("ask");
    expect(plan.firstAttemptModelId).toBe(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);
  });

  it("caval-auto + code keeps the code NVIDIA chain", () => {
    const plan = resolveCompletionAttemptPlan(
      {
        model: "caval-auto/frontier",
        chatMode: "code",
        intent: "kilocode",
        capability: "code",
      },
      STEPFUN
    );
    expect(plan.usesModeAwareFallback).toBe(true);
    expect(plan.fallbackMode).toBe("code");
    expect(plan.firstAttemptModelId).toBe(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);
  });

  it("unavailable explicit model does not preventively switch to NVIDIA", () => {
    const missing = "openrouter:missing-explicit-model";
    const plan = resolveCompletionAttemptPlan(
      {
        model: missing,
        chatMode: "ask",
        intent: "planning",
        capability: "chat",
      },
      missing
    );
    expect(plan.usesModeAwareFallback).toBe(false);
    expect(plan.firstAttemptModelId).toBe(missing);
    expect(plan.firstAttemptModelId).not.toBe(AGENTIC_NVIDIA_PRIMARY_PROFILE_ID);

    const router = new ModelRouter([], { fallbackEnabled: true });
    const request: ModelRequest = {
      prompt: "piuliță M8 hexagonală",
      capability: "chat",
      intent: "planning",
      metadata: { preferredModel: missing, selectionId: missing },
    };
    expect(router.rank(request)).toEqual([]);
  });
});
