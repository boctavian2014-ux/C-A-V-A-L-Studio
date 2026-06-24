import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type ReleaseChannel = "stable" | "beta" | "nightly";
export type CiPlatform = "win" | "mac" | "linux";

export interface CiMetric {
  name: string;
  value: number | string;
  unit?: string;
}

export const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env
    });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} failed with ${code}`)));
    child.on("error", reject);
  });

export const channelFromEnv = (): ReleaseChannel => {
  const value = process.env.CAVAL_RELEASE_CHANNEL ?? "stable";
  if (value === "stable" || value === "beta" || value === "nightly") {
    return value;
  }

  throw new Error(`Invalid release channel: ${value}`);
};

export const platformFromEnv = (): CiPlatform => {
  const value = process.env.CAVAL_BUILD_PLATFORM;
  if (value === "win" || value === "mac" || value === "linux") {
    return value;
  }

  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  return "linux";
};

export const writeMetrics = async (metrics: CiMetric[], target = ".cicd-metrics.json"): Promise<void> => {
  await fs.writeFile(target, JSON.stringify({ generatedAt: new Date().toISOString(), metrics }, null, 2), "utf8");
};

export const collectArtifactMetrics = async (releaseDir: string): Promise<CiMetric[]> => {
  const metrics: CiMetric[] = [];
  const entries = await fs.readdir(releaseDir, { recursive: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = path.join(releaseDir, entry.toString());
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isFile()) {
      metrics.push({ name: `artifact:${entry.toString().replaceAll("\\", "/")}`, value: stat.size, unit: "bytes" });
    }
  }

  return metrics;
};
