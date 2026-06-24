import { describe, expect, it } from "vitest";
import { createRevenueCatClient } from "../../mobile-app/services/revenuecat";

describe("RevenueCat client stub", () => {
  it("configures with api key", async () => {
    const client = createRevenueCatClient();
    await expect(client.configure("test-key")).resolves.toBeUndefined();
  });

  it("returns default paywall products", async () => {
    const client = createRevenueCatClient();
    await client.configure("test-key");
    const products = await client.getOfferings();
    expect(products.length).toBeGreaterThan(0);
    expect(products[0].entitlement).toBeTruthy();
  });

  it("purchase succeeds with product id", async () => {
    const client = createRevenueCatClient();
    await client.configure("test-key");
    const result = await client.purchase("caval_pro_monthly");
    expect(result.ok).toBe(true);
  });

  it("restore purchases succeeds", async () => {
    const client = createRevenueCatClient();
    await client.configure("test-key");
    expect((await client.restore()).ok).toBe(true);
  });
});
