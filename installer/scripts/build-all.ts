import { buildPlatform, channelFromEnv } from "./build-utils";

const main = async (): Promise<void> => {
  const channel = channelFromEnv();

  await buildPlatform({ platform: "win", channel, publish: process.env.CI ? "onTag" : "never" });
  await buildPlatform({ platform: "mac", channel, publish: process.env.CI ? "onTag" : "never" });
  await buildPlatform({ platform: "linux", channel, publish: process.env.CI ? "onTag" : "never" });
};

void main();
