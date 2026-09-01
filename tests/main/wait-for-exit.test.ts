import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import { waitForChildExit, withTimeout } from "../../src/main/wait-for-exit";

describe("waitForChildExit", () => {
  it("resolves exit when the child already finished", async () => {
    const child = {
      exitCode: 0,
      signalCode: null,
      once() {
        return this;
      },
      removeListener() {
        return this;
      },
    };
    await expect(waitForChildExit(child, 50)).resolves.toBe("exit");
  });

  it("resolves timeout when the child never exits", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
    });
    await expect(waitForChildExit(child, 20)).resolves.toBe("timeout");
  });

  it("resolves exit when the child emits exit", async () => {
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      signalCode: null,
    });
    const pending = waitForChildExit(child, 200);
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit");
    }, 10);
    await expect(pending).resolves.toBe("exit");
  });
});

describe("withTimeout", () => {
  it("returns the value when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("returns timeout when the promise is slow", async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 80);
    });
    await expect(withTimeout(slow, 15)).resolves.toBe("timeout");
  });
});
