import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertBatchFileCount,
  assertStlBase64Size,
  assertTextContentSize,
  IPC_CONTENT_LIMITS,
  normalizeWorkspaceRoot,
  resolveInsideDir,
  resolveSandboxedWorkspacePath,
} from "../../src/main/path-security";
import { createIpcHarness } from "../main/ipc-harness";

const harness = createIpcHarness();
const showSaveDialog = vi.fn();

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  dialog: {
    showSaveDialog,
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
  shell: { showItemInFolder: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
  },
}));

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Privilege / permission failures that may block symlink or junction creation. */
function isInsufficientPrivilegeLinkError(err: unknown): boolean {
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as NodeJS.ErrnoException).code)
      : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (code === "EPERM" || code === "EACCES") return true;
  return (
    /privilege/i.test(msg) ||
    /a required privilege is not held/i.test(msg) ||
    /client does not have required privileges/i.test(msg) ||
    /operation not permitted/i.test(msg) ||
    /permission denied/i.test(msg)
  );
}

describe("path-security realpath sandbox (Lot A)", () => {
  let workspace: string;
  let outside: string;

  beforeEach(() => {
    workspace = mkTmp("caval-lot-a-ws-");
    outside = mkTmp("caval-lot-a-out-");
    fs.writeFileSync(path.join(workspace, "inside.txt"), "ok", "utf8");
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope", "utf8");
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("allows valid relative path under workspace", () => {
    const resolved = resolveSandboxedWorkspacePath(workspace, "inside.txt");
    expect(fs.realpathSync(resolved)).toBe(fs.realpathSync(path.join(workspace, "inside.txt")));
  });

  it("rejects POSIX-style traversal outside workspace", () => {
    expect(() => resolveSandboxedWorkspacePath(workspace, "../outside-escape.txt")).toThrow(
      /outside workspace|No workspace/i
    );
    expect(() =>
      resolveSandboxedWorkspacePath(workspace, path.join("sub", "..", "..", path.basename(outside), "secret.txt"))
    ).toThrow(/outside workspace/i);
  });

  it("rejects Windows-style traversal outside workspace", () => {
    const winStyle = `${workspace}\\..\\${path.basename(outside)}\\secret.txt`;
    expect(() => resolveSandboxedWorkspacePath(workspace, winStyle)).toThrow(/outside workspace/i);
  });

  it("rejects absolute paths outside workspace", () => {
    expect(() =>
      resolveSandboxedWorkspacePath(workspace, path.join(outside, "secret.txt"))
    ).toThrow(/outside workspace/i);
  });

  it("rejects missing / unbound workspace root", () => {
    expect(() => resolveSandboxedWorkspacePath("", "a.ts")).toThrow(/No workspace open/i);
    const missing = path.join(os.tmpdir(), `caval-missing-${Date.now()}`);
    expect(() => resolveSandboxedWorkspacePath(missing, "a.ts")).toThrow(/No workspace open/i);
  });

  /**
   * Lot A symlink/junction escape coverage — two policies only:
   * - Policy A: platform supports links; creation fails for a non-privilege reason → FAIL.
   * - Policy B (common on Windows without admin/Developer Mode): insufficient privileges →
   *   MAY skip live-link assertion, but MUST console.error the exact COVERAGE-GAP line
   *   (never silent catch/return). Simulated `..` escape is still asserted.
   */
  it("rejects symlink / junction escape when supported", () => {
    const linkPath = path.join(workspace, "escape-link");
    try {
      if (process.platform === "win32") {
        fs.symlinkSync(outside, linkPath, "junction");
      } else {
        fs.symlinkSync(outside, linkPath, "dir");
      }
    } catch (err) {
      // Keep `..` escape coverage even when live links cannot be created.
      expect(() =>
        resolveSandboxedWorkspacePath(
          workspace,
          path.join("..", path.basename(outside), "secret.txt")
        )
      ).toThrow(/outside workspace/i);

      if (isInsufficientPrivilegeLinkError(err)) {
        // Policy B — visible coverage gap (CI logs must show this warning).
        console.error(
          "[COVERAGE-GAP] symlink/junction test skipped: insufficient privileges"
        );
        return;
      }

      // Policy A — supports links but failed for another reason: never skip.
      const reason = err instanceof Error ? err.message : String(err);
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as NodeJS.ErrnoException).code)
          : "unknown";
      throw new Error(
        `symlink/junction creation failed on ${process.platform} (code=${code}): ${reason}. ` +
          "Not classified as insufficient privileges — live link escape coverage must not be skipped."
      );
    }

    expect(() =>
      resolveSandboxedWorkspacePath(workspace, path.join("escape-link", "secret.txt"))
    ).toThrow(/outside workspace/i);
  });

  it("resolveInsideDir keeps basename under dir", () => {
    const dest = resolveInsideDir(workspace, "new-file.txt");
    expect(dest).toBeTruthy();
    expect(dest!.startsWith(fs.realpathSync(workspace))).toBe(true);
    expect(resolveInsideDir(workspace, "../escape.txt")).toBeTruthy(); // basename-only → escape.txt inside
    expect(path.basename(resolveInsideDir(workspace, "../escape.txt")!)).toBe("escape.txt");
  });

  it("enforces documented content size limits", () => {
    expect(() => assertTextContentSize("ok")).not.toThrow();
    const huge = "x".repeat(IPC_CONTENT_LIMITS.TEXT_BYTES + 1);
    expect(() => assertTextContentSize(huge)).toThrow(/exceeds limit/i);
    expect(() => assertBatchFileCount(IPC_CONTENT_LIMITS.BATCH_FILE_COUNT + 1)).toThrow(
      /file count/i
    );
    const tinyStl = Buffer.alloc(100, 1).toString("base64");
    expect(assertStlBase64Size(tinyStl).length).toBe(100);
  });
});

describe("Lot A filesystem IPC handlers", () => {
  let workspace: string;
  let outside: string;
  const boundRoots = new Map<number, string>();

  beforeEach(async () => {
    harness.reset();
    showSaveDialog.mockReset();
    showSaveDialog.mockResolvedValue({ canceled: true });
    boundRoots.clear();
    workspace = mkTmp("caval-lot-a-ipc-");
    outside = mkTmp("caval-lot-a-ipc-out-");
    fs.writeFileSync(path.join(workspace, "a.ts"), "const x = 1", "utf8");
    vi.resetModules();

    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";

    const { setIpcWorkspaceRoot } = await import("../../src/main/ipc-handlers");
    setIpcWorkspaceRoot(harness.sender.id, normalizeWorkspaceRoot(workspace));
    await import("../../src/main/ipc-handlers");

    const { registerEngineeringHandlers } = await import("../../src/main/engineering-handlers");
    registerEngineeringHandlers((id) => boundRoots.get(id));

    const { registerRoboticsLibraryHandlers } = await import(
      "../../src/main/robotics-library-handlers"
    );
    registerRoboticsLibraryHandlers((id) => boundRoots.get(id));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    boundRoots.clear();
  });

  it("rejects untrusted sender on fs:writeFile", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    await expect(
      harness.invoke("fs:writeFile", path.join(workspace, "a.ts"), "x")
    ).rejects.toThrow(/Untrusted IPC sender/i);
  });

  it("rejects missing workspace on engineering:saveFile", async () => {
    expect(boundRoots.has(harness.sender.id)).toBe(false);
    const res = await harness.invoke<{ ok: boolean; error?: string }>(
      "engineering:saveFile",
      workspace,
      { name: "x.scad", content: "cube();" }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/proiect deschis|folder/i);
  });

  it("valid save under bound workspace (engineering:saveFile)", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    const res = await harness.invoke<{ ok: boolean; savedPath?: string; error?: string }>(
      "engineering:saveFile",
      workspace,
      { name: "part.scad", content: "cube(10);" }
    );
    expect(res.ok).toBe(true);
    expect(res.savedPath).toBeTruthy();
    expect(fs.existsSync(res.savedPath!)).toBe(true);
    expect(fs.readFileSync(res.savedPath!, "utf8")).toBe("cube(10);");
  });

  it("saveAll with one invalid input writes nothing", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    const res = await harness.invoke<{
      ok: boolean;
      savedPaths?: string[];
      validationErrors?: string[];
      error?: string;
    }>("engineering:saveAll", workspace, [
      { name: "good.scad", content: "cube();" },
      { name: "", content: "bad" },
    ]);
    expect(res.ok).toBe(false);
    expect(res.validationErrors?.length).toBeGreaterThan(0);
    expect(res.savedPaths).toBeUndefined();
    const engDir = path.join(workspace, "caval-engineering");
    if (fs.existsSync(engDir)) {
      const files = fs.readdirSync(engDir);
      expect(files.filter((f) => f.endsWith(".scad"))).toEqual([]);
    }
  });

  it("fs:writeFile blocks absolute path outside workspace", async () => {
    const target = path.join(outside, "pwned.txt");
    const res = await harness.invoke<{ ok: boolean; error?: string }>(
      "fs:writeFile",
      target,
      "hack"
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/outside workspace|No workspace/i);
    expect(fs.existsSync(target)).toBe(false);
  });

  it("fs:writeFile allows valid in-workspace write", async () => {
    const target = path.join(workspace, "b.ts");
    const res = await harness.invoke<{ ok: boolean; error?: string }>(
      "fs:writeFile",
      target,
      "export {};"
    );
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("export {};");
  });

  it("engineering:exportCart outside workspace only via native dialog", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    const dialogPath = path.join(outside, "componente.md");
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: dialogPath });

    const res = await harness.invoke<{ ok: boolean; savedPath?: string; error?: string }>(
      "engineering:exportCart",
      [{ name: "Bolt", qty: 1, unitPrice: 1, currency: "RON", shop: "X", shopUrl: "https://example.com" }],
      null
    );
    expect(showSaveDialog).toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.savedPath).toBe(dialogPath);
    expect(fs.existsSync(dialogPath)).toBe(true);
  });

  it("roboticsLibrary:exportZip without projectPath uses native dialog only", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    const dialogPath = path.join(outside, "export.zip");
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: dialogPath });
    const stl = Buffer.alloc(100, 2).toString("base64");

    const res = await harness.invoke<{ ok: boolean; savedPath?: string; canceled?: boolean }>(
      "roboticsLibrary:exportZip",
      { files: [{ name: "a.stl", base64: stl }] }
    );
    expect(showSaveDialog).toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.savedPath).toBe(dialogPath);
  });

  it("roboticsLibrary:saveStlToProject rejects path outside bound workspace", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    const stl = Buffer.alloc(100, 3).toString("base64");
    const res = await harness.invoke<{ ok: boolean; error?: string }>(
      "roboticsLibrary:saveStlToProject",
      {
        projectPath: outside,
        fileName: "evil.stl",
        base64: stl,
      }
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/outside workspace|No workspace/i);
  });

  it("rejects untrusted sender on engineering:saveAll", async () => {
    boundRoots.set(harness.sender.id, normalizeWorkspaceRoot(workspace));
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    await expect(
      harness.invoke("engineering:saveAll", workspace, [{ name: "a.scad", content: "x" }])
    ).rejects.toThrow(/Untrusted IPC sender/i);
  });
});
