import fs from "node:fs/promises";
import path from "node:path";
import { channelFromEnv, platformFromEnv, run } from "./ci-utils";

const main = async (): Promise<void> => {
  const channel = channelFromEnv();
  const platform = platformFromEnv();
  const releaseDir = path.join("release", channel);
  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);
  const artifacts = entries.map((entry) => path.join(releaseDir, entry.toString()));

  if (platform === "win") {
    for (const artifact of artifacts.filter((item) => /\.(exe|msi)$/.test(item))) {
      await run("tsx", ["installer/scripts/sign-windows.ts", artifact]);
    }
  }

  if (platform === "mac") {
    for (const artifact of artifacts.filter((item) => /\.(dmg|pkg)$/.test(item))) {
      await run("tsx", ["installer/scripts/notarize-macos.ts", artifact]);
    }
  }

  if (platform === "linux") {
    console.log("Linux artifact signing is configured as optional. Add GPG/AppImage signing keys in CI secrets.");
  }
};

void main();
