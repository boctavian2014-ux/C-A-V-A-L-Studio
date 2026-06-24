import fs from "node:fs/promises";
import { run } from "./build-utils";

const main = async (): Promise<void> => {
  const config = JSON.parse(await fs.readFile("installer/config/signing/windows-signing.json", "utf8")) as {
    certificateSha1Env: string;
    certificateFileEnv: string;
    certificatePasswordEnv: string;
    timestampServer: string;
  };

  const artifact = process.argv[2];
  if (!artifact) {
    throw new Error("Usage: tsx installer/scripts/sign-windows.ts <artifact.exe|artifact.msi>");
  }

  const certSha1 = process.env[config.certificateSha1Env];
  const certFile = process.env[config.certificateFileEnv];
  const password = process.env[config.certificatePasswordEnv];
  const certArgs = certSha1 ? ["/sha1", certSha1] : certFile ? ["/f", certFile, ...(password ? ["/p", password] : [])] : [];

  if (certArgs.length === 0) {
    throw new Error("Windows signing certificate is not configured.");
  }

  await run("signtool", [
    "sign",
    "/fd",
    "SHA256",
    "/tr",
    config.timestampServer,
    "/td",
    "SHA256",
    ...certArgs,
    artifact
  ]);
};

void main();
