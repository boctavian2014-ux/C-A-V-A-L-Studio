import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIpcHarness } from "../ipc-harness";
import type { WorkspaceIndex } from "../../../src/shared/workspace-index-contract";
import type { WorkspaceSearchResponse } from "../../../src/shared/workspace-search-contract";
import { INDEX_UNAVAILABLE_MESSAGE } from "../../../src/main/workspace/workspace-search";

const harness = createIpcHarness();
const boundRoots = new Map<number, string>();

const indexState: { index: WorkspaceIndex } = {
  index: { files: [], lastFullScan: 0, totalFiles: 0 },
};

vi.mock("electron", () => ({ ipcMain: harness.ipcMain }));

vi.mock("../../../src/main/workspace/workspace-index-service", () => ({
  workspaceIndexService: {
    getIndex: () => indexState.index,
  },
}));

describe("7d.2 workspace search IPC", () => {
  beforeEach(async () => {
    harness.reset();
    boundRoots.clear();
    boundRoots.set(harness.sender.id, "C:/tmp/caval-ws");
    indexState.index = {
      files: [
        {
          path: "src/app.ts",
          language: "ts",
          symbols: [{ name: "greet", kind: "function", line: 2 }],
          imports: ["react"],
          exports: ["greet"],
          sizeBytes: 40,
          lastIndexed: 1,
        },
      ],
      lastFullScan: Date.now(),
      totalFiles: 1,
    };
    vi.resetModules();
    const { registerWorkspaceSearchHandlers } = await import(
      "../../../src/main/workspace/workspace-search-handlers.js"
    );
    registerWorkspaceSearchHandlers((senderId) => boundRoots.get(senderId));
  });

  afterEach(() => {
    boundRoots.clear();
  });

  it("caval:workspace-search-query returns ranked hits", async () => {
    const res = await harness.invoke<WorkspaceSearchResponse>("caval:workspace-search-query", {
      text: "greet",
      limit: 20,
    });
    expect(res.ok).toBe(true);
    expect(res.results[0]?.file.path).toBe("src/app.ts");
    expect(res.results[0]?.score).toBe(1);
  });

  it("returns a clear error when the index is not ready", async () => {
    indexState.index = { files: [], lastFullScan: 0, totalFiles: 0 };
    const res = await harness.invoke<WorkspaceSearchResponse>("caval:workspace-search-query", {
      text: "greet",
    });
    expect(res.ok).toBe(false);
    expect(res.results).toEqual([]);
    expect(res.error).toBe(INDEX_UNAVAILABLE_MESSAGE);
  });

  it("does not write or replace the index object", async () => {
    const before = indexState.index;
    await harness.invoke("caval:workspace-search-query", { text: "greet" });
    expect(indexState.index).toBe(before);
  });
});
