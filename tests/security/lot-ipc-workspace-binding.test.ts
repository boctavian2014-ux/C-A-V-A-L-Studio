import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveBindableWorkspaceDirectory } from "../../src/main/bound-workspace";
import { createIpcHarness } from "../main/ipc-harness";

const harness = createIpcHarness();
const bound = new Map<number, string>();
const onOpen = vi.fn(async (senderId: number, _sender: unknown, root: string) => {
  bound.set(senderId, root);
});
const onCachedOpen = vi.fn(async () => undefined);

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
}));

describe("SEC-IPC-WS-BINDING-001 workspace bind", () => {
  let workspace: string;
  let filePath: string;

  beforeEach(async () => {
    harness.reset();
    harness.sender.getURL = () => "file:///caval-renderer/index.html";
    harness.sender.mainFrame.url = "file:///caval-renderer/index.html";
    bound.clear();
    onOpen.mockClear();
    onCachedOpen.mockClear();
    vi.resetModules();
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-bind-"));
    filePath = path.join(workspace, "not-a-dir.txt");
    fs.writeFileSync(filePath, "x");

    const { registerWorkspaceBindingHandlers } = await import(
      "../../src/main/workspace-binding-handlers.js"
    );
    registerWorkspaceBindingHandlers({
      bindWorkspace: (senderId, root) => {
        bound.set(senderId, root);
      },
      getBoundRoot: (senderId) => bound.get(senderId),
      addRecentWorkspace: vi.fn(),
      onOpen,
      onCachedOpen,
    });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("resolveBindableWorkspaceDirectory accepts a real directory", () => {
    expect(resolveBindableWorkspaceDirectory(workspace)).toBe(path.resolve(workspace));
  });

  it("resolveBindableWorkspaceDirectory rejects files, empty, and missing paths", () => {
    expect(() => resolveBindableWorkspaceDirectory("")).toThrow(/Invalid folder path/);
    expect(() => resolveBindableWorkspaceDirectory(filePath)).toThrow(/not an accessible directory/);
    expect(() => resolveBindableWorkspaceDirectory(path.join(workspace, "missing"))).toThrow(
      /not an accessible directory/
    );
  });

  it("resolveBindableWorkspaceDirectory rejects URL-like paths", () => {
    expect(() => resolveBindableWorkspaceDirectory("https://evil.example/repo")).toThrow(
      /not a URL/i
    );
    expect(() => resolveBindableWorkspaceDirectory("file:///tmp/project")).toThrow(/not a URL/i);
  });

  it("caval:workspace-open rejects untrusted sender without bind", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:workspace-open",
      workspace
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Untrusted IPC sender/i);
    expect(bound.size).toBe(0);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("caval:workspace-sync rejects untrusted sender without bind", async () => {
    harness.sender.getURL = () => "https://evil.example/";
    harness.sender.mainFrame.url = "https://evil.example/";
    const result = await harness.invoke<{ ok: boolean; error?: string }>(
      "caval:workspace-sync",
      workspace
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Untrusted IPC sender/i);
    expect(bound.size).toBe(0);
  });

  it("caval:workspace-open binds a real directory for a trusted sender", async () => {
    const result = await harness.invoke<{ ok: boolean; path?: string }>(
      "caval:workspace-open",
      workspace
    );
    expect(result.ok).toBe(true);
    expect(result.path).toBe(path.resolve(workspace));
    expect(bound.get(harness.sender.id)).toBe(path.resolve(workspace));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("caval:workspace-open still hydrates the renderer when the root is already bound", async () => {
    const first = await harness.invoke<{ ok: boolean; cached?: boolean }>(
      "caval:workspace-open",
      workspace
    );
    expect(first.ok).toBe(true);
    expect(first.cached).toBeUndefined();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onCachedOpen).not.toHaveBeenCalled();

    const second = await harness.invoke<{ ok: boolean; cached?: boolean }>(
      "caval:workspace-open",
      workspace
    );
    expect(second.ok).toBe(true);
    expect(second.cached).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onCachedOpen).toHaveBeenCalledTimes(1);
  });

  it("caval:workspace-sync binds a real directory for a trusted sender", async () => {
    const result = await harness.invoke<{ ok: boolean; path?: string }>(
      "caval:workspace-sync",
      workspace
    );
    expect(result.ok).toBe(true);
    expect(bound.get(harness.sender.id)).toBe(path.resolve(workspace));
  });
});
