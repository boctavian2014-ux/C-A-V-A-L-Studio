import { describe, expect, it, vi } from "vitest";
import { manualBillingSync } from "../../billing/sync/manual-sync";
import { periodicBillingSync } from "../../billing/sync/periodic-sync";

describe("billing sync", () => {
  it("manualBillingSync succeeds without remote fetch", async () => {
    const result = await manualBillingSync();
    expect(result.ok).toBe(true);
    expect(result.syncedAt).toBeTruthy();
  });

  it("periodicBillingSync propagates remote fetch errors", async () => {
    const result = await periodicBillingSync(async () => {
      throw new Error("remote unavailable");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("remote unavailable");
  });

  it("periodicBillingSync calls remote fetch when provided", async () => {
    const fetchRemote = vi.fn().mockResolvedValue(undefined);
    const result = await periodicBillingSync(fetchRemote);
    expect(fetchRemote).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
  });
});
