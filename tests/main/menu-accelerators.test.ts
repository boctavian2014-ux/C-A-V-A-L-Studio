import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("SEC-UI-ACCELERATOR-001 menu accelerators", () => {
  it("uses single Electron chords without space-separated tokens", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/main/electron-main.ts"),
      "utf8"
    );
    const accelerators = [...src.matchAll(/accelerator:\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(accelerators.length).toBeGreaterThan(10);
    expect(accelerators).toContain("CmdOrCtrl+Alt+Q");
    for (const accelerator of accelerators) {
      expect(accelerator, accelerator).not.toMatch(/\s/);
    }
  });
});
