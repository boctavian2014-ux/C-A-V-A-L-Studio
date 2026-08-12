import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathInsideWorkspace, sanitizeFileName } from "../../src/main/engineering-handlers";

describe("engineering-handlers helpers", () => {
  it("sanitizeFileName strips unsafe characters", () => {
    expect(sanitizeFileName("part 1 (v2).scad")).toBe("part_1__v2_.scad");
    expect(sanitizeFileName("")).toBe("fisier");
  });

  it("isPathInsideWorkspace accepts nested paths only", () => {
    const root = path.resolve("proj-demo");
    expect(isPathInsideWorkspace(root, path.join(root, "out", "file.md"))).toBe(true);
    expect(isPathInsideWorkspace(root, path.resolve(root, "..", "other", "file.md"))).toBe(false);
  });
});
