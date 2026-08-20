import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildExplainPrompt,
  sanitizeExplainText,
  validateExplainRequestShape,
  EXPLAIN_MAX_SELECTION_BYTES,
} from "../../src/shared/ai-explain-contract";
import { emitExplainTimeline, runExplain } from "../../src/main/ai/explain-runner";
import { debounceUnlessCancelled } from "../../src/shared/ai-explain-contract";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";

function createToken(cancelled = false) {
  let isCancellationRequested = cancelled;
  const listeners: Array<() => void> = [];
  return {
    get isCancellationRequested() {
      return isCancellationRequested;
    },
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return {
        dispose: () => {
          const idx = listeners.indexOf(listener);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      };
    },
    cancel: () => {
      isCancellationRequested = true;
      listeners.forEach((l) => l());
    },
  };
}

describe("M6.3 explain read-only", () => {
  let root = "";

  afterEach(() => {
    vi.useRealTimers();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("builds bounded redacted prompts for symbol and selection", () => {
    const prompt = buildExplainPrompt({
      filePath: "src/app.ts",
      language: "typescript",
      symbol: "App",
      contextStartLine: 1,
      contextSnippet: "const key = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz012345';\nexport const App = 1;",
    });
    expect(prompt).toContain('kind="untrusted workspace content"');
    expect(prompt).toContain("[REDACTED]");
    expect(prompt).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(prompt).toContain("do not propose patches");

    const shaped = validateExplainRequestShape({
      streamId: "e1",
      filePath: "src/app.ts",
      selection: {
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 10,
        text: "x".repeat(EXPLAIN_MAX_SELECTION_BYTES + 10),
      },
    });
    expect(shaped.ok).toBe(false);
  });

  it("explains with mock adapter without mutating source text", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-explain-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const fileRel = "src/app.ts";
    const original = "export function greet(name: string) {\n  return name;\n}\n";
    fs.writeFileSync(path.join(root, fileRel), original, "utf8");

    const result = await runExplain({
      workspaceRoot: root,
      request: {
        streamId: "e2",
        filePath: fileRel,
        symbol: "greet",
        language: "typescript",
      },
      complete: async () => ({
        ok: true,
        text: "greet returns the given name. secret sk-or-v1-abcdefghijklmnopqrstuvwxyz012345",
      }),
    });

    expect(result.success).toBe(true);
    expect(result.explanation).toContain("greet");
    expect(result.explanation).toContain("[REDACTED]");
    expect(result.explanation).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(fs.readFileSync(path.join(root, fileRel), "utf8")).toBe(original);
  });

  it("rejects edit-like model payloads and oversize selection", () => {
    expect(sanitizeExplainText('```\n{"edits":[]}\n```')).toBeNull();
    expect(sanitizeExplainText("diff --git a/x b/x\n+hi")).toBeNull();
    expect(
      validateExplainRequestShape({
        streamId: "e3",
        filePath: "a.ts",
      }).ok
    ).toBe(false);
  });

  it("cancels debounce on hover-out without calling the model", async () => {
    vi.useFakeTimers();
    const token = createToken();
    const pending = debounceUnlessCancelled(500, token);
    await vi.advanceTimersByTimeAsync(100);
    token.cancel();
    await expect(pending).resolves.toBe(false);
  });

  it("timeline is tool_call → tool_result without file_write", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-explain-tl-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const fileRel = "src/x.ts";
    fs.writeFileSync(path.join(root, fileRel), "const x = 1;\n", "utf8");

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

    const result = await runExplain({
      workspaceRoot: root,
      request: {
        streamId: "e4",
        filePath: fileRel,
        selection: {
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 12,
          text: "const x = 1;",
        },
      },
      complete: async () => ({ ok: true, text: "Declares a constant x." }),
    });

    emitExplainTimeline(stream, "e4", fileRel, result, "selection");
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    expect(events.some((e) => e.type === "file_write")).toBe(false);
    expect(events[0]?.toolName).toBe("explain");
  });
});
