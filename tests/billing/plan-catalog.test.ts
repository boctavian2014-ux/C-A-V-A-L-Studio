import { describe, expect, it } from "vitest";
import { DEFAULT_PLAN_CATALOG, getPlanCatalog, getPlanLimits } from "../../billing/plan-catalog";

describe("plan-catalog", () => {
  it("exposes structural PlanLimits for free/pro/ultra", () => {
    expect(DEFAULT_PLAN_CATALOG.free.allowedModelTiers).toEqual(["fast"]);
    expect(DEFAULT_PLAN_CATALOG.pro.allowedModelTiers).toContain("standard");
    expect(DEFAULT_PLAN_CATALOG.ultra.allowedModelTiers).toEqual(["fast", "standard", "ultra"]);
  });

  it("loads overrides from env fixtures", () => {
    const catalog = getPlanCatalog({
      PLAN_FREE_CHAT_TOKENS: "1000",
      PLAN_PRO_ZOO_BUDGET_USD: "9.5",
      PLAN_ULTRA_ALLOWED_TIERS: "ultra,standard",
    } as NodeJS.ProcessEnv);
    expect(catalog.free.chatTokens).toBe(1000);
    expect(catalog.pro.zooBudgetUsd).toBe(9.5);
    expect(catalog.ultra.allowedModelTiers).toEqual(["ultra", "standard"]);
  });

  it("getPlanLimits returns a single plan", () => {
    expect(getPlanLimits("free").cadJobs).toBe(DEFAULT_PLAN_CATALOG.free.cadJobs);
  });
});
