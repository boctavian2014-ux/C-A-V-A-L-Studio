import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyProposedWritesToDisk,
  proposeScaffoldWrites,
  revertNewProposedWrites,
} from "../../ai/composer/scaffold-apply-node";
import {
  clipProposedContentForPreview,
  formatProposedWritesHeadline,
  sanitizeProposedWrites,
} from "../../src/shared/ai-chat-apply-contract";
import {
  clearProposedWrites,
  getProposedWrites,
  resetProposedWritesForTests,
  stageProposedWrites,
} from "../../src/main/ai/proposed-writes-buffer";
import { emitQuickFixAcceptTimeline } from "../../src/main/ai/quick-fix-runner";
import type { TimelineEvent } from "../../src/shared/ai-timeline-contract";

describe("M6.4 chat apply parity", () => {
  let root = "";

  afterEach(() => {
    resetProposedWritesForTests();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("proposes scaffold writes without touching disk", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-apply-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const existing = path.join(root, "src", "a.ts");
    fs.writeFileSync(existing, "export const a = 1;\n", "utf8");

    const content = [
      "```typescript:src/a.ts",
      "export const a = 2;",
      "```",
      "```typescript:src/b.ts",
      "export const b = 1;",
      "```",
    ].join("\n");

    const proposed = proposeScaffoldWrites(root, content);
    expect(proposed).toHaveLength(2);
    expect(fs.readFileSync(existing, "utf8")).toBe("export const a = 1;\n");
    expect(fs.existsSync(path.join(root, "src", "b.ts"))).toBe(false);

    const staged = stageProposedWrites("run-1", proposed);
    expect(getProposedWrites("run-1")).toHaveLength(2);
    expect(staged.find((w) => w.path === "src/a.ts")?.isNew).toBe(false);
    expect(staged.find((w) => w.path === "src/b.ts")?.isNew).toBe(true);
  });

  it("accept writes disk and reject leaves files unchanged", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m6-apply-acc-"));
    const proposed = sanitizeProposedWrites([
      {
        path: "hello.ts",
        content: "export const hello = 1;\n",
        isNew: true,
      },
    ]);
    stageProposedWrites("run-2", proposed);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);

    clearProposedWrites("run-2");
    expect(getProposedWrites("run-2")).toHaveLength(0);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);

    const { applied } = applyProposedWritesToDisk(root, proposed);
    expect(applied).toEqual(["hello.ts"]);
    expect(fs.readFileSync(path.join(root, "hello.ts"), "utf8")).toContain("hello = 1");

    const { deleted } = revertNewProposedWrites(root, proposed);
    expect(deleted).toEqual(["hello.ts"]);
    expect(fs.existsSync(path.join(root, "hello.ts"))).toBe(false);
  });

  it("redacts secrets in preview content", () => {
    const preview = clipProposedContentForPreview(
      "const k = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz012345';"
    );
    expect(preview).toContain("[REDACTED]");
    expect(preview).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(formatProposedWritesHeadline(3)).toMatch(/propuse/);
  });

  it("emits file_write on timeline only after accept", () => {
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
    // propose phase: no file_write
    expect(events.filter((e) => e.type === "file_write")).toHaveLength(0);
    emitQuickFixAcceptTimeline(stream, "chat-apply-1", {
      filePath: "hello.ts",
      editCount: 1,
      detail: "chat apply accepted",
    });
    expect(events.map((e) => e.type)).toEqual(["file_write"]);
    expect(events[0]?.filePath).toBe("hello.ts");
  });
});
