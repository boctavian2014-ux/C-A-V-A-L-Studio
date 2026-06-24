import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectIndexer } from "../../context-engine/indexer";

describe("ProjectIndexer", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("skips .env files and redacts secrets in indexed content", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-index-"));
    await fs.writeFile(path.join(tempDir, "app.ts"), "export const ok = true;\n", "utf8");
    await fs.writeFile(path.join(tempDir, ".env"), "API_KEY=super-secret\n", "utf8");
    await fs.writeFile(path.join(tempDir, "config.json"), 'api_key: "visible"\n', "utf8");

    const indexer = new ProjectIndexer();
    const docs = await indexer.scanProject(tempDir);
    expect(docs.some((d) => d.path.includes(".env"))).toBe(false);
    const config = docs.find((d) => d.path.endsWith("config.json"));
    expect(config?.chunks[0].text).toContain("[REDACTED]");
  });

  it("indexes typescript files under workspace", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-index-"));
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "main.ts"), "console.log('hi');", "utf8");

    const docs = await new ProjectIndexer().scanProject(tempDir);
    expect(docs.some((d) => d.path.replace(/\\/g, "/").endsWith("src/main.ts"))).toBe(true);
  });
});
