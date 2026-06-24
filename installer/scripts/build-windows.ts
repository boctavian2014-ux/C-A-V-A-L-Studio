import { buildPlatform, channelFromEnv } from "./build-utils";

const main = async (): Promise<void> => {
  await buildPlatform({
    platform: "win",
    channel: channelFromEnv(),
    publish: process.env.CI ? "onTag" : "never"
  });
};

void main();
