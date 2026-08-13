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
    const nested = path.join(root, "out", "file.md");
    const escaped = path.resolve(root, "..", "other", "file.md");
    expect(isPathInsideWorkspace(root, nested)).toBe(true);
    expect(isPathInsideWorkspace(root, escaped)).toBe(false);
  });

  it("parses Windows serialized paths with path.win32 on any runner", () => {
    const root = "C:\\proj\\demo";
    const nested = path.win32.join(root, "out", "file.md");
    const escaped = path.win32.join("C:\\proj", "other", "file.md");
    expect(nested).toBe("C:\\proj\\demo\\out\\file.md");
    expect(path.win32.basename(nested)).toBe("file.md");
    expect(path.win32.relative(root, escaped).startsWith("..")).toBe(true);
  });
});
