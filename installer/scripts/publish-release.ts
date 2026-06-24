import fs from "node:fs/promises";
import path from "node:path";
import { channelFromEnv, run } from "./build-utils";

const main = async (): Promise<void> => {
  const channel = channelFromEnv();
  const releaseDir = path.resolve("release", channel);
  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);
  const artifacts = entries
    .map((entry) => path.join(releaseDir, entry.toString()))
    .filter((entry) => /\.(exe|msi|dmg|pkg|deb|rpm|AppImage|yml|json)$/.test(entry));

  if (artifacts.length === 0) {
    throw new Error(`No release artifacts found in ${releaseDir}`);
  }

  if (process.env.GITHUB_TOKEN) {
    await run("electron-builder", [
      "--config",
      "installer/config/electron-builder.yml",
      "--publish",
      "always"
    ], {
      ...process.env,
      channel,
      CAVAL_RELEASE_CHANNEL: channel
    });
  } else {
    console.log(JSON.stringify({ channel, artifacts }, null, 2));
  }
};

void main();
