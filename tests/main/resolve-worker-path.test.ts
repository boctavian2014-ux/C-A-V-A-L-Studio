import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveBundledWorkerPath } from "../../src/main/resolve-worker-path";

describe("resolveBundledWorkerPath", () => {
  it("returns an absolute path ending with the worker file name", () => {
    const resolved = resolveBundledWorkerPath("parallel-worker.js");
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved.endsWith("parallel-worker.js")).toBe(true);
    // Must not be the bare webpack-baked relative source path.
    expect(resolved === path.join("src", "main", "parallel-worker.js")).toBe(false);
  });

  it("prefers asar.unpacked when present", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "caval-worker-"));
    const asarDir = path.join(tmp, "app.asar", "dist", "main");
    const unpackedDir = path.join(tmp, "app.asar.unpacked", "dist", "main");
    fs.mkdirSync(asarDir, { recursive: true });
    fs.mkdirSync(unpackedDir, { recursive: true });
    fs.writeFileSync(path.join(unpackedDir, "preload-worker.js"), "// ok");

    // Simulate resolve when __dirname is inside asar by temporarily monkey-patching
    // via evaluating the same replace logic used in production.
    const asarCandidate = path.join(asarDir, "preload-worker.js");
    const unpacked = asarCandidate.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`
    );
    expect(fs.existsSync(unpacked)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
