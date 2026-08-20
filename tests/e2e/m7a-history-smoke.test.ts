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

/**
 * Pas 7a.4 — in-process history smoke: persist → list → restore → revert → delete.
 * No Playwright / live LLM.
 */
describe("M7a history smoke (one workspace)", () => {
  let root = "";

  afterEach(() => {
    resetAiPersistenceCacheForTests();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("conversation survives reload semantics with isolation and revert", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m7a-history-smoke-"));
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "caval-m7a-history-foreign-"));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });

    const db = createAiPersistence(root);
    const foreignDb = createAiPersistence(foreign);

    const cid = db.createConversation(root, "Smoke chat");
    db.addMessage(cid, "user", "rename User");
    const mid = db.addMessage(cid, "assistant", "done", "smoke-stream");
    db.addTimelineEvents(mid, [
      {
        id: "tl-call",
        type: "tool_call",
        timestamp: Date.now(),
        label: "refactor rename User",
        toolName: "refactor",
      },
      {
        id: "tl-write",
        type: "file_write",
        timestamp: Date.now() + 1,
        label: "Updated src/user.ts",
        filePath: "src/user.ts",
        success: true,
      },
    ]);
    db.addWrittenFiles(mid, [
      {
        filePath: "src/user.ts",
        snapshot: "export type Account = { id: string };\n",
      },
    ]);
    foreignDb.createConversation(foreign, "Other workspace");

    // Reload semantics: new handle on same DB path
    db.close();
    const reopened = createAiPersistence(root);

    const listed = listHistoryConversations(root, reopened);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("Smoke chat");
    expect(listHistoryConversations(foreign, foreignDb).map((c) => c.title)).toEqual([
      "Other workspace",
    ]);

    const payload = loadHistoryConversation(root, cid, reopened);
    expect(payload?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    const uiMessages = historyPayloadToChatMessages(payload!);
    expect(uiMessages[1]?.timelineEvents?.length).toBe(2);
    expect(uiMessages[1]?.historicalWrittenFiles?.[0]?.filePath).toBe("src/user.ts");

    fs.writeFileSync(
      path.join(root, "src", "user.ts"),
      "export type User = { id: string };\n",
      "utf8"
    );
    const writtenId = uiMessages[1]!.historicalWrittenFiles![0]!.id;
    expect(revertHistoryWrittenFile(root, writtenId, reopened).ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "src", "user.ts"), "utf8")).toContain("Account");

    expect(deleteHistoryConversation(root, cid, reopened).ok).toBe(true);
    expect(listHistoryConversations(root, reopened)).toHaveLength(0);

    reopened.close();
    foreignDb.close();
    fs.rmSync(foreign, { recursive: true, force: true });
  });
});
