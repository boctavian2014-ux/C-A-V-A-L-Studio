import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createAiPersistence } from "../../../src/main/db/ai-persistence";
import {
  clearTimelineBuffer,
  emitTimelineEvent,
  flushTimeline,
  peekTimelineBuffer,
  resetTimelineBuffersForTests,
} from "../../../src/main/ai/timeline-emit";
import {
  closeAllAiPersistence,
  discardIncompleteStreamTimeline,
  persistAssistantMessageAndFlush,
  resetAiPersistenceCacheForTests,
} from "../../../src/main/ai/timeline-persistence";

const SECRET = "sk-or-v1-abcdefghijklmnopqrstuvwxyz012345";

function createStream() {
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    stream: {
      send: (chunk: Record<string, unknown>) => {
        sent.push(chunk);
        return true;
      },
      isAlive: () => true,
    },
  };
}

describe("7a.2 timeline flush at message completion", () => {
  const roots: string[] = [];

  afterEach(() => {
    resetTimelineBuffersForTests();
    resetAiPersistenceCacheForTests();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-7a2-"));
    roots.push(root);
    return root;
  }

  it("emits events then flush writes them all with the message id", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const { stream } = createStream();
    const streamId = "s-complete";

    emitTimelineEvent(stream, streamId, {
      type: "tool_call",
      label: "Running get_problems",
      toolName: "get_problems",
    });
    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: "get_problems succeeded",
      toolName: "get_problems",
      success: true,
    });
    expect(peekTimelineBuffer(streamId)).toHaveLength(2);

    const conversationId = db.createConversation(root, "Flush");
    const messageId = db.addMessage(conversationId, "assistant", "done", streamId);
    flushTimeline(streamId, messageId, db);

    expect(peekTimelineBuffer(streamId)).toHaveLength(0);
    const stored = db.getTimelineEvents(messageId);
    expect(stored).toHaveLength(2);
    expect(stored.map((e) => e.type)).toEqual(["tool_call", "tool_result"]);
    db.close();
  });

  it("abort clears the buffer and writes nothing", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const { stream } = createStream();
    const streamId = "s-abort";

    emitTimelineEvent(stream, streamId, {
      type: "reasoning",
      label: "Thinking…",
    });
    expect(peekTimelineBuffer(streamId)).toHaveLength(1);

    discardIncompleteStreamTimeline(streamId);
    expect(peekTimelineBuffer(streamId)).toHaveLength(0);

    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "should not have timeline");
    expect(db.getTimelineEvents(messageId)).toHaveLength(0);
    db.close();
  });

  it("redacts secrets in detail at flush", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const { stream } = createStream();
    const streamId = "s-redact";

    emitTimelineEvent(stream, streamId, {
      type: "tool_result",
      label: "ok",
      detail: `token ${SECRET}`,
      success: true,
    });

    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "ok", streamId);
    flushTimeline(streamId, messageId, db);

    const stored = db.getTimelineEvents(messageId);
    expect(stored[0]?.detail).toContain("[REDACTED]");
    expect(JSON.stringify(stored)).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    db.close();
  });

  it("preserves event order by timestamp", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const { stream } = createStream();
    const streamId = "s-order";

    emitTimelineEvent(stream, streamId, { type: "reasoning", label: "a" });
    emitTimelineEvent(stream, streamId, { type: "tool_call", label: "b", toolName: "t" });
    emitTimelineEvent(stream, streamId, { type: "file_write", label: "c", filePath: "src/a.ts" });

    const conversationId = db.createConversation(root);
    const messageId = db.addMessage(conversationId, "assistant", "ok", streamId);
    flushTimeline(streamId, messageId, db);

    const stored = db.getTimelineEvents(messageId);
    expect(stored.map((e) => e.label)).toEqual(["a", "b", "c"]);
    for (let i = 1; i < stored.length; i++) {
      expect(stored[i]!.timestamp).toBeGreaterThanOrEqual(stored[i - 1]!.timestamp);
    }
    db.close();
  });

  it("flush on unknown streamId is a no-op", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    expect(() => flushTimeline("missing-stream", "msg-x", db)).not.toThrow();
    db.close();
  });

  it("persistAssistantMessageAndFlush inserts the assistant row then timeline", () => {
    const root = tempRoot();
    const db = createAiPersistence(root);
    const { stream } = createStream();
    const streamId = "s-persist";
    const conversationId = "thread-ui-1";

    emitTimelineEvent(stream, streamId, {
      type: "reasoning",
      label: "Analyzing…",
    });

    const result = persistAssistantMessageAndFlush({
      workspaceRoot: root,
      conversationId,
      streamId,
      content: "assistant reply",
      persistence: db,
    });

    expect(result?.conversationId).toBe(conversationId);
    expect(result?.messageId).toBeTruthy();
    const messages = db.getMessages(conversationId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.content).toBe("assistant reply");
    expect(db.getTimelineEvents(result!.messageId)).toHaveLength(1);
    expect(peekTimelineBuffer(streamId)).toHaveLength(0);
    db.close();
  });

  it("clearTimelineBuffer on abort leaves an empty map slot-free", () => {
    const { stream } = createStream();
    emitTimelineEvent(stream, "s-clear", { type: "error", label: "cancelled", success: false });
    clearTimelineBuffer("s-clear");
    expect(peekTimelineBuffer("s-clear")).toEqual([]);
  });

  it("closeAllAiPersistence is safe to call twice with no open databases", () => {
    expect(() => closeAllAiPersistence()).not.toThrow();
    expect(() => closeAllAiPersistence()).not.toThrow();
  });
});
