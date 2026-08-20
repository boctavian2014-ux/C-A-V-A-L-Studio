import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../src/main/db/ai-persistence";
import {
  deleteHistoryConversation,
  listHistoryConversations,
  loadHistoryConversation,
  revertHistoryWrittenFile,
} from "../../src/main/ai/ai-history-service";
import { resetAiPersistenceCacheForTests } from "../../src/main/ai/timeline-persistence";
import { historyPayloadToChatMessages } from "../../src/renderer/store/ai-history-store";
import { formatHistoryWhen } from "../../src/shared/ai-history-contract";

describe("7a.4 AI history restore", () => {
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

  it("lists only conversations for the current workspace", () => {
    const rootA = tempRoot("caval-7a4-a-");
    const rootB = tempRoot("caval-7a4-b-");
    const dbA = createAiPersistence(rootA);
    const dbB = createAiPersistence(rootB);
    dbA.createConversation(rootA, "A chat");
    dbB.createConversation(rootB, "B chat");

    const listA = listHistoryConversations(rootA, dbA);
    const listB = listHistoryConversations(rootB, dbB);
    expect(listA.map((c) => c.title)).toEqual(["A chat"]);
    expect(listB.map((c) => c.title)).toEqual(["B chat"]);
    dbA.close();
    dbB.close();
  });

  it("restores messages, timeline, and written files", () => {
    const root = tempRoot("caval-7a4-restore-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Fix bugs");
    db.addMessage(cid, "user", "please fix");
    const mid = db.addMessage(cid, "assistant", "fixed", "s1");
    db.addTimelineEvents(mid, [
      {
        id: "tl-1",
        type: "tool_call",
        timestamp: 1,
        label: "Running get_problems",
        toolName: "get_problems",
      },
      {
        id: "tl-2",
        type: "file_write",
        timestamp: 2,
        label: "Updated src/a.ts",
        filePath: "src/a.ts",
        success: true,
      },
    ]);
    db.addWrittenFiles(mid, [
      { filePath: "src/a.ts", snapshot: "export const a = 1;\n" },
    ]);

    const payload = loadHistoryConversation(root, cid, db);
    expect(payload?.messages).toHaveLength(2);
    expect(payload?.timelineByMessage[mid]).toHaveLength(2);
    expect(payload?.writtenFilesByMessage[mid]?.[0]?.filePath).toBe("src/a.ts");
    expect(payload?.writtenFilesByMessage[mid]?.[0]?.snapshot).toBeUndefined();

    const chatMessages = historyPayloadToChatMessages(payload!);
    expect(chatMessages[1]?.timelineEvents?.map((e) => e.type)).toEqual([
      "tool_call",
      "file_write",
    ]);
    expect(chatMessages[1]?.historicalWrittenFiles?.[0]?.filePath).toBe("src/a.ts");
    db.close();
  });

  it("reverts a historical written file to its snapshot", () => {
    const root = tempRoot("caval-7a4-revert-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Revert me");
    const mid = db.addMessage(cid, "assistant", "wrote");
    db.addWrittenFiles(mid, [
      { filePath: "src/app.ts", snapshot: "export const app = 'old';\n" },
    ]);
    const wf = db.getWrittenFiles(mid)[0]!;
    fs.writeFileSync(path.join(root, "src", "app.ts"), "export const app = 'new';\n", "utf8");

    const result = revertHistoryWrittenFile(root, wf.id!, db);
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "src", "app.ts"), "utf8")).toContain("'old'");
    db.close();
  });

  it("delete conversation cascades and updates the list", () => {
    const root = tempRoot("caval-7a4-del-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Gone");
    const mid = db.addMessage(cid, "assistant", "bye");
    db.addTimelineEvents(mid, [
      { id: "t", type: "reasoning", timestamp: 1, label: "x" },
    ]);
    expect(deleteHistoryConversation(root, cid, db).ok).toBe(true);
    expect(listHistoryConversations(root, db)).toHaveLength(0);
    expect(db.getTimelineEvents(mid)).toHaveLength(0);
    db.close();
  });

  it("formatHistoryWhen buckets today/yesterday", () => {
    const now = Date.now();
    expect(formatHistoryWhen(now, now)).toBe("Today");
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    expect(formatHistoryWhen(yesterday.getTime(), now)).toBe("Yesterday");
  });
});
