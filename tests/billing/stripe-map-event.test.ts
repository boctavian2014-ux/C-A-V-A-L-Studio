import { describe, expect, it, beforeEach } from "vitest";
import { mapStripeEvent } from "../../billing/stripe/map-event";
import type Stripe from "stripe";

describe("mapStripeEvent", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = "price_pro_test";
  });

  it("maps checkout.session.completed to pro subscription", () => {
    const event = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { caval_id: "caval_user_1" },
          customer_details: { email: "user@example.com" },
        },
      },
    } as unknown as Stripe.Event;

    const mapped = mapStripeEvent(event);
    expect(mapped).not.toBeNull();
    expect(mapped?.cavalId).toBe("caval_user_1");
    expect(mapped?.plan).toBe("pro");
    expect(mapped?.status).toBe("active");
    expect(mapped?.stripeCustomerId).toBe("cus_123");
    expect(mapped?.stripeSubscriptionId).toBe("sub_123");
    expect(mapped?.entitlements).toEqual(["pro"]);
  });

  it("maps customer.subscription.updated with cancelled status", () => {
    const event = {
      id: "evt_sub_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          customer: "cus_456",
          status: "canceled",
          metadata: { cavalId: "caval_user_2" },
          items: { data: [{ price: { id: "price_pro_test" } }] },
          current_period_end: 1_700_000_000,
        },
      },
    } as unknown as Stripe.Event;

    const mapped = mapStripeEvent(event);
    expect(mapped?.status).toBe("cancelled");
    expect(mapped?.plan).toBe("community");
    expect(mapped?.entitlements).toEqual([]);
  });

  it("returns null for unhandled event types", () => {
    const event = {
      id: "evt_other",
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as unknown as Stripe.Event;
    expect(mapStripeEvent(event)).toBeNull();
  });
});
