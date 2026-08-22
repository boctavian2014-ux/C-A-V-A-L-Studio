import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../../src/main/db/ai-persistence";
import {
  AI_PERSIST_SNAPSHOT_MAX_BYTES,
} from "../../../src/main/db/ai-persistence";
import {
  persistAcceptedWrittenFiles,
  persistWrittenFiles,
  resolveAcceptMessageId,
} from "../../../src/main/ai/written-files-persistence";
import { resetAiPersistenceCacheForTests } from "../../../src/main/ai/timeline-persistence";
import {
  clearProposedWrites,
  resetProposedWritesForTests,
  stageProposedWrites,
} from "../../../src/main/ai/proposed-writes-buffer";
import {
  applyProposedWritesToDisk,
} from "../../../ai/composer/scaffold-apply-node";
import { sanitizeProposedWrites } from "../../../src/shared/ai-chat-apply-contract";

const SECRET = "sk-or-v1-abcdefghijklmnopqrstuvwxyz012345";

describe("7a.3 written files persistence on Accept", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetAiPersistenceCacheForTests();
    resetProposedWritesForTests();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-7a3-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    return root;
  }

  it("Accept on 2 files stores both snapshots under the message id", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root, "Accept");
    const messageId = db.addMessage(conversationId, "assistant", "proposed", "s1");

    fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 2;\n", "utf8");
    fs.writeFileSync(path.join(root, "src", "b.ts"), "export const b = 2;\n", "utf8");

    const { persisted } = persistWrittenFiles(
      messageId,
      ["src/a.ts", "src/b.ts"],
      root,
      db
    );
    expect(persisted).toEqual(["src/a.ts", "src/b.ts"]);

    const stored = db.getWrittenFiles(messageId);
    expect(stored).toHaveLength(2);
    expect(stored.map((f) => f.filePath).sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(stored.find((f) => f.filePath === "src/a.ts")?.snapshot).toContain("a = 2");
    db.close();
  });

  it("Reject leaves written_files empty", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "proposed");

    const writes = sanitizeProposedWrites([
      { path: "src/new.ts", content: "export const n = 1;\n", isNew: true },
    ]);
    stageProposedWrites("stage-reject", writes);
    clearProposedWrites("stage-reject");
    expect(fs.existsSync(path.join(root, "src", "new.ts"))).toBe(false);
    expect(db.getWrittenFiles(messageId)).toHaveLength(0);
    db.close();
  });

  it("new file Accept snapshots created content", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "new file");

    const writes = sanitizeProposedWrites([
      {
        path: "src/hello.ts",
        content: "export const hello = 1;\n",
        isNew: true,
      },
    ]);
    const { applied } = applyProposedWritesToDisk(root, writes);
    expect(applied).toEqual(["src/hello.ts"]);

    persistWrittenFiles(messageId, applied, root, db);
    const snap = db.getWrittenFiles(messageId)[0];
    expect(snap?.filePath).toBe("src/hello.ts");
    expect(snap?.snapshot).toContain("hello = 1");
    db.close();
  });

  it("oversized snapshot is truncated", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "big");

    const big = "y".repeat(AI_PERSIST_SNAPSHOT_MAX_BYTES + 5000);
    fs.writeFileSync(path.join(root, "src", "big.ts"), big, "utf8");

    persistWrittenFiles(messageId, ["src/big.ts"], root, db);
    const snap = db.getWrittenFiles(messageId)[0]!.snapshot;
    expect(Buffer.byteLength(snap, "utf8")).toBeLessThanOrEqual(
      AI_PERSIST_SNAPSHOT_MAX_BYTES
    );
    expect(snap).toContain("[TRUNCATED]");
    db.close();
  });

  it("redacts secrets in snapshots", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "secret");

    fs.writeFileSync(
      path.join(root, "src", "secret.ts"),
      `const k = '${SECRET}';\n`,
      "utf8"
    );
    persistWrittenFiles(messageId, ["src/secret.ts"], root, db);
    const snap = db.getWrittenFiles(messageId)[0]!.snapshot;
    expect(snap).toContain("[REDACTED]");
    expect(snap).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    db.close();
  });

  it("skips inaccessible files and still persists the rest", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "partial");

    fs.writeFileSync(path.join(root, "src", "ok.ts"), "export const ok = 1;\n", "utf8");

    const { persisted, skipped } = persistWrittenFiles(
      messageId,
      ["src/ok.ts", "src/missing.ts"],
      root,
      db
    );
    expect(persisted).toEqual(["src/ok.ts"]);
    expect(skipped).toEqual(["src/missing.ts"]);
    expect(db.getWrittenFiles(messageId)).toHaveLength(1);
    db.close();
  });

  it("persistAcceptedWrittenFiles resolves message via conversation and stream", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const conversationId = "thread-ui-accept";
    db.createConversation(root, "Chat", conversationId);
    const messageId = db.addMessage(conversationId, "assistant", "awaiting accept", "stream-9");

    fs.writeFileSync(path.join(root, "src", "x.ts"), "export const x = 1;\n", "utf8");

    const result = persistAcceptedWrittenFiles({
      workspaceRoot: root,
      filePaths: ["src/x.ts"],
      conversationId,
      streamId: "stream-9",
      persistence: db,
    });

    expect(result.messageId).toBe(messageId);
    expect(result.persisted).toEqual(["src/x.ts"]);
    expect(db.getWrittenFiles(messageId)[0]?.snapshot).toContain("x = 1");
    db.close();
  });

  it("resolveAcceptMessageId creates an assistant row when none exists", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const messageId = resolveAcceptMessageId({
      persistence: db,
      workspaceRoot: root,
      conversationId: "empty-thread",
    });
    expect(messageId).toBeTruthy();
    expect(db.getMessages("empty-thread")[0]?.role).toBe("assistant");
    db.close();
  });
});
