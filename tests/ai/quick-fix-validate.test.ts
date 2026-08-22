import { describe, expect, it } from "vitest";

import {
  applyQuickFixEditsToText,
  buildQuickFixPrompt,
  parseQuickFixAiResponse,
  validateQuickFixEdits,
  validateQuickFixRequestShape,
  type QuickFixDiagnostic,
  type QuickFixEdit,
} from "../../src/shared/ai-quick-fix-contract";

const diagnostic: QuickFixDiagnostic = {
  message: "Type 'string' is not assignable to type 'number'.",
  severity: "error",
  startLine: 1,
  startColumn: 14,
  endLine: 1,
  endColumn: 40,
  code: "TS2322",
  source: "typescript",
};

describe("quick-fix contract validation", () => {
  it("rejects invalid request shapes", () => {
    expect(validateQuickFixRequestShape(null).ok).toBe(false);
    expect(
      validateQuickFixRequestShape({
        streamId: "s1",
        filePath: "",
        diagnostic,
      }).ok
    ).toBe(false);
  });

  it("accepts a valid request", () => {
    const shaped = validateQuickFixRequestShape({
      streamId: "s1",
      filePath: "src/App.tsx",
      diagnostic,
    });
    expect(shaped.ok).toBe(true);
  });

  it("rejects edits outside the diagnostic zone", () => {
    const far: QuickFixEdit = {
      startLine: 40,
      startColumn: 1,
      endLine: 40,
      endColumn: 5,
      newText: "x",
    };
    const result = validateQuickFixEdits([far], diagnostic);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outside diagnostic zone/i);
  });

  it("rejects oversized newText and too many edits", () => {
    const huge: QuickFixEdit = {
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 2,
      newText: "x".repeat(5 * 1024),
    };
    expect(validateQuickFixEdits([huge], diagnostic).ok).toBe(false);

    const many: QuickFixEdit[] = Array.from({ length: 4 }, () => ({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 2,
      newText: "a",
    }));
    expect(validateQuickFixEdits(many, diagnostic).ok).toBe(false);
  });

  it("parses model JSON and applies localized edits", () => {
    const source = "export const App: number = 'broken';\n";
    const parsed = parseQuickFixAiResponse(
      JSON.stringify({
        edits: [
          {
            startLine: 1,
            startColumn: 28,
            endLine: 1,
            endColumn: 36,
            newText: "1",
          },
        ],
        explanation: "Use a number literal",
      }),
      diagnostic
    );
    expect(parsed.success).toBe(true);
    expect(parsed.edits).toHaveLength(1);
    const next = applyQuickFixEditsToText(source, parsed.edits!);
    expect(next).toContain("= 1;");
    expect(next).not.toContain("'broken'");
  });

  it("redacts secrets in prompt context", () => {
    const prompt = buildQuickFixPrompt({
      filePath: "src/App.tsx",
      diagnostic,
      contextStartLine: 1,
      contextSnippet: "const key = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz012345';",
    });
    expect(prompt).toContain("[REDACTED]");
    expect(prompt).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });
});
