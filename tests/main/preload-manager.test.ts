import { describe, expect, it } from "vitest";

import { PreloadManager } from "../../ai/preload/preload-manager";

describe("PreloadManager bundle guard", () => {
  it("does not become worker-ready when bundle path is null", () => {
    const manager = new PreloadManager({ workerPath: null, enableWorker: true });
    expect(manager.getStatus().workerReady).toBe(false);
  });

  it("constructs without throwing when path is missing", () => {
    expect(() => new PreloadManager({ workerPath: null })).not.toThrow();
  });

  it("dispose clears readiness and leaves no in-flight work", async () => {
    const manager = new PreloadManager({ workerPath: null, enableWorker: true });
    await manager.dispose();
    expect(manager.getStatus().workerReady).toBe(false);
    expect(manager.getStatus().inFlight).toBe(0);
  });
});
