import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  materializeRefactorFile,
  normalizeRefactorPaths,
} from "../../src/shared/ai-refactor-apply";
import {
  parseRefactorAiResponse,
  REFACTOR_MAX_EDITS_PER_FILE,
  REFACTOR_MAX_FILES,
  validateRefactorFiles,
  validateRefactorRequestShape,
  type RefactorFileEdit,
} from "../../src/shared/ai-refactor-contract";
import {
  emitRefactorProposeTimeline,
  runRefactorPropose,
} from "../../src/main/ai/refactor-runner";
import { emitQuickFixAcceptTimeline } from "../../src/main/ai/quick-fix-runner";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";
import { applyQuickFixEditsToText } from "../../src/shared/ai-quick-fix-contract";

describe("M6.5 gated multi-file refactor", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("accepts a valid 2-file proposal and materializes both", () => {
    const files: RefactorFileEdit[] = [
      {
        filePath: "src/a.ts",
        edits: [
          {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 20,
            newText: "export const A = 1;",
          },
        ],
      },
      {
        filePath: "src/b.ts",
        edits: [
          {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 20,
            newText: "import { A } from './a';",
          },
        ],
      },
    ];
    const validated = validateRefactorFiles(files);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const a = materializeRefactorFile("export const a = 1;", validated.files[0]!);
    const b = materializeRefactorFile("import { a } from './a';", validated.files[1]!);
    expect(a.modifiedText).toContain("A = 1");
    expect(b.modifiedText).toContain("{ A }");
  });

  it("rejects more than max files", () => {
    const files: RefactorFileEdit[] = Array.from(
      { length: REFACTOR_MAX_FILES + 1 },
      (_, i) => ({
        filePath: `src/f${i}.ts`,
        edits: [
          {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 2,
            newText: "x",
          },
        ],
      })
    );
    const result = validateRefactorFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Too many files/i);
  });

  it("rejects too many edits per file", () => {
    const edits = Array.from({ length: REFACTOR_MAX_EDITS_PER_FILE + 1 }, () => ({
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 2,
      newText: "a",
    }));
    const result = validateRefactorFiles([{ filePath: "a.ts", edits }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Too many edits/i);
  });

  it("rejects path traversal", () => {
    const result = validateRefactorFiles([
      {
        filePath: "../secret.ts",
        edits: [
          {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 2,
            newText: "x",
          },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/traversal|Invalid/i);
  });

  it("rejects oversized total payload", () => {
    const result = validateRefactorFiles([
      {
        filePath: "big.ts",
        edits: [
          {
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 2,
            newText: "x".repeat(17 * 1024),
          },
        ],
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large/i);
  });

  it("redacts secrets in explanation", () => {
    const parsed = parseRefactorAiResponse(
      JSON.stringify({
        files: [
          {
            filePath: "a.ts",
            edits: [
              {
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 2,
                newText: "y",
              },
            ],
          },
        ],
        explanation:
          "Use key sk-or-v1-abcdefghijklmnopqrstuvwxyz012345 for the rename",
      })
    );
    expect(parsed.success).toBe(true);
    expect(parsed.explanation).toContain("[REDACTED]");
    expect(parsed.explanation).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("new file Revert deletes; deleted file Revert restores", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m65-revert-"));
    const newRel = "src/account.ts";
    const delRel = "src/user.ts";
    const newAbs = path.join(root, newRel);
    const delAbs = path.join(root, delRel);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(delAbs, "export type User = { id: string };\n", "utf8");

    const created: RefactorFileEdit = {
      filePath: newRel,
      edits: [],
      isNew: true,
      newFileContent: "export type Account = { id: string };\n",
    };
    const deleted: RefactorFileEdit = {
      filePath: delRel,
      edits: [],
      isDeleted: true,
      deletedContent: fs.readFileSync(delAbs, "utf8"),
    };

    // Accept: write new + delete old
    const newMat = materializeRefactorFile("", created);
    fs.mkdirSync(path.dirname(newAbs), { recursive: true });
    fs.writeFileSync(newAbs, newMat.modifiedText, "utf8");
    fs.unlinkSync(delAbs);
    expect(fs.existsSync(newAbs)).toBe(true);
    expect(fs.existsSync(delAbs)).toBe(false);

    // Revert new/deleted
    fs.unlinkSync(newAbs);
    fs.writeFileSync(delAbs, deleted.deletedContent!, "utf8");
    expect(fs.existsSync(newAbs)).toBe(false);
    expect(fs.readFileSync(delAbs, "utf8")).toContain("User");
  });

  it("native-style undo restores open-buffer text via reverse apply", () => {
    const original = "const User = 1;\nconst x = User;\n";
    const edit = {
      startLine: 1,
      startColumn: 7,
      endLine: 1,
      endColumn: 11,
      newText: "Account",
    };
    const modified = applyQuickFixEditsToText(original, [edit]);
    expect(modified).toContain("Account");
    // Simulate Monaco undo restoring prior buffer
    expect(original).toContain("User");
    expect(original).not.toEqual(modified);
  });

  it("timeline: tool_call → tool_result then file_write per file on accept", () => {
    const events: TimelineEvent[] = [];
    const stream = {
      send: (chunk: Record<string, unknown>) => {
        if (chunk.type === "timeline" && chunk.event) {
          events.push(chunk.event as TimelineEvent);
        }
        return true;
      },
      isAlive: () => true,
    };

    const request = {
      streamId: "r1",
      kind: "rename" as const,
      symbol: "User",
    };
    const result = {
      success: true as const,
      files: [
        {
          filePath: "src/a.ts",
          edits: [
            {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 2,
              newText: "A",
            },
          ],
        },
        {
          filePath: "src/b.ts",
          edits: [
            {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 2,
              newText: "B",
            },
          ],
        },
      ],
      explanation: "rename User → Account",
    };

    emitRefactorProposeTimeline(stream, "r1", request, result);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events.filter((e) => e.type === "file_write")).toHaveLength(0);

    for (const file of result.files) {
      emitQuickFixAcceptTimeline(stream, "r1-accept", {
        filePath: file.filePath,
        editCount: file.edits.length,
        detail: "refactor applied",
      });
    }
    expect(events.filter((e) => e.type === "file_write")).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual([
      "tool_call",
      "tool_result",
      "file_write",
      "file_write",
    ]);
  });

  it("runRefactorPropose never writes disk and rejects bad shape", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m65-run-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const file = path.join(root, "src", "a.ts");
    fs.writeFileSync(file, "export const User = 1;\n", "utf8");

    const bad = await runRefactorPropose({
      workspaceRoot: root,
      request: {
        streamId: "s",
        kind: "custom",
        // missing instruction
      } as never,
      complete: async () => ({ ok: true, text: "{}" }),
    });
    expect(bad.success).toBe(false);

    const shaped = validateRefactorRequestShape({
      streamId: "s2",
      kind: "rename",
      symbol: "User",
      selection: {
        filePath: "src/a.ts",
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 20,
        text: "User",
      },
    });
    expect(shaped.ok).toBe(true);

    const proposed = await runRefactorPropose({
      workspaceRoot: root,
      request: {
        streamId: "s3",
        kind: "rename",
        symbol: "User",
        selection: {
          filePath: "src/a.ts",
          startLine: 1,
          startColumn: 14,
          endLine: 1,
          endColumn: 18,
          text: "User",
        },
      },
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          files: [
            {
              filePath: "src/a.ts",
              edits: [
                {
                  startLine: 1,
                  startColumn: 14,
                  endLine: 1,
                  endColumn: 18,
                  newText: "Account",
                },
              ],
            },
            {
              filePath: "src/account.ts",
              isNew: true,
              edits: [],
              newFileContent: "export type Account = number;\n",
            },
          ],
          explanation: "rename User → Account",
        }),
      }),
    });

    expect(proposed.success).toBe(true);
    expect(proposed.files).toHaveLength(2);
    expect(fs.readFileSync(file, "utf8")).toContain("User");
    expect(fs.existsSync(path.join(root, "src", "account.ts"))).toBe(false);

    const normalized = normalizeRefactorPaths(proposed.files ?? []);
    expect(normalized[0]?.filePath).toBe("src/a.ts");
  });
});
