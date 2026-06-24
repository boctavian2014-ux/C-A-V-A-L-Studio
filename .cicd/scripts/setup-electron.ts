import { run } from "./ci-utils";

const main = async (): Promise<void> => {
  if (process.platform === "linux") {
    await run("bash", ["-lc", "sudo apt-get update && sudo apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2t64 rpm fakeroot dpkg"]);
  }

  if (process.platform === "darwin") {
    console.log("macOS signing expects CAVAL_MAC_DEVELOPER_ID and Apple notarization secrets.");
  }

  if (process.platform === "win32") {
    console.log("Windows signing expects EV certificate secrets and signtool on PATH.");
  }
};

void main();
