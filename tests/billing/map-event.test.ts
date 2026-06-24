import { describe, expect, it } from "vitest";
import { mapRevenueCatEvent } from "../../billing/revenuecat/map-event";

describe("mapRevenueCatEvent", () => {
  it("maps INITIAL_PURCHASE to subscription_activated", () => {
    const mapped = mapRevenueCatEvent({
      id: "e1",
      type: "INITIAL_PURCHASE",
      app_user_id: "user-1",
      product_id: "pro_monthly",
      entitlement_ids: ["pro"],
      expiration_at_ms: 1_700_000_000_000,
      event_timestamp_ms: 1_699_000_000_000
    });
    expect(mapped.type).toBe("subscription_activated");
    expect(mapped.userId).toBe("user-1");
    expect(mapped.entitlements).toEqual(["pro"]);
    expect(mapped.expiresAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("maps unknown events to unknown type", () => {
    const mapped = mapRevenueCatEvent({
      id: "e2",
      type: "MYSTERY_EVENT",
      app_user_id: "user-2",
      event_timestamp_ms: 1
    });
    expect(mapped.type).toBe("unknown");
    expect(mapped.entitlements).toEqual([]);
  });

  it("maps CANCELLATION and EXPIRATION", () => {
    expect(mapRevenueCatEvent({ id: "1", type: "CANCELLATION", app_user_id: "u", event_timestamp_ms: 1 }).type)
      .toBe("subscription_cancelled");
    expect(mapRevenueCatEvent({ id: "2", type: "EXPIRATION", app_user_id: "u", event_timestamp_ms: 1 }).type)
      .toBe("subscription_expired");
  });
});
