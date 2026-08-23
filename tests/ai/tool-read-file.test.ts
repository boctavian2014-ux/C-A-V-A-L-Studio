import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ToolRegistry } from "../../ai/tools/tool-registry";
import { WORKSPACE_FILE_READ_FAILURE_RO } from "../../src/shared/workspace-file-read-contract";

describe("tool-registry read_file", () => {
  let root: string;

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns content only after a successful read", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-tool-read-"));
    fs.writeFileSync(path.join(root, "README.md"), "# OK", "utf8");
    const registry = new ToolRegistry(root);
    const ok = await registry.execute({ name: "read_file", arguments: { path: "README.md" } });
    expect(ok.ok).toBe(true);
    expect(ok.output).toEqual({ path: "README.md", content: "# OK" });
  });

  it("does not return file content when read fails", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-tool-read-"));
    const registry = new ToolRegistry(root);
    const missing = await registry.execute({
      name: "read_file",
      arguments: { path: "README.md" },
    });
    expect(missing.ok).toBe(false);
    expect(missing.output).toBeUndefined();
    expect(missing.error).toBe(WORKSPACE_FILE_READ_FAILURE_RO);
  });

  it("rejects absolute paths from the agent", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-tool-read-"));
    fs.writeFileSync(path.join(root, "README.md"), "# OK", "utf8");
    const registry = new ToolRegistry(root);
    const abs = path.join(root, "README.md");
    const res = await registry.execute({ name: "read_file", arguments: { path: abs } });
    expect(res.ok).toBe(false);
    expect(res.error).toBe(WORKSPACE_FILE_READ_FAILURE_RO);
  });
});
