import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const docsDir = path.join(process.cwd(), "docs");

describe("docs structure", () => {
  it("contains core architecture documentation", async () => {
    const files = await fs.readdir(docsDir);
    expect(files).toContain("architecture.md");
    expect(files).toContain("ai-layer.md");
    expect(files).toContain("roadmap.md");
  });

  it("architecture doc references all major layers", async () => {
    const content = await fs.readFile(path.join(docsDir, "architecture.md"), "utf8");
    expect(content.toLowerCase()).toContain("context engine");
    expect(content.toLowerCase()).toContain("marketplace");
  });
});
