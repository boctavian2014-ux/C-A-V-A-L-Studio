import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { abortRegistry } from "../../src/main/abort/abort-registry";
import {
  finishAbortableStream,
  resetStreamAbortRootsForTests,
  startAbortableStream,
  streamAbortRootCountForTests,
} from "../../src/main/abort/stream-abort";
import {
  emitQuickFixAcceptTimeline,
  emitQuickFixProposeTimeline,
  proposeQuickFix,
} from "../../src/main/ai/quick-fix-runner";
import { emitExplainTimeline, runExplain } from "../../src/main/ai/explain-runner";
import {
  emitRefactorProposeTimeline,
  runRefactorPropose,
} from "../../src/main/ai/refactor-runner";
import {
  applyProposedWritesToDisk,
  proposeScaffoldWrites,
  revertNewProposedWrites,
} from "../../ai/composer/scaffold-apply-node";
import {
  clearProposedWrites,
  resetProposedWritesForTests,
  stageProposedWrites,
} from "../../src/main/ai/proposed-writes-buffer";
import {
  registerStreamOperation,
  resetOperationRegistryForTests,
} from "../../src/main/operation-registry";
import { applyQuickFixEditsToText } from "../../src/shared/ai-quick-fix-contract";
import { formatInlineCompletionPrompt } from "../../src/shared/ai-inline-completion-contract";
import { materializeRefactorFile } from "../../src/shared/ai-refactor-apply";
import {
  applyInlineSuggestionAtCursor,
  provideGatedInlineCompletion,
} from "../../src/renderer/ai/inline-completion-provider";
import { applyQuickFixEdits } from "../../src/renderer/ai/quick-fix-apply";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";

const SECRET = "sk-or-v1-abcdefghijklmnopqrstuvwxyz012345";

type FakeModel = { value: string };

function createFakeEditor(initial: string) {
  const model: FakeModel = { value: initial };
  const undoStack: string[] = [];
  let snapshotPending = true;

  const editor = {
    getModel: () => ({ getValue: () => model.value }),
    pushUndoStop: () => {
      snapshotPending = true;
    },
    executeEdits: (
      _source: string,
      edits: Array<{
        range: {
          startLineNumber: number;
          startColumn: number;
          endLineNumber: number;
          endColumn: number;
        };
        text: string;
      }>
    ) => {
      if (snapshotPending) {
        undoStack.push(model.value);
        snapshotPending = false;
      }
      model.value = applyQuickFixEditsToText(
        model.value,
        edits.map((e) => ({
          startLine: e.range.startLineNumber,
          startColumn: e.range.startColumn,
          endLine: e.range.endLineNumber,
          endColumn: e.range.endColumn,
          newText: e.text,
        }))
      );
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

  return {
    editor,
    model,
    monacoApi: monacoApi as unknown as typeof import("monaco-editor"),
  };
}

function createTimelineCollector(streamId: string) {
  const events: TimelineEvent[] = [];
  const chunks: Array<Record<string, unknown>> = [];
  const stream = {
    send: (chunk: Record<string, unknown>) => {
      chunks.push(chunk);
      if (chunk.type === "timeline" && chunk.event) {
        events.push(chunk.event as TimelineEvent);
      }
      return true;
    },
    isAlive: () => true,
  };
  return {
    stream,
    events,
    chunks,
    assertSameStreamId() {
      expect(chunks.every((c) => c.streamId === streamId)).toBe(true);
    },
    assertNoSecretLeak() {
      const blob = JSON.stringify(events);
      expect(blob).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    },
  };
}

function writeM6SmokeWorkspace(root: string): void {
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "App.tsx"),
    [
      "export const App: number = 'broken-on-purpose';",
      `// secret ${SECRET}`,
      "export function greet(name: string) {",
      "  return name;",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "src", "user.ts"),
    "export type User = { id: string };\nexport const userLabel = 'User';\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "caval-m6-editor-smoke", private: true }, null, 2),
    "utf8"
  );
}

function createToken() {
  let isCancellationRequested = false;
  return {
    get isCancellationRequested() {
      return isCancellationRequested;
    },
    onCancellationRequested: () => ({ dispose: () => undefined }),
    cancel: () => {
      isCancellationRequested = true;
    },
  };
}

/**
 * Pas 6.x — unified editor AI smoke on one workspace.
 * No Playwright, no live LLM. Exercises 6.1–6.5 gates in sequence.
 */
describe("M6 editor AI unified smoke (one workspace)", () => {
  let root = "";

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetStreamAbortRootsForTests();
    abortRegistry.resetForTests();
    resetOperationRegistryForTests();
    resetProposedWritesForTests();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it(
    "quick fix → inline → explain → chat apply → refactor coexist with undo and cleanup",
    async () => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-editor-smoke-"));
      writeM6SmokeWorkspace(root);

      const appRel = "src/App.tsx";
      const appAbs = path.join(root, appRel);
      const originalApp = fs.readFileSync(appAbs, "utf8");
      const originalUser = fs.readFileSync(path.join(root, "src", "user.ts"), "utf8");

      // ── 6.1 Quick fix ───────────────────────────────────────────────────
      const qfId = "m6-smoke-qf";
      registerStreamOperation({ streamId: qfId, senderId: 1, workspaceRoot: root });
      startAbortableStream(qfId);
      const qfTl = createTimelineCollector(qfId);

      const diagnostic = {
        message: "Type 'string' is not assignable to type 'number'.",
        severity: "error" as const,
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 48,
        code: "TS2322",
        source: "typescript",
      };

      const qfPropose = await proposeQuickFix({
        workspaceRoot: root,
        request: { streamId: qfId, filePath: appRel, diagnostic },
        complete: async () => ({
          ok: true,
          text: JSON.stringify({
            edits: [
              {
                startLine: 1,
                startColumn: 28,
                endLine: 1,
                endColumn: 47,
                newText: "1",
              },
            ],
            explanation: `Fix type. secret ${SECRET}`,
          }),
        }),
      });
      expect(qfPropose.success).toBe(true);
      expect(qfPropose.explanation).toContain("[REDACTED]");
      expect(fs.readFileSync(appAbs, "utf8")).toBe(originalApp);

      emitQuickFixProposeTimeline(qfTl.stream, qfId, appRel, 1, qfPropose);
      const { editor: qfEditor, model: qfModel, monacoApi } = createFakeEditor(originalApp);
      expect(
        applyQuickFixEdits(
          qfEditor as unknown as import("monaco-editor").editor.IStandaloneCodeEditor,
          monacoApi,
          qfPropose.edits!
        )
      ).toBe(true);
      expect(qfModel.value).toMatch(/=\s*1;/);
      fs.writeFileSync(appAbs, qfModel.value, "utf8");
      emitQuickFixAcceptTimeline(qfTl.stream, qfId, {
        filePath: appRel,
        editCount: 1,
      });
      expect(qfTl.events.map((e) => e.type)).toEqual([
        "tool_call",
        "tool_result",
        "file_write",
      ]);
      qfTl.assertSameStreamId();
      qfTl.assertNoSecretLeak();

      qfEditor.undo();
      expect(qfModel.value).toBe(originalApp);
      fs.writeFileSync(appAbs, originalApp, "utf8");
      finishAbortableStream(qfId);

      // ── 6.2 Inline completion ───────────────────────────────────────────
      const icId = "m6-smoke-ic";
      registerStreamOperation({ streamId: icId, senderId: 1, workspaceRoot: root });
      startAbortableStream(icId);
      const icTl = createTimelineCollector(icId);

      vi.useFakeTimers();
      const token = createToken();
      const prefixSource = "const x = ";
      const pending = provideGatedInlineCompletion({
        fullText: prefixSource,
        lineNumber: 1,
        column: prefixSource.length + 1,
        filePath: appRel,
        language: "typescript",
        token,
        debounceMs: 300,
        fetch: async ({ prefix }) => {
          const prompt = formatInlineCompletionPrompt({
            language: "typescript",
            filePath: appRel,
            prefix: `${prefix}\n// ${SECRET}`,
          });
          expect(prompt).toContain("[REDACTED]");
          expect(prompt).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
          return { ok: true, suggestion: "42;" };
        },
      });
      await vi.advanceTimersByTimeAsync(300);
      const icResult = await pending;
      vi.useRealTimers();
      expect(icResult.suggestion).toBe("42;");
      expect(prefixSource).toBe("const x = ");

      const afterAccept = applyInlineSuggestionAtCursor(
        prefixSource,
        1,
        prefixSource.length + 1,
        icResult.suggestion!
      );
      expect(afterAccept).toBe("const x = 42;");
      emitQuickFixAcceptTimeline(icTl.stream, icId, {
        filePath: appRel,
        editCount: 1,
        detail: "inline completion accepted",
      });
      expect(icTl.events.map((e) => e.type)).toEqual(["file_write"]);
      icTl.assertSameStreamId();
      // Undo insert
      expect(prefixSource).toBe("const x = ");
      finishAbortableStream(icId);

      // ── 6.3 Explain (read-only) ─────────────────────────────────────────
      const exId = "m6-smoke-explain";
      registerStreamOperation({ streamId: exId, senderId: 1, workspaceRoot: root });
      startAbortableStream(exId);
      const exTl = createTimelineCollector(exId);
      const beforeExplain = fs.readFileSync(appAbs, "utf8");

      const explained = await runExplain({
        workspaceRoot: root,
        request: {
          streamId: exId,
          filePath: appRel,
          symbol: "greet",
          language: "typescript",
        },
        complete: async () => ({
          ok: true,
          text: `greet returns the name. secret ${SECRET}`,
        }),
      });
      expect(explained.success).toBe(true);
      expect(explained.explanation).toContain("greet");
      expect(explained.explanation).toContain("[REDACTED]");
      expect(fs.readFileSync(appAbs, "utf8")).toBe(beforeExplain);

      emitExplainTimeline(exTl.stream, exId, appRel, explained, "greet");
      expect(exTl.events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
      expect(exTl.events.some((e) => e.type === "file_write")).toBe(false);
      exTl.assertSameStreamId();
      exTl.assertNoSecretLeak();
      finishAbortableStream(exId);

      // ── 6.4 Chat apply ──────────────────────────────────────────────────
      const caId = "m6-smoke-chat-apply";
      registerStreamOperation({ streamId: caId, senderId: 1, workspaceRoot: root });
      startAbortableStream(caId);
      const caTl = createTimelineCollector(caId);

      const scaffold = [
        "```typescript:src/hello.ts",
        "export const hello = 1;",
        `// secret ${SECRET}`,
        "```",
      ].join("\n");
      const proposed = proposeScaffoldWrites(root, scaffold);
      expect(proposed).toHaveLength(1);
      expect(fs.existsSync(path.join(root, "src", "hello.ts"))).toBe(false);
      stageProposedWrites(caId, proposed);

      const { applied } = applyProposedWritesToDisk(root, proposed);
      expect(applied).toEqual(["src/hello.ts"]);
      expect(fs.existsSync(path.join(root, "src", "hello.ts"))).toBe(true);
      emitQuickFixAcceptTimeline(caTl.stream, caId, {
        filePath: "src/hello.ts",
        editCount: 1,
        detail: "chat apply accepted",
      });
      expect(caTl.events.map((e) => e.type)).toEqual(["file_write"]);

      const { deleted } = revertNewProposedWrites(root, proposed);
      expect(deleted).toEqual(["src/hello.ts"]);
      expect(fs.existsSync(path.join(root, "src", "hello.ts"))).toBe(false);
      clearProposedWrites(caId);
      finishAbortableStream(caId);

      // ── 6.5 Refactor multi-file ─────────────────────────────────────────
      const rfId = "m6-smoke-refactor";
      registerStreamOperation({ streamId: rfId, senderId: 1, workspaceRoot: root });
      startAbortableStream(rfId);
      const rfTl = createTimelineCollector(rfId);

      const refactor = await runRefactorPropose({
        workspaceRoot: root,
        request: {
          streamId: rfId,
          kind: "rename",
          symbol: "User",
          selection: {
            filePath: "src/user.ts",
            startLine: 1,
            startColumn: 13,
            endLine: 1,
            endColumn: 17,
            text: "User",
          },
        },
        complete: async () => ({
          ok: true,
          text: JSON.stringify({
            files: [
              {
                filePath: "src/user.ts",
                edits: [
                  {
                    startLine: 1,
                    startColumn: 13,
                    endLine: 1,
                    endColumn: 17,
                    newText: "Account",
                  },
                  {
                    startLine: 2,
                    startColumn: 27,
                    endLine: 2,
                    endColumn: 33,
                    newText: "'Account'",
                  },
                ],
              },
              {
                filePath: "src/account.ts",
                isNew: true,
                edits: [],
                newFileContent: "export type Account = { id: string };\n",
              },
            ],
            explanation: `Rename User → Account. secret ${SECRET}`,
          }),
        }),
      });
      expect(refactor.success).toBe(true);
      expect(refactor.files).toHaveLength(2);
      expect(refactor.explanation).toContain("[REDACTED]");
      expect(fs.readFileSync(path.join(root, "src", "user.ts"), "utf8")).toBe(originalUser);
      expect(fs.existsSync(path.join(root, "src", "account.ts"))).toBe(false);

      emitRefactorProposeTimeline(rfTl.stream, rfId, {
        streamId: rfId,
        kind: "rename",
        symbol: "User",
      }, refactor);

      // Accept all — apply to disk (simulates UI Accept)
      for (const file of refactor.files!) {
        const abs = path.join(root, file.filePath);
        if (file.isNew) {
          const mat = materializeRefactorFile("", file);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, mat.modifiedText, "utf8");
        } else {
          const before = fs.readFileSync(abs, "utf8");
          const mat = materializeRefactorFile(before, file);
          fs.writeFileSync(abs, mat.modifiedText, "utf8");
        }
        emitQuickFixAcceptTimeline(rfTl.stream, rfId, {
          filePath: file.filePath,
          editCount: file.edits?.length ?? 1,
          detail: file.isNew ? "refactor new file" : "refactor applied",
        });
      }

      expect(fs.readFileSync(path.join(root, "src", "user.ts"), "utf8")).toContain("Account");
      expect(fs.existsSync(path.join(root, "src", "account.ts"))).toBe(true);
      expect(rfTl.events.filter((e) => e.type === "file_write")).toHaveLength(2);
      expect(rfTl.events.map((e) => e.type).slice(0, 2)).toEqual([
        "tool_call",
        "tool_result",
      ]);
      rfTl.assertSameStreamId();
      rfTl.assertNoSecretLeak();

      // Revert new + restore edited file (native undo / Revert)
      fs.unlinkSync(path.join(root, "src", "account.ts"));
      fs.writeFileSync(path.join(root, "src", "user.ts"), originalUser, "utf8");
      expect(fs.existsSync(path.join(root, "src", "account.ts"))).toBe(false);
      expect(fs.readFileSync(path.join(root, "src", "user.ts"), "utf8")).toBe(originalUser);
      finishAbortableStream(rfId);

      // ── Isolation: App.tsx still original after all ops undone ──────────
      expect(fs.readFileSync(appAbs, "utf8")).toBe(originalApp);

      // ── Cleanup: zero orphans ───────────────────────────────────────────
      expect(streamAbortRootCountForTests()).toBe(0);
      expect(abortRegistry.size()).toBe(0);
    },
    60_000
  );
});
