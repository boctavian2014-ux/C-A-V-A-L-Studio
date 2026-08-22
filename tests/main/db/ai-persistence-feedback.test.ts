import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../../src/main/db/ai-persistence";
import {
  clearHistoryFeedback,
  getHistoryFeedback,
  setHistoryFeedback,
} from "../../../src/main/ai/ai-history-service";
import { resetAiPersistenceCacheForTests } from "../../../src/main/ai/timeline-persistence";

describe("7e.2 message feedback persistence", () => {
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

  it("sets positive feedback and upserts rating without duplicates", () => {
    const root = tempRoot("caval-7e2-pos-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Feedback");
    const mid = db.addMessage(cid, "assistant", "Hello", "stream-fb");

    const first = setHistoryFeedback(root, mid, "positive", undefined, undefined, db);
    expect(first.ok).toBe(true);
    expect(first.feedback?.rating).toBe("positive");
    expect(db.getFeedback(mid)?.rating).toBe("positive");

    const flipped = setHistoryFeedback(root, mid, "negative", "too vague", undefined, db);
    expect(flipped.ok).toBe(true);
    expect(flipped.feedback?.rating).toBe("negative");
    expect(flipped.feedback?.comment).toBe("too vague");
    // UNIQUE(message_id) → one row
    expect(db.getFeedback(mid)?.comment).toBe("too vague");
    db.close();
  });

  it("clears feedback on toggle-off path", () => {
    const root = tempRoot("caval-7e2-clear-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Clear");
    const mid = db.addMessage(cid, "assistant", "Hi", "s1");
    setHistoryFeedback(root, mid, "positive", undefined, undefined, db);
    expect(clearHistoryFeedback(root, mid, undefined, db).ok).toBe(true);
    expect(getHistoryFeedback(root, mid, undefined, db).feedback).toBeNull();
    db.close();
  });

  it("resolves feedback by streamId when UI id differs", () => {
    const root = tempRoot("caval-7e2-stream-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Stream");
    const mid = db.addMessage(cid, "assistant", "Done", "ui-stream-xyz");
    const res = setHistoryFeedback(root, "ui-bubble-id", "positive", undefined, "ui-stream-xyz", db);
    expect(res.ok).toBe(true);
    expect(res.feedback?.messageId).toBe(mid);
    expect(getHistoryFeedback(root, "ui-bubble-id", "ui-stream-xyz", db).feedback?.rating).toBe(
      "positive"
    );
    db.close();
  });

  it("cascade deletes feedback with conversation", () => {
    const root = tempRoot("caval-7e2-cascade-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "Cascade");
    const mid = db.addMessage(cid, "assistant", "Bye", "s-casc");
    db.setFeedback(mid, "negative", "nope");
    expect(db.getFeedback(mid)?.rating).toBe("negative");
    db.deleteConversation(cid);
    expect(db.getFeedback(mid)).toBeNull();
    db.close();
  });

  it("rejects feedback on user messages", () => {
    const root = tempRoot("caval-7e2-user-");
    const db = createAiPersistence(root);
    const cid = db.createConversation(root, "User");
    const mid = db.addMessage(cid, "user", "question");
    const res = setHistoryFeedback(root, mid, "positive", undefined, undefined, db);
    expect(res.ok).toBe(false);
    db.close();
  });
});
