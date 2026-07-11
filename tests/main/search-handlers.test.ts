import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({ ipcMain: harness.ipcMain }));

describe("search-handlers", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "caval-search-"));
    await fs.promises.writeFile(
      path.join(workspace, "hello.ts"),
      "export const hello = 'world';\n",
      "utf8"
    );
    const { registerSearchHandlers } = await import("../../src/main/search-handlers");
    registerSearchHandlers(() => workspace);
  });

  afterEach(async () => {
    await fs.promises.rm(workspace, { recursive: true, force: true });
  });

  it("caval:search-text finds matches via fallback walker", async () => {
    const res = await harness.invoke<{ ok: boolean; hits: Array<{ path: string; preview: string }> }>(
      "caval:search-text",
      { query: "hello", workspaceRoot: workspace }
    );
    expect(res.ok).toBe(true);
    expect(res.hits.some((h) => h.path.includes("hello.ts"))).toBe(true);
  });

  it("caval:goto-definition resolves exported symbol", async () => {
    await harness.invoke("caval:symbol-index", workspace);
    const res = await harness.invoke<{ ok: boolean; location?: { name: string } }>(
      "caval:goto-definition",
      { workspaceRoot: workspace, filePath: "hello.ts", symbol: "hello" }
    );
    expect(res.ok).toBe(true);
    expect(res.location?.name).toBe("hello");
  });
});
