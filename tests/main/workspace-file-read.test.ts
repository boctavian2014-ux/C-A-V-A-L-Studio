import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readWorkspaceFileRelative } from "../../src/main/workspace-file-read";
import { normalizeWorkspaceRoot, resolveSandboxedWorkspacePath } from "../../src/main/path-security";
import { createIpcHarness } from "../main/ipc-harness";

const harness = createIpcHarness();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

describe("workspace-file-read", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-read-"));
    fs.writeFileSync(path.join(workspace, "README.md"), "# Demo\n", "utf8");
    fs.mkdirSync(path.join(workspace, "src", "components"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, "src", "components", "App.tsx"),
      "export {};\n",
      "utf8"
    );
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    harness.reset();
  });

  it.skipIf(process.platform !== "win32")(
    "reads README.md from a Windows-style workspace path",
    () => {
      const winRoot = workspace.replace(/\//g, "\\");
      const result = readWorkspaceFileRelative(normalizeWorkspaceRoot(winRoot), "README.md");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toBe("README.md");
        expect(result.content).toContain("# Demo");
        expect(result.language).toBe("markdown");
        expect(JSON.stringify(result)).not.toContain(winRoot);
      }
    }
  );

  it("reads README.md from a normalized workspace root on any platform", () => {
    const result = readWorkspaceFileRelative(normalizeWorkspaceRoot(workspace), "README.md");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe("README.md");
      expect(result.content).toContain("# Demo");
    }
  });

  it("reads nested file with forward-slash relative path", () => {
    const result = readWorkspaceFileRelative(workspace, "src/components/App.tsx");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toBe("src/components/App.tsx");
      expect(result.language).toBe("typescript");
    }
  });

  it("rejects renderer-supplied absolute Windows paths", () => {
    const abs = path.join(workspace, "README.md");
    const result = readWorkspaceFileRelative(workspace, abs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("OUTSIDE_WORKSPACE");
      expect(result.message).not.toMatch(/ENOENT|EINVAL/);
      expect(JSON.stringify(result)).not.toContain(abs);
    }
  });

  it("rejects traversal", () => {
    const result = readWorkspaceFileRelative(workspace, "../outside.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("OUTSIDE_WORKSPACE");
  });

  it("returns NOT_FOUND for missing files", () => {
    const result = readWorkspaceFileRelative(workspace, "missing.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.message).toBe("Could not open this workspace file.");
    }
  });

  it("returns NOT_A_FILE for directories", () => {
    const result = readWorkspaceFileRelative(workspace, "src");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_A_FILE");
  });

  it("maps bound-root absolute paths onto realRoot for sandbox reads", () => {
    const inside = path.join(workspace, "README.md");
    const resolved = resolveSandboxedWorkspacePath(workspace, inside);
    expect(fs.readFileSync(resolved, "utf8")).toContain("# Demo");
  });
});

describe("fs:readFile IPC contract", () => {
  let workspace: string;

  beforeEach(async () => {
    harness.reset();
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-read-ipc-"));
    fs.writeFileSync(path.join(workspace, "README.md"), "hello", "utf8");
    vi.resetModules();
    const { setIpcWorkspaceRoot } = await import("../../src/main/ipc-handlers.js");
    setIpcWorkspaceRoot(harness.sender.id, normalizeWorkspaceRoot(workspace));
    await import("../../src/main/ipc-handlers.js");
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("returns safe failure without leaking OS paths", async () => {
    const result = await harness.invoke<{ ok: boolean; code?: string; message?: string }>(
      "fs:readFile",
      path.join(workspace, "nope.md")
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("OUTSIDE_WORKSPACE");
    expect(JSON.stringify(result)).not.toContain(workspace);
  });
});
