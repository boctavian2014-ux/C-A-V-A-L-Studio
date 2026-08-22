/**
 * Pas 7a.x — unified M7a persistence smoke.
 * Path: conversation → SQLite → reload → restore → export (no secrets) → revert → cascade cleanup.
 * In-process (no Playwright / live LLM).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  aiHistoryDbPath,
  createAiPersistence,
  type AiPersistence,
} from "../../src/main/db/ai-persistence";
import { exportHistoryConversation } from "../../src/main/ai/ai-history-export";
import {
  deleteHistoryConversation,
  listHistoryConversations,
  loadHistoryConversation,
  revertHistoryWrittenFile,
} from "../../src/main/ai/ai-history-service";
import { resetAiPersistenceCacheForTests } from "../../src/main/ai/timeline-persistence";
import { historyPayloadToChatMessages } from "../../src/renderer/store/ai-history-store";

const SECRET_USER = "My API key is sk-abcdefghijklmnopqrstuvwxyz012345";
const SECRET_ASSISTANT =
  "Fixed with Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789 and sk-or-v1-ABCDEFGH12345678";

describe("M7a persistence unified smoke", () => {
  const temps: string[] = [];
  let workspaceRoot = "";
  let persistence: AiPersistence | null = null;

  function createTempWorkspace(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temps.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    return root;
  }

  afterEach(() => {
    resetAiPersistenceCacheForTests();
    try {
      persistence?.close();
    } catch {
      /* already closed */
    }
    persistence = null;
    for (const root of temps.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    workspaceRoot = "";
  });

  it("persists, reloads, restores, exports, reverts, and cascade-deletes", () => {
    workspaceRoot = createTempWorkspace("caval-m7a-unified-");
    persistence = createAiPersistence(workspaceRoot);

    expect(fs.existsSync(aiHistoryDbPath(workspaceRoot))).toBe(true);

    // 1. Conversation + timeline + written file (Accept path)
    const conversationId = persistence.createConversation(workspaceRoot, "Test chat");
    persistence.addMessage(conversationId, "user", `Fix the bug in app.ts. ${SECRET_USER}`);
    const messageId = persistence.addMessage(
      conversationId,
      "assistant",
      `I found the issue… ${SECRET_ASSISTANT}`,
      "stream-1"
    );

    persistence.addTimelineEvents(messageId, [
      {
        id: "tl-call",
        type: "tool_call",
        label: "get_problems",
        toolName: "get_problems",
        timestamp: Date.now(),
      },
      {
        id: "tl-result",
        type: "tool_result",
        label: "Found 1 error",
        timestamp: Date.now() + 1,
        success: true,
      },
      {
        id: "tl-write",
        type: "file_write",
        label: "Updated src/app.ts",
        filePath: "src/app.ts",
        timestamp: Date.now() + 2,
        success: true,
      },
    ]);

    persistence.addWrittenFiles(messageId, [
      {
        filePath: "src/app.ts",
        snapshot: "const fixed = true;\n// SECRET=must-not-appear-in-export\n",
      },
    ]);

    // 2. Reload (simulate app restart)
    persistence.close();
    persistence = createAiPersistence(workspaceRoot);

    // 3. Restore via service APIs used by IPC / UI
    const conversations = listHistoryConversations(workspaceRoot, persistence);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.title).toBe("Test chat");
    expect(conversations[0]?.messageCount).toBe(2);

    const messages = persistence.getMessages(conversationId);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
    // Redaction at INSERT — raw secrets must not survive on disk
    expect(messages[0]?.content).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
    expect(messages[1]?.content).toMatch(/\[REDACTED\]/);

    const timeline = persistence.getTimelineEvents(messageId);
    expect(timeline).toHaveLength(3);
    expect(timeline[2]?.type).toBe("file_write");

    const writtenFiles = persistence.getWrittenFiles(messageId);
    expect(writtenFiles).toHaveLength(1);
    expect(writtenFiles[0]?.filePath).toBe("src/app.ts");
    expect(writtenFiles[0]?.snapshot).toContain("const fixed = true;");

    const payload = loadHistoryConversation(workspaceRoot, conversationId, persistence);
    expect(payload).not.toBeNull();
    const uiMessages = historyPayloadToChatMessages(payload!);
    expect(uiMessages[1]?.timelineEvents?.length).toBe(3);
    expect(uiMessages[1]?.historicalWrittenFiles?.[0]?.filePath).toBe("src/app.ts");
    // Snapshots stay out of UI restore payload
    expect(uiMessages[1]?.historicalWrittenFiles?.[0]).not.toHaveProperty("snapshot");

    // 4. Export JSON + MD — ephemeral, paths only, no secrets / no file bodies
    const jsonExport = exportHistoryConversation(workspaceRoot, conversationId, "json", {
      persistence,
    });
    expect(jsonExport.success).toBe(true);
    expect(jsonExport.content).toContain('"title": "Test chat"');
    expect(jsonExport.content).toContain("get_problems");
    expect(jsonExport.content).toContain("src/app.ts");
    expect(jsonExport.content).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
    expect(jsonExport.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(jsonExport.content).not.toContain("sk-or-v1-ABCDEFGH12345678");
    expect(jsonExport.content).not.toContain("must-not-appear-in-export");
    expect(jsonExport.content).not.toContain("const fixed = true");
    expect(jsonExport.content).toMatch(/\[REDACTED\]/);

    const mdExport = exportHistoryConversation(workspaceRoot, conversationId, "markdown", {
      persistence,
    });
    expect(mdExport.success).toBe(true);
    expect(mdExport.content).toContain("# Test chat");
    expect(mdExport.content).toContain("## User");
    expect(mdExport.content).toContain("## Assistant");
    expect(mdExport.content).toContain("**Activity:**");
    expect(mdExport.content).toContain("**Files changed:**");
    expect(mdExport.content).not.toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
    expect(mdExport.content).not.toContain("must-not-appear-in-export");

    // Soft size cap still gates oversized exports
    const blocked = exportHistoryConversation(workspaceRoot, conversationId, "json", {
      persistence,
      warnBytes: 32,
    });
    expect(blocked.success).toBe(false);
    expect(blocked.sizeWarning).toBe(true);
    expect(blocked.content).toBeUndefined();

    // 5. Historical revert restores snapshot onto disk
    const filePath = path.join(workspaceRoot, "src", "app.ts");
    fs.writeFileSync(filePath, "const broken = false;\n", "utf8");
    const writtenId = uiMessages[1]!.historicalWrittenFiles![0]!.id;
    expect(revertHistoryWrittenFile(workspaceRoot, writtenId, persistence).ok).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toContain("const fixed = true;");

    // 6. Cascade delete
    expect(deleteHistoryConversation(workspaceRoot, conversationId, persistence).ok).toBe(true);
    expect(persistence.getConversation(conversationId)).toBeNull();
    expect(persistence.getMessages(conversationId)).toHaveLength(0);
    expect(persistence.getTimelineEvents(messageId)).toHaveLength(0);
    expect(persistence.getWrittenFiles(messageId)).toHaveLength(0);
    expect(listHistoryConversations(workspaceRoot, persistence)).toHaveLength(0);
    expect(exportHistoryConversation(workspaceRoot, conversationId, "json", { persistence }).success).toBe(
      false
    );
  });

  it("isolates workspaces", () => {
    workspaceRoot = createTempWorkspace("caval-m7a-ws-a-");
    const otherWorkspace = createTempWorkspace("caval-m7a-ws-b-");
    persistence = createAiPersistence(workspaceRoot);
    const otherPersistence = createAiPersistence(otherWorkspace);

    persistence.createConversation(workspaceRoot, "Workspace A");
    otherPersistence.createConversation(otherWorkspace, "Workspace B");

    expect(listHistoryConversations(workspaceRoot, persistence).map((c) => c.title)).toEqual([
      "Workspace A",
    ]);
    expect(listHistoryConversations(otherWorkspace, otherPersistence).map((c) => c.title)).toEqual([
      "Workspace B",
    ]);
    // Cross-workspace list via wrong root returns empty / does not leak
    expect(listHistoryConversations(otherWorkspace, persistence)).toHaveLength(0);
    expect(listHistoryConversations(workspaceRoot, otherPersistence)).toHaveLength(0);

    otherPersistence.close();
  });
});
