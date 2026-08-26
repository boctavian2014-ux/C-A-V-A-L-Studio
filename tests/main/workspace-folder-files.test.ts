import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listFolderFiles } from "../../src/main/workspace-folder-files";

describe("listFolderFiles", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-folder-"));
    fs.mkdirSync(path.join(workspace, ".caval", "context-cache"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".caval", "context-cache", "documents.json"),
      "[]",
      "utf8"
    );
    fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "src", "App.tsx"), "export default function App() {}\n", "utf8");
    fs.writeFileSync(path.join(workspace, "README.md"), "# Demo\n", "utf8");
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("does not auto-list context-cache documents.json", async () => {
    const files = await listFolderFiles(workspace, 80);
    expect(files.some((file) => /context-cache|documents\.json/i.test(file.label))).toBe(false);
    expect(files[0]?.label.replace(/\\/g, "/")).toBe("README.md");
  });

  it("opens a valid file under a workspace path with spaces", async () => {
    const spaced = fs.mkdtempSync(path.join(os.tmpdir(), "WEBSITE CAVALLO "));
    try {
      fs.writeFileSync(path.join(spaced, "README.md"), "# spaced\n", "utf8");
      const files = await listFolderFiles(spaced, 20);
      expect(files.some((file) => file.label.replace(/\\/g, "/") === "README.md")).toBe(true);
    } finally {
      fs.rmSync(spaced, { recursive: true, force: true });
    }
  });

  it("returns no files when the workspace only contains internal cache data", async () => {
    const cacheOnly = fs.mkdtempSync(path.join(os.tmpdir(), "caval-ws-cache-only-"));
    try {
      fs.mkdirSync(path.join(cacheOnly, ".caval", "context-cache"), { recursive: true });
      fs.writeFileSync(
        path.join(cacheOnly, ".caval", "context-cache", "documents.json"),
        "[]",
        "utf8"
      );

      const files = await listFolderFiles(cacheOnly, 20);
      expect(files).toEqual([]);
    } finally {
      fs.rmSync(cacheOnly, { recursive: true, force: true });
    }
  });

  it("returns no files when the workspace root is the context-cache directory", async () => {
    const cacheRoot = path.join(workspace, ".caval", "context-cache");
    const files = await listFolderFiles(cacheRoot, 20);
    expect(files).toEqual([]);
  });
});
