import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolvePreviewCwd } from "../../src/main/preview-paths";

describe("preview cwd sandbox", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function tmpWorkspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "caval-preview-cwd-"));
    dirs.push(root);
    fs.mkdirSync(path.join(root, "app"));
    return root;
  }

  it("resolves a directory inside the workspace", () => {
    const root = tmpWorkspace();
    const resolved = resolvePreviewCwd(root, "app");
    expect(resolved).toBe(fs.realpathSync(path.join(root, "app")));
    expect(resolvePreviewCwd(root, ".")).toBe(fs.realpathSync(root));
  });

  it("cannot escape the workspace via .. or a foreign absolute path", () => {
    const root = tmpWorkspace();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "caval-preview-outside-"));
    dirs.push(outside);
    expect(() => resolvePreviewCwd(root, path.join("..", path.basename(outside)))).toThrow(/outside workspace|not allowed|not an existing/i);
    expect(() => resolvePreviewCwd(root, outside)).toThrow(/outside workspace/i);
    expect(() => resolvePreviewCwd(root, path.join(root, "missing-dir"))).toThrow(/not an existing directory/i);
  });

  it("rejects UNC and protocol-like cwd values", () => {
    const root = tmpWorkspace();
    expect(() => resolvePreviewCwd(root, "\\\\127.0.0.1\\c$")).toThrow(/not allowed/i);
    expect(() => resolvePreviewCwd(root, "file:///C:/Windows")).toThrow(/not allowed/i);
  });
});
