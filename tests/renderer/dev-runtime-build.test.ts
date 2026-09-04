import { describe, expect, it } from "vitest";

import {
  DEV_RESTART_TOAST,
  shouldNotifyRuntimeRestart,
  type DevRuntimeBuildStatus,
} from "../../src/shared/dev-runtime-build";

describe("dev runtime build restart helper", () => {
  const changed: DevRuntimeBuildStatus = {
    isDev: true,
    runningHash: "main:1|preload:1",
    latestHash: "main:2|preload:2",
    needsRestart: true,
  };

  it("notifies once for a new build hash", () => {
    expect(shouldNotifyRuntimeRestart(changed, null)).toBe(true);
    expect(shouldNotifyRuntimeRestart(changed, "main:2|preload:2")).toBe(false);
  });

  it("does not notify outside dev or when hashes match", () => {
    expect(
      shouldNotifyRuntimeRestart(
        {
          ...changed,
          isDev: false,
        },
        null
      )
    ).toBe(false);
    expect(
      shouldNotifyRuntimeRestart(
        {
          ...changed,
          latestHash: changed.runningHash,
          needsRestart: false,
        },
        null
      )
    ).toBe(false);
    expect(DEV_RESTART_TOAST).toMatch(/Restart CAVAL/i);
  });
});
