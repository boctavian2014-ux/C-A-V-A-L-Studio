import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectPreflightChecks } from "../../.cicd/scripts/release-preflight";

describe("release-preflight", () => {
  let tempDir = "";
  const originalSha1 = process.env.CAVAL_WIN_CERT_SHA1;
  const originalFile = process.env.CAVAL_WIN_CERT_FILE;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    if (originalSha1 === undefined) delete process.env.CAVAL_WIN_CERT_SHA1;
    else process.env.CAVAL_WIN_CERT_SHA1 = originalSha1;
    if (originalFile === undefined) delete process.env.CAVAL_WIN_CERT_FILE;
    else process.env.CAVAL_WIN_CERT_FILE = originalFile;
  });

  it("passes pre phase when required release assets exist", async () => {
    const result = await collectPreflightChecks({ phase: "pre" });
    expect(result.ok).toBe(true);
    expect(result.checks.some((c) => c.id === "file:build-icons/icon.ico" && c.ok)).toBe(true);
    expect(result.checks.some((c) => c.id === "file:installer/assets/license.rtf" && c.ok)).toBe(true);
  });

  it("warns when Windows signing is not configured", async () => {
    delete process.env.CAVAL_WIN_CERT_SHA1;
    delete process.env.CAVAL_WIN_CERT_FILE;
    const result = await collectPreflightChecks({ phase: "pre" });
    const signing = result.checks.find((c) => c.id === "signing:windows");
    expect(signing?.severity).toBe("warning");
    expect(signing?.ok).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("fails post-build phase when dist output is missing in temp workspace", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-release-"));
    await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ version: "0.0.0" }), "utf8");

    const result = await collectPreflightChecks({ root: tempDir, phase: "post-build" });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.id === "file:dist/main/electron-main.js" && !c.ok)).toBe(true);
  });
});
