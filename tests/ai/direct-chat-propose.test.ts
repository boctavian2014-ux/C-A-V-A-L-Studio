import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stageDirectChatScaffoldProposal } from "../../ai/composer/direct-chat-propose";
import { planFinishDiskWritesForUserMessage } from "../../ai/composer/finish-disk-write-gate";
import {
  getProposedWrites,
  resetProposedWritesForTests,
} from "../../src/main/ai/proposed-writes-buffer";

const BROKEN_FENCE = [
  "```typescript:src/broken.ts",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
  "```",
].join("\n");

const INVALID_FENCE = ["```", "not a path fence", "```"].join("\n");

describe("P1.2 direct Code fence staging", () => {
  let root = "";

  afterEach(() => {
    vi.restoreAllMocks();
    resetProposedWritesForTests();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  function workspace(): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-p12-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "broken.ts"), 'export function add(a: number, b: number) {\n  return a + "x";\n}\n');
    return root;
  }

  it("stages proposedWrites for PROPOSE_EDIT and a valid fence without touching disk", () => {
    const ws = workspace();
    const before = fs.readFileSync(path.join(ws, "src", "broken.ts"), "utf8");
    const writeSpy = vi.spyOn(fs, "writeFileSync");

    const proposed = stageDirectChatScaffoldProposal({
      workspaceRoot: ws,
      text: BROKEN_FENCE,
      capability: { effective: "PROPOSE_EDIT" },
      stageKey: "code-1",
    });

    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.path).toBe("src/broken.ts");
    expect(proposed[0]?.content).toContain("return a + b");
    expect(getProposedWrites("code-1")).toEqual(proposed);
    expect(fs.readFileSync(path.join(ws, "src", "broken.ts"), "utf8")).toBe(before);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("does not stage READ_ONLY even with a valid fence", () => {
    const ws = workspace();
    const proposed = stageDirectChatScaffoldProposal({
      workspaceRoot: ws,
      text: BROKEN_FENCE,
      capability: { effective: "READ_ONLY" },
      stageKey: "ask-1",
    });
    expect(proposed).toEqual([]);
    expect(getProposedWrites("ask-1")).toEqual([]);
  });

  it("does not stage an invalid fence", () => {
    const ws = workspace();
    const proposed = stageDirectChatScaffoldProposal({
      workspaceRoot: ws,
      text: INVALID_FENCE,
      capability: { effective: "PROPOSE_EDIT" },
      stageKey: "code-invalid",
    });
    expect(proposed).toEqual([]);
    expect(getProposedWrites("code-invalid")).toEqual([]);
  });

  it("does not stage when the turn was aborted by the watchdog", () => {
    const ws = workspace();
    const proposed = stageDirectChatScaffoldProposal({
      workspaceRoot: ws,
      text: BROKEN_FENCE,
      capability: { effective: "PROPOSE_EDIT" },
      stageKey: "code-timeout",
      aborted: true,
    });
    expect(proposed).toEqual([]);
    expect(getProposedWrites("code-timeout")).toEqual([]);
    expect(
      planFinishDiskWritesForUserMessage({
        userMessage: "Creează un fix pentru eroarea TypeScript din src/broken.ts.",
      }).applyFallbackScaffold
    ).toBe(false);
  });
});
