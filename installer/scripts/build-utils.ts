import { spawn } from "node:child_process";

export type ReleaseChannel = "stable" | "beta" | "nightly";
export type BuildPlatform = "win" | "mac" | "linux";

export interface BuildOptions {
  platform: BuildPlatform;
  channel: ReleaseChannel;
  publish?: "never" | "onTag" | "always";
  ci?: boolean;
}

export const channelFromEnv = (): ReleaseChannel => {
  const channel = process.env.CAVAL_RELEASE_CHANNEL ?? "stable";
  if (channel === "beta" || channel === "nightly" || channel === "stable") {
    return channel;
  }

  throw new Error(`Invalid release channel: ${channel}`);
};

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

export const buildPlatform = async ({ platform, channel, publish = "never", ci = Boolean(process.env.CI) }: BuildOptions): Promise<void> => {
  await run("npm", ["run", "build"]);
  await run("electron-builder", [
    "--config",
    "installer/config/electron-builder.yml",
    "--projectDir",
    ".",
    `--${platform}`,
    "--publish",
    publish
  ], {
    ...process.env,
    CAVAL_RELEASE_CHANNEL: channel,
    channel,
    CI: ci ? "true" : process.env.CI
  });
};
