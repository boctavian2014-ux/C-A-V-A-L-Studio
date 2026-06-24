import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MobileBuildService } from "../../mobile/mobile-build-service";

describe("MobileBuildService", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("detects expo project from app.json", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-mobile-"));
    await fs.writeFile(path.join(tempDir, "app.json"), "{}", "utf8");

    const service = new MobileBuildService();
    const info = service.detectExpoProject(tempDir);
    expect(info.isExpo).toBe(true);
    expect(info.hasAppConfig).toBe(true);
  });

  it("returns android eas build command for expo projects", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caval-mobile-"));
    await fs.writeFile(path.join(tempDir, "app.json"), "{}", "utf8");

    const commands = new MobileBuildService().getCommands("android", tempDir);
    const build = commands.find((c) => c.stepId === "build");
    expect(build?.command).toContain("eas build");
    expect(build?.command).toContain("android");
  });

  it("extracts expo build URLs from log lines", () => {
    const url = new MobileBuildService().extractBuildUrl(
      "Build finished: https://expo.dev/accounts/demo/projects/app/builds/abc"
    );
    expect(url).toMatch(/^https:\/\/expo\.dev\//);
  });
});
