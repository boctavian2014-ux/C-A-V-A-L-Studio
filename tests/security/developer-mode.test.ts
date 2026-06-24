import { beforeEach, describe, expect, it } from "vitest";
import {
  assertDeveloperMode,
  isDeveloperModeEnabled,
  resetDeveloperModeForTests,
  setDeveloperMode
} from "../../src/core/developer-mode";

describe("developer mode", () => {
  beforeEach(() => {
    delete process.env.CAVAL_DEVELOPER_UNLOCK_TOKEN;
    resetDeveloperModeForTests(false);
  });

  it("enables and disables without token when unset", () => {
    expect(setDeveloperMode(true)).toBe(true);
    expect(isDeveloperModeEnabled()).toBe(true);
    setDeveloperMode(false);
    expect(isDeveloperModeEnabled()).toBe(false);
  });

  it("requires unlock token when configured", () => {
    process.env.CAVAL_DEVELOPER_UNLOCK_TOKEN = "secret-token";
    expect(setDeveloperMode(true, "wrong")).toBe(false);
    expect(setDeveloperMode(true, "secret-token")).toBe(true);
  });

  it("assertDeveloperMode throws when disabled", () => {
    expect(() => assertDeveloperMode()).toThrow(/disabled/i);
    setDeveloperMode(true);
    expect(() => assertDeveloperMode()).not.toThrow();
  });
});
