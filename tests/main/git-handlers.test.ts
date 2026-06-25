import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyHunkToContent } from "../../src/shared/diff-utils";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn().mockResolvedValue("line1\nnew line\nline3"),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

describe("git hunk revert integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applyHunkToContent reverse restores original lines", () => {
    const original = "line1\nold line\nline3";
    const hunk = [
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line",
      "+new line",
      " line3",
    ].join("\n");
    const modified = applyHunkToContent(original, hunk, "forward");
    expect(modified).toContain("new line");
    const back = applyHunkToContent(modified, hunk, "reverse");
    expect(back).toBe(original);
  });
});
