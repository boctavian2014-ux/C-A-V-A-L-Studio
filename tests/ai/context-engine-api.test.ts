import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ContextEngineApi } from "../../context-engine/api";

describe("ContextEngineApi", () => {
  it("indexes workspace and returns searchable documents", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "caval-ctx-"));
    await fs.writeFile(path.join(root, "hello.ts"), "export function hello() { return 1; }\n", "utf8");

    const api = new ContextEngineApi();
    const docs = await api.indexWorkspace(root);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]?.path).toBe("hello.ts");

    const results = await api.search("hello function", 5);
    expect(results.length).toBeGreaterThan(0);

    const edges = api.dependencies();
    expect(Array.isArray(edges)).toBe(true);
  });

  it("restores workspace from disk cache", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "caval-ctx-restore-"));
    await fs.writeFile(path.join(root, "app.ts"), "export const app = 1;\n", "utf8");

    const api = new ContextEngineApi();
    await api.indexWorkspace(root);

    const restored = new ContextEngineApi();
    const docs = await restored.restoreWorkspace(root);
    expect(docs?.length).toBeGreaterThan(0);
  });
});
