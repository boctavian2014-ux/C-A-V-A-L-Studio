import { describe, expect, it, vi } from "vitest";

import { waitForPreviewHealthCheck } from "../../src/shared/preview-health-check";

describe("waitForPreviewHealthCheck", () => {
  it("re-reads the current URL each probe after the suggested port is rewritten", async () => {
    let current = "http://localhost:5173/";
    const seen: string[] = [];
    const ok = await waitForPreviewHealthCheck(() => current, {
      timeoutMs: 800,
      intervalMs: 10,
      healthCheckFn: async (url) => {
        seen.push(url);
        if (url.includes("5173")) {
          current = "http://localhost:59709/";
          return false;
        }
        return url.includes("59709");
      },
    });
    expect(ok).toBe(true);
    expect(seen.some((url) => url.includes("5173"))).toBe(true);
    expect(seen.some((url) => url.includes("59709"))).toBe(true);
  });

  it("treats HTTP status under 500 as ready", async () => {
    const healthCheckFn = vi.fn(async () => true);
    await expect(
      waitForPreviewHealthCheck("http://localhost:59709/", {
        timeoutMs: 200,
        intervalMs: 10,
        healthCheckFn,
      })
    ).resolves.toBe(true);
    expect(healthCheckFn).toHaveBeenCalledWith(
      "http://localhost:59709/",
      expect.any(AbortSignal)
    );
  });
});
