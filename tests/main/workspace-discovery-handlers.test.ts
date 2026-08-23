import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "../main/ipc-harness";

const harness = createIpcHarness();
const bound = new Map<number, string>();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

vi.mock("../../ai/tools/workspace-command-runner", () => ({
  runAllowedWorkspaceCommand: vi.fn(),
}));

describe("caval:workspace-discover IPC", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";
    bound.clear();
    vi.resetModules();

    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-disc-ipc-"));
    fs.writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "ipc-demo", scripts: { test: "vitest run" } })
    );
    fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "src", "index.ts"), "export {};\n");

    bound.set(harness.sender.id, workspace);

    const { registerWorkspaceDiscoveryHandlers } = await import(
      "../../src/main/workspace-discovery-handlers.js"
    );
    registerWorkspaceDiscoveryHandlers((senderId) => bound.get(senderId));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("returns discovery snapshot for bound workspace without absolute paths", async () => {
    const snapshot = await harness.invoke<{
      ok: boolean;
      projectName: string;
      hasPackageJson: boolean;
      rootEntries: string[];
    }>("caval:workspace-discover", { runVerify: false });

    expect(snapshot.ok).toBe(true);
    expect(snapshot.projectName).toBe(path.basename(workspace));
    expect(snapshot.hasPackageJson).toBe(true);
    expect(snapshot.rootEntries).toContain("package.json");
    expect(snapshot.rootEntries).toContain("src/");
    expect(JSON.stringify(snapshot)).not.toContain(workspace);
  });

  it("returns error snapshot when no workspace is bound", async () => {
    bound.delete(harness.sender.id);
    const snapshot = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:workspace-discover"
    );
    expect(snapshot.ok).toBe(false);
    expect(snapshot.error).toMatch(/Nu este deschis niciun folder/i);
  });
});
