import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalContextCache } from "../../context-engine/local-cache";

describe("LocalContextCache", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes and reads indexed documents", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-cache-"));
    const cache = new LocalContextCache();
    const documents = [{
      id: "doc-1",
      path: "src/main.ts",
      language: "ts",
      contentHash: "abc",
      chunks: [{
        id: "c1",
        documentId: "doc-1",
        path: "src/main.ts",
        text: "console.log('hi');",
        startLine: 1,
        endLine: 1
      }]
    }];

    await cache.write(tempDir, documents);
    const restored = await cache.read(tempDir);
    expect(restored?.[0].path).toBe("src/main.ts");
  });

  it("returns null when cache is missing", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-cache-"));
    expect(await new LocalContextCache().read(tempDir)).toBeNull();
  });
});
