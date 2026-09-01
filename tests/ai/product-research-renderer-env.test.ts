import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("product research renderer modules", () => {
  it("do not read process.env (keys stay in main)", () => {
    const dir = path.join(__dirname, "../../ai/research");
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const source = readFileSync(path.join(dir, name), "utf8");
      expect(source, name).not.toMatch(/process\.env/);
    }
  });
});
