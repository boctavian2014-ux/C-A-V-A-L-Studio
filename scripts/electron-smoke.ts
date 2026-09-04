import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { redactSensitiveText } from "../src/shared/command-output-redaction";
import {
  buildElectronSmokeEnv,
  isFatalSmokeLine,
  listForbiddenSmokeKeys,
} from "./electron-smoke-env";

const ROOT = path.resolve(__dirname, "..");
const SMOKE_TIMEOUT_MS = 60_000;
const ARTIFACT_DIR = path.join(ROOT, ".cicd-artifacts");

function fail(message: string): never {
  console.error(`[electron-smoke] ${message}`);
  process.exit(1);
}

function resolveElectronBinary(): string {
  const require = createRequire(__filename);
  const electronPath = require("electron") as string;
  if (!electronPath || !fs.existsSync(electronPath)) {
    fail(`Electron binary not found at ${electronPath}`);
  }
  return electronPath;
}

async function main(): Promise<void> {
  const leftoverKeys = listForbiddenSmokeKeys(process.env);
  if (leftoverKeys.length > 0) {
    console.warn(
      `[electron-smoke] stripping provider/cloud keys from smoke env: ${leftoverKeys.join(", ")}`
    );
  }

  const mainJs = path.join(ROOT, "dist", "main", "electron-main.js");
  if (!fs.existsSync(mainJs)) {
    fail("dist/main/electron-main.js missing — run npm run build first");
  }

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "caval-electron-smoke-"));
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    JSON.stringify({ name: "caval-smoke-workspace", private: true })
  );
  fs.writeFileSync(path.join(workspace, "README.md"), "CAVALLO electron smoke workspace\n");

  const env = buildElectronSmokeEnv(process.env, {
    CAVAL_SMOKE_WORKSPACE: workspace,
    ELECTRON_ENABLE_LOGGING: "1",
  });
  if (process.platform === "linux") {
    env.ELECTRON_DISABLE_SANDBOX = "1";
  }

  const stillPresent = listForbiddenSmokeKeys(env);
  if (stillPresent.length > 0) {
    fail(`smoke env still contains forbidden keys: ${stillPresent.join(", ")}`);
  }

  const electronBin = resolveElectronBinary();
  const args = [".", "--disable-gpu"];
  if (process.platform === "linux") args.push("--no-sandbox");

  let stdout = "";
  let stderr = "";
  const child = spawn(electronBin, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });

  const timeout = setTimeout(() => {
    child.kill();
  }, SMOKE_TIMEOUT_MS);

  let exitCode = 1;
  try {
    exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", (err) => reject(err));
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    clearTimeout(timeout);
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const combined = redactSensitiveText(`${stdout}\n${stderr}`);
  fs.writeFileSync(path.join(ARTIFACT_DIR, "electron-smoke-stdout.txt"), redactSensitiveText(stdout), "utf8");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "electron-smoke-stderr.txt"), redactSensitiveText(stderr), "utf8");
  fs.writeFileSync(path.join(ARTIFACT_DIR, "electron-smoke-combined.txt"), combined, "utf8");

  const lines = combined.split(/\r?\n/);
  const fatals = lines.filter((line) => isFatalSmokeLine(line));
  if (fatals.length > 0) {
    fail(`fatal output:\n${fatals.slice(0, 20).join("\n")}`);
  }
  if (!/\[caval-smoke\] main-ready/.test(combined)) {
    fail("missing [caval-smoke] main-ready marker");
  }
  if (!/\[caval-smoke\] renderer-ready/.test(combined) && !/\[caval\] Renderer loaded/.test(combined)) {
    fail("missing renderer ready marker");
  }
  if (!/\[caval-smoke\] bridge-ready/.test(combined)) {
    fail("missing [caval-smoke] bridge-ready marker — preload/contextBridge may have failed");
  }
  if (!/\[caval-smoke\] complete/.test(combined)) {
    fail("missing [caval-smoke] complete marker — process may have hung");
  }
  if (exitCode !== 0) {
    fail(`Electron exited with code ${exitCode}`);
  }
  console.log("[electron-smoke] ok");
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
