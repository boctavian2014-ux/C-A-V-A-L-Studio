import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  emitQuickFixAcceptTimeline,
  emitQuickFixProposeTimeline,
  proposeQuickFix,
} from "../../src/main/ai/quick-fix-runner";
import { applyQuickFixEditsToText } from "../../src/shared/ai-quick-fix-contract";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";
import { applyQuickFixEdits } from "../../src/renderer/ai/quick-fix-apply";

type FakeModel = {
  value: string;
  getValue: () => string;
};

function createFakeEditor(initial: string) {
  const model: FakeModel = {
    value: initial,
    getValue: () => model.value,
  };
  const undoStack: string[] = [];
  let snapshotPending = true;

  const editor = {
    getModel: () => ({
      getValue: () => model.value,
    }),
    pushUndoStop: () => {
      snapshotPending = true;
    },
    executeEdits: (
      _source: string,
      edits: Array<{ range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>
    ) => {
      if (snapshotPending) {
        undoStack.push(model.value);
        snapshotPending = false;
      }
      const mapped = edits.map((e) => ({
        startLine: e.range.startLineNumber,
        startColumn: e.range.startColumn,
        endLine: e.range.endLineNumber,
        endColumn: e.range.endColumn,
        newText: e.text,
      }));
      model.value = applyQuickFixEditsToText(model.value, mapped);
      return true;
    },
    undo: () => {
      const prev = undoStack.pop();
      if (prev != null) model.value = prev;
    },
  };

  const monacoApi = {
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
      ) {}
    },
  };

  return { editor, model, monacoApi: monacoApi as unknown as typeof import("monaco-editor") };
}

describe("M6.1 quick fix smoke (in-process)", () => {
  let root = "";

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("proposes localized edit, rejects out-of-zone, redacts timeline, apply+undo", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-qf-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const fileRel = "src/App.tsx";
    const original = "export const App: number = 'broken';\n// sk-or-v1-abcdefghijklmnopqrstuvwxyz012345\n";
    fs.writeFileSync(path.join(root, fileRel), original, "utf8");

    const diagnostic = {
      message: "Type 'string' is not assignable to type 'number'.",
      severity: "error" as const,
      startLine: 1,
      startColumn: 14,
      endLine: 1,
      endColumn: 40,
      code: "TS2322",
      source: "typescript",
    };

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

    // Deterministic mock adapter
    const okResult = await proposeQuickFix({
      workspaceRoot: root,
      request: {
        streamId: "qf-1",
        filePath: fileRel,
        diagnostic,
      },
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          edits: [
            {
              startLine: 1,
              startColumn: 28,
              endLine: 1,
              endColumn: 36,
              newText: "1",
            },
          ],
          explanation: "Replace string with number. secret sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
        }),
      }),
    });

    expect(okResult.success).toBe(true);
    expect(okResult.edits).toHaveLength(1);
    expect(okResult.explanation).toContain("[REDACTED]");
    expect(okResult.explanation).not.toContain("abcdefghijklmnopqrstuvwxyz012345");

    emitQuickFixProposeTimeline(stream, "qf-1", fileRel, 1, okResult);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events[0]?.label).toContain("quick_fix");
    expect(events[0]?.label).toContain("src/App.tsx:1");
    expect(events[1]?.label).toMatch(/1 edit/);

    // Out-of-zone → rejected integrally
    const rejected = await proposeQuickFix({
      workspaceRoot: root,
      request: {
        streamId: "qf-2",
        filePath: fileRel,
        diagnostic,
      },
      complete: async () => ({
        ok: true,
        text: JSON.stringify({
          edits: [
            {
              startLine: 80,
              startColumn: 1,
              endLine: 80,
              endColumn: 4,
              newText: "nope",
            },
          ],
        }),
      }),
    });
    expect(rejected.success).toBe(false);
    expect(rejected.error).toMatch(/outside diagnostic zone/i);

    events.length = 0;
    emitQuickFixProposeTimeline(stream, "qf-2", fileRel, 1, rejected);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "error"]);
    const joined = JSON.stringify(events);
    expect(joined).not.toContain("abcdefghijklmnopqrstuvwxyz012345");

    // Invalid / missing workspace
    const noWs = await proposeQuickFix({
      workspaceRoot: "",
      request: { streamId: "qf-3", filePath: fileRel, diagnostic },
      complete: async () => ({ ok: true, text: "{}" }),
    });
    expect(noWs.success).toBe(false);
    expect(noWs.error).toMatch(/workspace/i);

    // Apply + undo at model level
    const { editor, model, monacoApi } = createFakeEditor(original);
    const applied = applyQuickFixEdits(
      editor as unknown as import("monaco-editor").editor.IStandaloneCodeEditor,
      monacoApi,
      okResult.edits!
    );
    expect(applied).toBe(true);
    expect(model.value).toContain("= 1;");
    expect(model.value).not.toContain("'broken'");
    editor.undo();
    expect(model.value).toBe(original);

    // Accept timeline: file_write only after accept
    events.length = 0;
    emitQuickFixAcceptTimeline(stream, "qf-accept", {
      filePath: fileRel,
      editCount: 1,
    });
    expect(events.map((e) => e.type)).toEqual(["file_write"]);
    expect(events[0]?.filePath).toBe("src/App.tsx");

    // Full order on one stream id story
    events.length = 0;
    emitQuickFixProposeTimeline(stream, "qf-full", fileRel, 1, okResult);
    emitQuickFixAcceptTimeline(stream, "qf-full", { filePath: fileRel, editCount: 1 });
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "file_write"]);
  });
});
