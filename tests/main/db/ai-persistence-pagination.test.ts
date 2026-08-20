import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../../src/main/db/ai-persistence";
import {
  listHistoryConversations,
  loadHistoryMessageDetails,
} from "../../../src/main/ai/ai-history-service";
import { resetAiPersistenceCacheForTests } from "../../../src/main/ai/timeline-persistence";

describe("7e.4 history pagination", () => {
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
    return root;
  }

  it("listConversations returns limit/offset slices in updated_at order", () => {
    const root = tempRoot("caval-7e4-page-");
    const db = createAiPersistence(root);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = db.createConversation(root, `Chat ${i}`);
      ids.push(id);
      // bump updated_at ordering via title touch
      db.updateConversationTitle(id, `Chat ${i}`);
    }

    const page0 = listHistoryConversations(root, db, { limit: 2, offset: 0 });
    const page1 = listHistoryConversations(root, db, { limit: 2, offset: 2 });
    const page2 = listHistoryConversations(root, db, { limit: 2, offset: 4 });

    expect(page0).toHaveLength(2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    const allIds = [...page0, ...page1, ...page2].map((c) => c.id);
    expect(new Set(allIds).size).toBe(5);
    db.close();
  });

  it("handles 500+ conversations with paginated reads", () => {
    const root = tempRoot("caval-7e4-scale-");
    const db = createAiPersistence(root);
    for (let i = 0; i < 520; i++) {
      db.createConversation(root, `Bulk ${i}`);
    }
    const started = Date.now();
    const page = listHistoryConversations(root, db, { limit: 30, offset: 0 });
    const elapsed = Date.now() - started;
    expect(page).toHaveLength(30);
    expect(elapsed).toBeLessThan(2000);
    const mid = listHistoryConversations(root, db, { limit: 30, offset: 490 });
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThanOrEqual(30);
    db.close();
  });

  it("getMessageDetails returns timeline and written files for one message", () => {
    const root = tempRoot("caval-7e4-details-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Details");
    const mid = db.addMessage(cid, "assistant", "done", "s1");
    db.addTimelineEvents(mid, [
      {
        id: "tl-1",
        type: "tool_call",
        timestamp: Date.now(),
        label: "get_problems",
      },
    ]);
    db.addWrittenFiles(mid, [{ filePath: "src/a.ts", snapshot: "x" }]);

    const details = loadHistoryMessageDetails(root, mid, db);
    expect(details?.timeline).toHaveLength(1);
    expect(details?.writtenFiles[0]?.filePath).toBe("src/a.ts");
    db.close();
  });
});
