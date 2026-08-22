import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveBundledWorkerPath, tryResolveBundledWorkerPath } from "../../src/main/resolve-worker-path";

describe("resolveBundledWorkerPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an absolute existing path ending with the worker file name when bundled", () => {
    const resolved = tryResolveBundledWorkerPath("parallel-worker.js");
    if (!resolved) {
      expect(fs.existsSync(path.resolve(process.cwd(), "dist", "main", "parallel-worker.js"))).toBe(
        false
      );
      return;
    }

    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved.endsWith("parallel-worker.js")).toBe(true);
    expect(fs.existsSync(resolved)).toBe(true);
    expect(resolved.includes(`${path.sep}src${path.sep}main${path.sep}`)).toBe(false);
  });

  it("returns null when no bundled worker file exists", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-no-bundle-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(tmp);
      vi.resetModules();
      const { tryResolveBundledWorkerPath: resolveWithoutBundle } = await import(
        "../../src/main/resolve-worker-path"
      );
      expect(resolveWithoutBundle("parallel-worker.js")).toBeNull();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("never resolves to src/main/parallel-worker.js when bundle markers are absent", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-no-bundle-src-"));
    const previousCwd = process.cwd();
    try {
      process.chdir(tmp);
      vi.resetModules();
      const { tryResolveBundledWorkerPath: resolveWithoutBundle, resolveBundledWorkerPath: legacyResolve } =
        await import("../../src/main/resolve-worker-path");
      expect(resolveWithoutBundle("parallel-worker.js")).toBeNull();
      expect(legacyResolve("parallel-worker.js").includes(`${path.sep}src${path.sep}main${path.sep}`)).toBe(
        false
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("prefers asar.unpacked when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-worker-"));
    const asarDir = path.join(tmp, "app.asar", "dist", "main");
    const unpackedDir = path.join(tmp, "app.asar.unpacked", "dist", "main");
    fs.mkdirSync(asarDir, { recursive: true });
    fs.mkdirSync(unpackedDir, { recursive: true });
    fs.writeFileSync(path.join(unpackedDir, "preload-worker.js"), "// ok");

    const asarCandidate = path.join(asarDir, "preload-worker.js");
    const unpacked = asarCandidate.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
    expect(fs.existsSync(unpacked)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
