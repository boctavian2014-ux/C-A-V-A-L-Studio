import { describe, expect, it } from "vitest";
import { SyntaxChecker } from "../../ai/composer/validation/syntax-checker";

describe("SyntaxChecker", () => {
  const checker = new SyntaxChecker();

  it("reports TypeScript syntax errors", async () => {
    const diagnostics = await checker.check([
      { path: "broken.ts", content: "export const x: = 1;" }
    ]);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].source).toBe("syntax-checker");
  });

  it("passes valid TypeScript", async () => {
    const diagnostics = await checker.check([
      { path: "ok.ts", content: "export const value = 42;" }
    ]);
    expect(diagnostics).toHaveLength(0);
  });

  it("checks delimiter balance for python files", async () => {
    const diagnostics = await checker.check([
      { path: "bad.py", content: "def foo():\n    return [" }
    ]);
    expect(diagnostics.some((d) => d.level === "warning")).toBe(true);
  });
});
