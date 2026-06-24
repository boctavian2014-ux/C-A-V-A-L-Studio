import path from "node:path";
import { performance } from "node:perf_hooks";
import { channelFromEnv, collectArtifactMetrics, platformFromEnv, run, writeMetrics } from "./ci-utils";

const main = async (): Promise<void> => {
  const startedAt = performance.now();
  const channel = channelFromEnv();
  const platform = platformFromEnv();
  const script = platform === "win" ? "dist:win" : platform === "mac" ? "dist:mac" : "dist:linux";

  await run("npm", ["run", script], {
    ...process.env,
    CAVAL_RELEASE_CHANNEL: channel,
    CAVAL_BUILD_PLATFORM: platform,
    CI: "true"
  });

  const releaseDir = path.join("release", channel);
  await writeMetrics([
    { name: "build.duration", value: Math.round(performance.now() - startedAt), unit: "ms" },
    { name: "build.platform", value: platform },
    { name: "build.channel", value: channel },
    ...await collectArtifactMetrics(releaseDir)
  ]);
};

void main();
