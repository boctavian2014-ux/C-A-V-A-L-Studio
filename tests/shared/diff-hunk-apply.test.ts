import { describe, expect, it } from "vitest";
import {
  applyHunkToContent,
  applyUnifiedDiff,
  buildHunkPatch,
  reverseHunkPatch,
} from "../../src/shared/diff-utils";

describe("diff-utils hunk apply", () => {
  const original = ["line1", "old line", "line3"].join("\n");

  const hunkPatch = [
    "@@ -1,3 +1,3 @@",
    " line1",
    "-old line",
    "+new line",
    " line3",
  ].join("\n");

  it("applies forward patch", () => {
    const result = applyUnifiedDiff(original, hunkPatch);
    expect(result).toBe(["line1", "new line", "line3"].join("\n"));
  });

  it("reverts patch on modified content", () => {
    const modified = applyUnifiedDiff(original, hunkPatch);
    const reverted = applyHunkToContent(modified, hunkPatch, "reverse");
    expect(reverted).toBe(original);
  });

  it("builds and reverses hunk patch", () => {
    const reversed = reverseHunkPatch(hunkPatch);
    expect(reversed).toContain("@@ -1,3 +1,3 @@");
    expect(reversed).toContain("+old line");
    expect(reversed).toContain("-new line");
  });

  it("buildHunkPatch from review hunk shape", () => {
    const patch = buildHunkPatch({
      header: "@@ -1,1 +1,1 @@",
      lines: [
        { id: "1", type: "remove", content: "a", decision: "pending" },
        { id: "2", type: "add", content: "b", decision: "pending" },
      ],
    });
    expect(patch).toContain("-a");
    expect(patch).toContain("+b");
  });
});
