import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../../ai/review/diff-parser";

describe("parseUnifiedDiff", () => {
  it("parses standard unified diff hunks", () => {
    const patch = [
      "@@ -1,3 +1,3 @@",
      " context",
      "-old line",
      "+new line"
    ].join("\n");
    const hunks = parseUnifiedDiff(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.filter((l) => l.type === "add")).toHaveLength(1);
    expect(hunks[0].lines.filter((l) => l.type === "remove")).toHaveLength(1);
  });

  it("returns synthetic hunk for empty patch", () => {
    const hunks = parseUnifiedDiff("");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toContain("No diff content");
  });

  it("parses git-style multi-line diff", () => {
    const patch = [
      "@@ -10,4 +10,5 @@",
      " context",
      "-removed",
      "+added green",
      "+another",
    ].join("\n");
    const hunks = parseUnifiedDiff(patch);
    expect(hunks[0].lines.filter((l) => l.type === "add")).toHaveLength(2);
  });
});
