import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { channelFromEnv, collectArtifactMetrics, platformFromEnv, writeMetrics } from "../../.cicd/scripts/ci-utils";

describe("ci-utils", () => {
  let tempDir = "";
  const originalChannel = process.env.CAVAL_RELEASE_CHANNEL;
  const originalPlatform = process.env.CAVAL_BUILD_PLATFORM;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    if (originalChannel === undefined) {
      delete process.env.CAVAL_RELEASE_CHANNEL;
    } else {
      process.env.CAVAL_RELEASE_CHANNEL = originalChannel;
    }
    if (originalPlatform === undefined) {
      delete process.env.CAVAL_BUILD_PLATFORM;
    } else {
      process.env.CAVAL_BUILD_PLATFORM = originalPlatform;
    }
  });

  it("channelFromEnv defaults to stable", () => {
    delete process.env.CAVAL_RELEASE_CHANNEL;
    expect(channelFromEnv()).toBe("stable");
  });

  it("channelFromEnv rejects invalid values", () => {
    process.env.CAVAL_RELEASE_CHANNEL = "invalid";
    expect(() => channelFromEnv()).toThrow(/Invalid release channel/);
  });

  it("platformFromEnv reads explicit platform", () => {
    process.env.CAVAL_BUILD_PLATFORM = "linux";
    expect(platformFromEnv()).toBe("linux");
  });

  it("writeMetrics persists json metrics file", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-ci-"));
    const target = path.join(tempDir, "metrics.json");
    await writeMetrics([{ name: "tests", value: 82 }], target);
    const parsed = JSON.parse(await fs.readFile(target, "utf8")) as { metrics: Array<{ name: string }> };
    expect(parsed.metrics[0].name).toBe("tests");
  });

  it("collectArtifactMetrics measures file sizes", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-ci-"));
    await fs.writeFile(path.join(tempDir, "app.exe"), "binary", "utf8");
    const metrics = await collectArtifactMetrics(tempDir);
    expect(metrics.some((m) => m.name.includes("app.exe"))).toBe(true);
  });
});
