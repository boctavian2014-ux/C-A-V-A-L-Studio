import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicPatchApplier } from "../../ai/composer/patch/patch-applier";

describe("AtomicPatchApplier", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("applies full content replacement", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-patch-"));
    const target = path.join(tempDir, "hello.txt");
    await fs.writeFile(target, "old", "utf8");

    const applier = new AtomicPatchApplier();
    const result = await applier.apply(tempDir, {
      files: [{ path: "hello.txt", patch: "new content", fullContent: "new content" }]
    });
    expect(result.changedFiles).toEqual(["hello.txt"]);
    expect(await fs.readFile(target, "utf8")).toBe("new content");
  });

  it("refuses path traversal outside workspace", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-patch-"));
    const applier = new AtomicPatchApplier();
    await expect(applier.apply(tempDir, {
      files: [{ path: "../outside.txt", patch: "hack", fullContent: "hack" }]
    })).rejects.toThrow(/outside workspace/i);
  });

  it("supports dry run without writing files", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-patch-"));
    const target = path.join(tempDir, "dry.txt");
    await fs.writeFile(target, "before", "utf8");

    const applier = new AtomicPatchApplier();
    await applier.apply(tempDir, {
      files: [{ path: "dry.txt", patch: "", fullContent: "after" }]
    }, true);
    expect(await fs.readFile(target, "utf8")).toBe("before");
  });
});
