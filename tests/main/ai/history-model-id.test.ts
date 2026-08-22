import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadHistoryConversation } from "../../../src/main/ai/ai-history-service";
import { createAiPersistence } from "../../../src/main/db/ai-persistence";

describe("7f.1 history modelId restore payload", () => {
  const roots: string[] = [];
  const dbs: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("includes modelId when set and null for legacy conversations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-7f1-hist-"));
    roots.push(root);
    const db = createAiPersistence(root);
    dbs.push(db);

    const withModel = db.createConversation(root, "new");
    db.updateConversationModelId(withModel, "caval-auto/free");
    db.addMessage(withModel, "user", "hi");

    const payload = loadHistoryConversation(root, withModel, db);
    expect(payload?.modelId).toBe("caval-auto/free");

    const legacy = db.createConversation(root, "old");
    db.addMessage(legacy, "user", "yo");
    const legacyPayload = loadHistoryConversation(root, legacy, db);
    expect(legacyPayload?.modelId ?? null).toBeNull();
  });
});
