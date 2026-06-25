import { describe, expect, it, vi } from "vitest";

import { CoreEditorLayer } from "../../src/core/editor-layer";
import {
  periodicBillingSync,
  startPeriodicBillingSync,
  stopPeriodicBillingSync,
} from "../../billing/sync/periodic-sync";

describe("CoreEditorLayer", () => {
  it("bootstraps default capabilities", () => {
    const layer = new CoreEditorLayer();
    const caps = layer.bootstrap();
    expect(caps.workspaceTrust).toBe(true);
    expect(caps.extensionHost).toBe(true);
    expect(caps.settingsSync).toBe(true);
    expect(caps.commandPalette).toBe(true);
  });
});

describe("periodicBillingSync", () => {
  it("returns ok when remote fetch succeeds", async () => {
    const result = await periodicBillingSync(async () => undefined);
    expect(result.ok).toBe(true);
    expect(result.subscriptionCount).toBeGreaterThanOrEqual(0);
  });

  it("returns error when remote fetch fails", async () => {
    const result = await periodicBillingSync(async () => {
      throw new Error("network down");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });

  it("starts and stops periodic timer", () => {
    vi.useFakeTimers();
    startPeriodicBillingSync(1000, async () => undefined);
    startPeriodicBillingSync(1000);
    stopPeriodicBillingSync();
    vi.useRealTimers();
  });
});
