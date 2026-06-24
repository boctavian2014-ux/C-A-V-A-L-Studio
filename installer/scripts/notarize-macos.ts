import fs from "node:fs/promises";
import { run } from "./build-utils";

const main = async (): Promise<void> => {
  const config = JSON.parse(await fs.readFile("installer/config/signing/macos-signing.json", "utf8")) as {
    appleIdEnv: string;
    appleTeamIdEnv: string;
    appleAppSpecificPasswordEnv: string;
  };

  const artifact = process.argv[2];
  const appleId = process.env[config.appleIdEnv];
  const teamId = process.env[config.appleTeamIdEnv];
  const password = process.env[config.appleAppSpecificPasswordEnv];

  if (!artifact || !appleId || !teamId || !password) {
    throw new Error("Usage: tsx installer/scripts/notarize-macos.ts <artifact.dmg|artifact.pkg> with Apple notarization env vars set.");
  }

  await run("xcrun", [
    "notarytool",
    "submit",
    artifact,
    "--apple-id",
    appleId,
    "--team-id",
    teamId,
    "--password",
    password,
    "--wait"
  ]);
};

void main();
