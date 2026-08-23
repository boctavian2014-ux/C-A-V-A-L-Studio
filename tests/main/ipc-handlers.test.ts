import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  },
  shell: { showItemInFolder: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ minimize: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(), close: vi.fn(), isMaximized: () => false })),
  },
}));

describe("ipc-handlers path security", () => {
  let workspace: string;
  let outside: string;

  beforeEach(async () => {
    harness.reset();
    vi.resetModules();
    workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "caval-ipc-"));
    outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "caval-out-"));
    await fs.promises.writeFile(path.join(workspace, "inside.txt"), "secret", "utf8");

    const { setIpcWorkspaceRoot } = await import("../../src/main/ipc-handlers.js");
    setIpcWorkspaceRoot(42, workspace);
    await import("../../src/main/ipc-handlers.js");
  });

  afterEach(async () => {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await fs.promises.rm(outside, { recursive: true, force: true });
  });

  it("fs:readFile allows relative paths inside workspace", async () => {
    const res = await harness.invoke<{ ok: boolean; content?: string; path?: string; language?: string }>(
      "fs:readFile",
      "inside.txt"
    );
    expect(res.ok).toBe(true);
    expect(res.content).toBe("secret");
    expect(res.path).toBe("inside.txt");
    expect(res.language).toBe("plaintext");
  });

  it("fs:readFile rejects absolute renderer paths", async () => {
    const target = path.join(workspace, "inside.txt");
    const res = await harness.invoke<{ ok: boolean; code?: string; message?: string }>(
      "fs:readFile",
      target
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe("OUTSIDE_WORKSPACE");
    expect(JSON.stringify(res)).not.toContain(workspace);
  });

  it("fs:writeFile blocks path traversal outside workspace", async () => {
    const escapeTarget = path.join(workspace, "..", path.basename(outside), "evil.txt");
    const res = await harness.invoke<{ ok: boolean; error?: string }>(
      "fs:writeFile",
      escapeTarget,
      "hack"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/outside workspace/i);
  });

  it("fs:readTree returns sorted nodes", async () => {
    await fs.promises.mkdir(path.join(workspace, "src"), { recursive: true });
    await fs.promises.writeFile(path.join(workspace, "src", "a.ts"), "", "utf8");
    const tree = await harness.invoke<Array<{ name: string; type: string }>>("fs:readTree", workspace);
    expect(tree.some((n) => n.name === "src" && n.type === "directory")).toBe(true);
  });
});
