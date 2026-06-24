import { describe, expect, it } from "vitest";
import { PolicyEngine } from "../../ai/agent/policy";
import type { Goal, PlanStep } from "../../ai/agent/types";

describe("PolicyEngine", () => {
  const engine = new PolicyEngine();

  it("requires human confirmation for publish steps by default", () => {
    engine.setGoalContext({
      action: "publish",
      version: "1.0.0",
      platforms: ["android"],
      requireConfirmationFor: ["publish"]
    });
    const decision = engine.evaluateStep({
      id: "p1",
      type: "publish",
      label: "Publish to store"
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requireHuman).toBe(true);
  });

  it("allows suggest steps without confirmation", () => {
    engine.setGoalContext({
      action: "publish",
      version: "1.0.0",
      platforms: ["android"]
    });
    const decision = engine.evaluateStep({
      id: "s1",
      type: "suggest",
      label: "Analyze repo"
    });
    expect(decision.allowed).toBe(true);
  });

  it("blocks compose when patch touches credentials", () => {
    engine.setGoalContext({
      action: "publish",
      version: "1.0.0",
      platforms: ["android"],
      requireConfirmationFor: ["credentials"]
    } satisfies Goal);
    const step: PlanStep = {
      id: "c1",
      type: "compose",
      label: "Apply patches",
      meta: {
        patches: ["secrets/credentials.json"]
      }
    };
    const decision = engine.evaluateStep(step);
    expect(decision.requireHuman).toBe(true);
    expect(decision.reason).toMatch(/credentials/i);
  });
});
