import { describe, expect, it, beforeEach, vi } from "vitest";
import { handleStripeWebhook } from "../../billing/stripe/webhook";
import { getSubscription, resetSubscriptionsForTests } from "../../billing/subscription-store";

const constructEvent = vi.fn();

vi.mock("../../billing/stripe/client", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent },
  }),
  isStripeConfigured: () => true,
}));

vi.mock("../../billing/supabase/client", () => ({
  isSupabaseConfigured: () => false,
}));

describe("handleStripeWebhook", () => {
  beforeEach(() => {
    resetSubscriptionsForTests();
    constructEvent.mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("rejects missing signature", async () => {
    const result = await handleStripeWebhook("{}", undefined);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });

  it("persists subscription to memory store on valid event", async () => {
    constructEvent.mockReturnValue({
      id: "evt_mem_1",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_mem",
          subscription: "sub_mem",
          metadata: { caval_id: "caval_mem_user" },
          customer_details: { email: "mem@example.com" },
        },
      },
    });

    const result = await handleStripeWebhook(
      Buffer.from("{}"),
      "sig_test"
    );
    expect(result.ok).toBe(true);
    const sub = getSubscription("caval_mem_user");
    expect(sub?.plan).toBe("pro");
    expect(sub?.status).toBe("active");
  });

  it("is idempotent when constructEvent returns same event twice", async () => {
    constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_dup",
          subscription: "sub_dup",
          metadata: { caval_id: "caval_dup" },
        },
      },
    });

    await handleStripeWebhook(Buffer.from("{}"), "sig");
    await handleStripeWebhook(Buffer.from("{}"), "sig");
    expect(getSubscription("caval_dup")?.plan).toBe("pro");
  });
});
