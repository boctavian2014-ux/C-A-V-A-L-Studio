import { describe, expect, it, beforeEach } from "vitest";
import {
  parseUpgradeRequiredPayload,
  useEntitlementStatusStore,
} from "../../ai/composer/entitlement-status-store";

describe("entitlement-status-store", () => {
  beforeEach(() => {
    useEntitlementStatusStore.setState({ notice: null, usageRefreshEpoch: 0 });
  });

  it("parses upgrade_required IPC payload", () => {
    const parsed = parseUpgradeRequiredPayload(
      {
        code: "upgrade_required",
        reason: "monthly_chat_tokens_exhausted",
        currentPlan: "free",
        requiredPlan: "pro",
        resetsAt: "2026-10-01T00:00:00.000Z",
        error: "Monthly chat token quota exhausted. Upgrade your plan.",
      },
      "chat"
    );
    expect(parsed?.requiredPlan).toBe("pro");
    expect(parsed?.source).toBe("chat");
  });

  it("bumps usageRefreshEpoch on notice", () => {
    useEntitlementStatusStore.getState().noteUpgradeRequired({
      reason: "monthly_zoo_budget_exhausted",
      currentPlan: "free",
      requiredPlan: "pro",
      resetsAt: "2026-10-01T00:00:00.000Z",
      source: "cad",
    });
    const state = useEntitlementStatusStore.getState();
    expect(state.notice?.reason).toBe("monthly_zoo_budget_exhausted");
    expect(state.usageRefreshEpoch).toBe(1);
  });
});
