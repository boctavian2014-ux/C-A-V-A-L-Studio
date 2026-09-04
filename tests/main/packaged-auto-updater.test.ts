import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronState = vi.hoisted(() => ({ isPackaged: false }));
const wireEvents = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return electronState.isPackaged;
    },
  },
}));

vi.mock("../../installer/updater/auto-updater", () => ({
  CavalAutoUpdater: class {
    wireEvents = wireEvents;
    check = check;
  },
}));

describe("wirePackagedAutoUpdater", () => {
  beforeEach(async () => {
    vi.resetModules();
    electronState.isPackaged = false;
    wireEvents.mockClear();
    check.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not construct or check the updater when unpackaged", async () => {
    const { wirePackagedAutoUpdater } = await import("../../src/main/packaged-auto-updater");
    wirePackagedAutoUpdater();
    expect(wireEvents).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it("wires events and checks when packaged", async () => {
    electronState.isPackaged = true;
    const { wirePackagedAutoUpdater } = await import("../../src/main/packaged-auto-updater");
    wirePackagedAutoUpdater();
    expect(wireEvents).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
