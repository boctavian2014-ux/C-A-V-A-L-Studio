import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  insertBillingEvent,
  upsertSubscriptionFromStripe,
} from "../../billing/supabase/repository";
import { getSubscription, resetSubscriptionsForTests } from "../../billing/subscription-store";

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock("../../billing/supabase/client", () => ({
  isSupabaseConfigured: () => false,
  getSupabaseAdmin: () => null,
}));

describe("supabase repository (memory fallback)", () => {
  beforeEach(() => {
    resetSubscriptionsForTests();
    mockFrom.mockReset();
  });

  it("upserts subscription into memory when Supabase admin is unavailable", async () => {
    const record = await upsertSubscriptionFromStripe({
      userId: "caval_repo_1",
      cavalId: "caval_repo_1",
      email: "repo@example.com",
      stripeCustomerId: "cus_repo",
      stripeSubscriptionId: "sub_repo",
      status: "active",
      plan: "pro",
      entitlements: ["pro"],
    });

    expect(record.plan).toBe("pro");
    expect(getSubscription("caval_repo_1")?.entitlements).toEqual(["pro"]);
  });

  it("insertBillingEvent returns false without Supabase", async () => {
    const inserted = await insertBillingEvent({
      externalEventId: "evt_no_db",
      eventType: "test",
      provider: "stripe",
      payload: { ok: true },
    });
    expect(inserted).toBe(false);
  });
});

describe("supabase repository (mock client)", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    vi.resetModules();
  });

  it("skips duplicate billing events on unique violation", async () => {
    vi.doMock("../../billing/supabase/client", () => ({
      isSupabaseConfigured: () => true,
      getSupabaseAdmin: () => mockSupabase,
    }));

    mockFrom.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
    });

    const { insertBillingEvent: insertWithDb } = await import("../../billing/supabase/repository");
    const inserted = await insertWithDb({
      externalEventId: "evt_dup_db",
      eventType: "checkout.session.completed",
      provider: "stripe",
      payload: {},
    });
    expect(inserted).toBe(false);
  });
});
