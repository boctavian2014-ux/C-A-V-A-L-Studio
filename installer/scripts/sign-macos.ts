import fs from "node:fs/promises";
import { run } from "./build-utils";

const main = async (): Promise<void> => {
  const config = JSON.parse(await fs.readFile("installer/config/signing/macos-signing.json", "utf8")) as {
    identityEnv: string;
  };

  const appPath = process.argv[2];
  const identity = process.env[config.identityEnv];

  if (!appPath || !identity) {
    throw new Error("Usage: tsx installer/scripts/sign-macos.ts <Caval Studio.app> with CAVAL_MAC_DEVELOPER_ID set.");
  }

  await run("codesign", [
    "--force",
    "--deep",
    "--options",
    "runtime",
    "--entitlements",
    "installer/config/signing/entitlements.mac.plist",
    "--sign",
    identity,
    appPath
  ]);
};

void main();
