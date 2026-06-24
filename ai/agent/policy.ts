import { SafetyPolicyEnforcer } from "../safety/policy";
import type { ConfirmationTopic, Goal, PlanStep, PolicyDecision } from "./types";

export class PolicyEngine {
  private readonly safety = new SafetyPolicyEnforcer();
  private goalContext: Goal | null = null;

  setGoalContext(goal: Goal | null): void {
    this.goalContext = goal;
  }

  private requiresConfirmation(topic: ConfirmationTopic, step: PlanStep): boolean {
    const topics = this.goalContext?.requireConfirmationFor ?? ["publish", "credentials"];
    if (!topics.includes(topic)) return false;
    if (topic === "publish") return step.type === "publish";
    if (topic === "credentials") {
      const patches = step.meta?.patches;
      return Array.isArray(patches) && patches.some((p) => String(p).toLowerCase().includes("credentials"));
    }
    if (topic === "compose") return step.type === "compose";
    if (topic === "review") return step.type === "review";
    return false;
  }

  evaluateStep(step: PlanStep): PolicyDecision {
    if (step.type === "publish" && this.requiresConfirmation("publish", step)) {
      return {
        allowed: false,
        reason: "Publishing to stores requires human confirmation",
        requireHuman: true
      };
    }

    if (step.meta?.patches) {
      const patches = step.meta.patches;
      if (
        this.requiresConfirmation("credentials", step) &&
        Array.isArray(patches) &&
        patches.some((p) => String(p).toLowerCase().includes("credentials"))
      ) {
        return {
          allowed: false,
          reason: "Patches touching credentials require manual review",
          requireHuman: true
        };
      }
    }

    if (step.type === "compose" || step.type === "review" || step.type === "manual") {
      if (step.type === "compose" && Array.isArray(step.meta?.patchFiles)) {
        const files = step.meta.patchFiles as Array<{ path: string; patch: string }>;
        const violations = this.safety.validatePatchSet(files);
        if (violations.length > 0) {
          return {
            allowed: false,
            reason: violations.map((v) => v.message).join("; "),
            requireHuman: true
          };
        }
      }

      return {
        allowed: false,
        reason: `${step.label} requires human confirmation`,
        requireHuman: true
      };
    }

    return { allowed: true };
  }
}
