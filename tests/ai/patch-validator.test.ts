import { describe, expect, it } from "vitest";
import { PatchValidator } from "../../ai/composer/patch/patch-validator";

describe("PatchValidator", () => {
  const validator = new PatchValidator();

  it("rejects empty patch sets", () => {
    const diagnostics = validator.validate("/workspace", { files: [] });
    expect(diagnostics.some((d) => d.message.includes("no files"))).toBe(true);
  });

  it("rejects path traversal targets", () => {
    const diagnostics = validator.validate("/workspace", {
      files: [{ path: "../outside.txt", patch: "content", fullContent: "content" }]
    });
    expect(diagnostics.some((d) => d.message.includes("outside workspace"))).toBe(true);
  });

  it("rejects conflict markers in patches", () => {
    const diagnostics = validator.validate("/workspace", {
      files: [{ path: "src/a.ts", patch: "<<<<<<< HEAD\ncontent\n>>>>>>> branch" }]
    });
    expect(diagnostics.some((d) => d.message.includes("conflict markers"))).toBe(true);
  });
});
