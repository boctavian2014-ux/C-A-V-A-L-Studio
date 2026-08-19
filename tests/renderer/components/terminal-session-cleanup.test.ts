import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("TerminalSession cleanup", () => {
  it("creates ResizeObserver before any disconnect in the same effect", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../../src/renderer/components/terminal/TerminalSession.tsx"),
      "utf8"
    );
    const created = src.indexOf("const resizeObserver = new ResizeObserver");
    const disconnected = src.indexOf("resizeObserver.disconnect()");
    expect(created).toBeGreaterThan(-1);
    expect(disconnected).toBeGreaterThan(-1);
    expect(created).toBeLessThan(disconnected);
  });
});
