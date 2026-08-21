import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AI_PERSIST_MESSAGE_MAX_BYTES,
  AI_PERSIST_SNAPSHOT_MAX_BYTES,
  AI_PERSIST_TRUNCATION_MARKER,
  aiHistoryDbPath,
  createAiPersistence,
  gatePersistedText,
} from "../../../src/main/db/ai-persistence";

const SECRET = "sk-or-v1-abcdefghijklmnopqrstuvwxyz012345";

describe("7a.1 AI SQLite persistence", () => {
  const roots: string[] = [];
  const dbs: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempWorkspace(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    return root;
  }

  it("CRUD conversations: create, get, list, update title, delete", () => {
    const root = tempWorkspace("caval-7a1-conv-");
    const db = createAiPersistence(root);
    dbs.push(db);

    expect(fs.existsSync(aiHistoryDbPath(root))).toBe(true);

    const id = db.createConversation(root, "First chat");
    const got = db.getConversation(id);
    expect(got?.id).toBe(id);
    expect(got?.title).toBe("First chat");
    expect(got?.modelId).toBeNull();
    expect(got?.workspaceRoot).toBe(path.resolve(root));

    expect(db.listConversations(root)).toHaveLength(1);

    db.updateConversationTitle(id, "Renamed");
    expect(db.getConversation(id)?.title).toBe("Renamed");

    db.deleteConversation(id);
    expect(db.getConversation(id)).toBeNull();
    expect(db.listConversations(root)).toHaveLength(0);
  });

  it("7f.1 persists and restores conversation model_id; legacy null is safe", () => {
    const root = tempWorkspace("caval-7f1-model-");
    const db = createAiPersistence(root);
    dbs.push(db);

    const id = db.createConversation(root, "With model");
    expect(db.getConversation(id)?.modelId).toBeNull();

    db.updateConversationModelId(id, "openai/gpt-4o");
    expect(db.getConversation(id)?.modelId).toBe("openai/gpt-4o");

    db.updateConversationModelId(id, null);
    expect(db.getConversation(id)?.modelId).toBeNull();

    // Re-open DB (additive migration path).
    db.close();
    dbs.pop();
    const db2 = createAiPersistence(root);
    dbs.push(db2);
    const again = db2.createConversation(root, "legacy", id);
    expect(again).toBe(id);
    expect(db2.getConversation(id)?.modelId).toBeNull();
  });

  it("CRUD messages: add and get by conversation", () => {
    const root = tempWorkspace("caval-7a1-msg-");
    const db = createAiPersistence(root);
    dbs.push(db);

    const cid = db.createConversation(root, "Msgs");
    const mid1 = db.addMessage(cid, "user", "hello", "stream-a");
    const mid2 = db.addMessage(cid, "assistant", "hi back", "stream-a");

    const messages = db.getMessages(cid);
    expect(messages.map((m) => m.id)).toEqual([mid1, mid2]);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[0]?.streamId).toBe("stream-a");
  });

  it("cascade delete removes messages, timeline, and written_files", () => {
    const root = tempWorkspace("caval-7a1-cascade-");
    const db = createAiPersistence(root);
    dbs.push(db);

    const cid = db.createConversation(root);
    const mid = db.addMessage(cid, "assistant", "done");
    db.addTimelineEvents(mid, [
      {
        id: "tl-1",
        type: "tool_call",
        timestamp: Date.now(),
        label: "quick_fix",
      },
    ]);
    db.addWrittenFiles(mid, [
      { filePath: "src/a.ts", snapshot: "export const a = 1;\n" },
    ]);

    expect(db.getTimelineEvents(mid)).toHaveLength(1);
    expect(db.getWrittenFiles(mid)).toHaveLength(1);

    db.deleteConversation(cid);
    expect(db.getMessages(cid)).toHaveLength(0);
    expect(db.getTimelineEvents(mid)).toHaveLength(0);
    expect(db.getWrittenFiles(mid)).toHaveLength(0);
  });

  it("redacts secrets on INSERT for content, detail, and snapshot", () => {
    const root = tempWorkspace("caval-7a1-redact-");
    const db = createAiPersistence(root);
    dbs.push(db);

    const cid = db.createConversation(root, `Title with ${SECRET}`);
    expect(db.getConversation(cid)?.title).toContain("[REDACTED]");
    expect(db.getConversation(cid)?.title).not.toContain("abcdefghijklmnopqrstuvwxyz012345");

    const mid = db.addMessage(cid, "user", `Use key ${SECRET}`);
    const msg = db.getMessages(cid)[0]!;
    expect(msg.content).toContain("[REDACTED]");
    expect(msg.content).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(msg.id).toBe(mid);

    db.addTimelineEvents(mid, [
      {
        id: "tl-secret",
        type: "tool_result",
        timestamp: Date.now(),
        label: "ok",
        detail: `token ${SECRET}`,
      },
    ]);
    const tl = db.getTimelineEvents(mid)[0]!;
    expect(tl.detail).toContain("[REDACTED]");
    expect(tl.detail).not.toContain("abcdefghijklmnopqrstuvwxyz012345");

    db.addWrittenFiles(mid, [
      {
        filePath: "src/secret.ts",
        snapshot: `const k = '${SECRET}';\n`,
      },
    ]);
    const wf = db.getWrittenFiles(mid)[0]!;
    expect(wf.snapshot).toContain("[REDACTED]");
    expect(wf.snapshot).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });

  it(
    "respects message and snapshot byte caps with truncation marker",
    () => {
    const root = tempWorkspace("caval-7a1-caps-");
    const db = createAiPersistence(root);
    dbs.push(db);

    const huge = "x".repeat(AI_PERSIST_MESSAGE_MAX_BYTES + 2000);
    const cid = db.createConversation(root);
    db.addMessage(cid, "user", huge);
    const content = db.getMessages(cid)[0]!.content;
    expect(Buffer.byteLength(content, "utf8")).toBeLessThanOrEqual(
      AI_PERSIST_MESSAGE_MAX_BYTES
    );
    expect(content.endsWith(AI_PERSIST_TRUNCATION_MARKER.trim()) || content.includes("[TRUNCATED]")).toBe(
      true
    );

    const mid = db.addMessage(cid, "assistant", "ok");
    const bigSnap = "y".repeat(AI_PERSIST_SNAPSHOT_MAX_BYTES + 4000);
    db.addWrittenFiles(mid, [{ filePath: "big.ts", snapshot: bigSnap }]);
    const snap = db.getWrittenFiles(mid)[0]!.snapshot;
    expect(Buffer.byteLength(snap, "utf8")).toBeLessThanOrEqual(
      AI_PERSIST_SNAPSHOT_MAX_BYTES
    );
    expect(snap).toContain("[TRUNCATED]");
  },
    30_000
  );

  it("isolates conversations across workspaces", () => {
    const rootA = tempWorkspace("caval-7a1-ws-a-");
    const rootB = tempWorkspace("caval-7a1-ws-b-");
    const dbA = createAiPersistence(rootA);
    const dbB = createAiPersistence(rootB);
    dbs.push(dbA, dbB);

    const idA = dbA.createConversation(rootA, "A only");
    const idB = dbB.createConversation(rootB, "B only");

    expect(dbA.listConversations(rootA).map((c) => c.id)).toEqual([idA]);
    expect(dbB.listConversations(rootB).map((c) => c.id)).toEqual([idB]);
    expect(dbA.listConversations(rootB)).toHaveLength(0);
    expect(dbB.listConversations(rootA)).toHaveLength(0);
    expect(dbA.getConversation(idB)).toBeNull();
  });

  it("gatePersistedText redacts before measuring size", () => {
    const out = gatePersistedText(`prefix ${SECRET} suffix`, 10_000);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
  });
});
