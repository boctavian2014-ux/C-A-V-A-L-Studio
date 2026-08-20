import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../../src/main/db/ai-persistence";
import {
  buildJsonExport,
  buildMarkdownExport,
  exportHistoryConversation,
  slugifyExportTitle,
} from "../../../src/main/ai/ai-history-export";
import { resetAiPersistenceCacheForTests } from "../../../src/main/ai/timeline-persistence";

describe("7a.5 AI history export", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetAiPersistenceCacheForTests();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    return root;
  }

  function seedConversation(root: string) {
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Export Demo");
    db.addMessage(cid, "user", "Please rename User; key=sk-ant-abcdefghijklmnopqrstuvwxyz");
    const mid = db.addMessage(cid, "assistant", "Renamed. token=sk-or-v1-ABCDEFGH12345678", "export-stream");
    db.addTimelineEvents(mid, [
      {
        id: "tl-1",
        type: "tool_call",
        timestamp: 1_700_000_000_000,
        label: "refactor rename",
        toolName: "refactor",
      },
      {
        id: "tl-2",
        type: "file_write",
        timestamp: 1_700_000_000_100,
        label: "Updated src/user.ts",
        filePath: "src/user.ts",
        success: true,
      },
    ]);
    db.addWrittenFiles(mid, [
      {
        filePath: "src/user.ts",
        snapshot: "export type Account = { id: string };\nSECRET=super-secret-value\n",
      },
    ]);
    return { db, cid, mid };
  }

  it("exports valid JSON with messages, timeline, and file paths only", () => {
    const root = tempRoot("caval-7a5-json-");
    const { db, cid } = seedConversation(root);

    const result = exportHistoryConversation(root, cid, "json", { persistence: db });
    expect(result.success).toBe(true);
    expect(result.suggestedFilename).toMatch(/^export-demo-[a-f0-9]{8}\.json$/i);

    const parsed = JSON.parse(result.content!) as {
      title: string;
      messages: Array<{
        role: string;
        content: string;
        timeline?: Array<{ type: string; label: string }>;
        writtenFiles?: string[];
      }>;
    };
    expect(parsed.title).toBe("Export Demo");
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[1]?.timeline?.map((e) => e.type)).toEqual([
      "tool_call",
      "file_write",
    ]);
    expect(parsed.messages[1]?.writtenFiles).toEqual(["src/user.ts"]);
    expect(result.content).not.toContain("super-secret-value");
    expect(result.content).not.toContain("export type Account");
    db.close();
  });

  it("exports readable Markdown with sections", () => {
    const root = tempRoot("caval-7a5-md-");
    const { db, cid } = seedConversation(root);

    const result = exportHistoryConversation(root, cid, "markdown", { persistence: db });
    expect(result.success).toBe(true);
    expect(result.suggestedFilename?.endsWith(".md")).toBe(true);
    expect(result.content).toContain("# Export Demo");
    expect(result.content).toContain("## User");
    expect(result.content).toContain("## Assistant");
    expect(result.content).toContain("**Activity:**");
    expect(result.content).toContain("`tool_call` refactor rename");
    expect(result.content).toContain("**Files changed:**");
    expect(result.content).toContain("- src/user.ts");
    expect(result.content).not.toContain("SECRET=super-secret-value");
    db.close();
  });

  it("returns error for missing conversation", () => {
    const root = tempRoot("caval-7a5-missing-");
    const db = createAiPersistence(root);
    const result = exportHistoryConversation(root, "no-such-id", "json", { persistence: db });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    db.close();
  });

  it("keeps already-redacted DB content redacted in export", () => {
    const root = tempRoot("caval-7a5-redact-");
    const { db, cid } = seedConversation(root);
    const result = exportHistoryConversation(root, cid, "json", { persistence: db });
    expect(result.success).toBe(true);
    // Persistence redacts on insert; export must not reintroduce raw secrets.
    expect(result.content).not.toMatch(/sk-ant-abcdefghijklmnopqrstuvwxyz/);
    expect(result.content).not.toMatch(/sk-or-v1-ABCDEFGH12345678/);
    expect(result.content).toMatch(/\[REDACTED\]/);
    db.close();
  });

  it("size warning fires before returning oversized content", () => {
    const root = tempRoot("caval-7a5-size-");
    const { db, cid } = seedConversation(root);

    const blocked = exportHistoryConversation(root, cid, "markdown", {
      persistence: db,
      warnBytes: 40,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.sizeWarning).toBe(true);
    expect(blocked.content).toBeUndefined();
    expect(blocked.byteLength).toBeGreaterThan(40);

    const allowed = exportHistoryConversation(root, cid, "markdown", {
      persistence: db,
      warnBytes: 40,
      acknowledgeLarge: true,
    });
    expect(allowed.success).toBe(true);
    expect(allowed.content?.length).toBeGreaterThan(40);
    db.close();
  });

  it("slugify and builders work for empty timeline", () => {
    expect(slugifyExportTitle("Hello World!!")).toBe("hello-world");
    expect(slugifyExportTitle("@@@")).toBe("chat");
    const md = buildMarkdownExport({
      id: "x",
      title: "T",
      messages: [{ id: "m1", role: "user", content: "hi", createdAt: 1 }],
      timelineByMessage: {},
      writtenFilesByMessage: {},
    });
    expect(md).toContain("# T");
    expect(md).toContain("hi");
    const json = buildJsonExport({
      id: "x",
      title: "T",
      messages: [{ id: "m1", role: "user", content: "hi", createdAt: 1 }],
      timelineByMessage: {},
      writtenFilesByMessage: {},
    });
    expect(JSON.parse(json).messages[0].role).toBe("user");
  });
});
