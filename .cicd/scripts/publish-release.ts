import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { channelFromEnv, collectArtifactMetrics, run, writeMetrics } from "./ci-utils";

const main = async (): Promise<void> => {
  const channel = channelFromEnv();
  const releaseDir = path.join("release", channel);
  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);
  const artifacts = entries
    .map((entry) => path.join(releaseDir, entry.toString()))
    .filter((entry) => /\.(exe|msi|dmg|pkg|deb|rpm|AppImage)$/.test(entry));

  const feed = {
    channel,
    generatedAt: new Date().toISOString(),
    artifacts: await Promise.all(artifacts.map(async (artifact) => {
      const buffer = await fs.readFile(artifact);
      return {
        file: artifact.replaceAll("\\", "/"),
        sha512: crypto.createHash("sha512").update(buffer).digest("base64"),
        sizeBytes: buffer.byteLength
      };
    }))
  };

  await fs.mkdir(releaseDir, { recursive: true });
  await fs.writeFile(path.join(releaseDir, "feed.json"), JSON.stringify(feed, null, 2), "utf8");

  if (process.env.PUBLISH_RELEASE === "true") {
    await run("npm", ["run", "release:publish"], {
      ...process.env,
      CAVAL_RELEASE_CHANNEL: channel
    });
  }

  await writeMetrics([
    { name: "release.artifactCount", value: artifacts.length },
    { name: "release.channel", value: channel },
    ...await collectArtifactMetrics(releaseDir)
  ]);
};

void main();
