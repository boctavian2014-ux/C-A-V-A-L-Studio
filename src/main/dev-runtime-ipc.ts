import fsSync from "node:fs";
import path from "node:path";
import { ipcMain } from "electron";
import type { DevRuntimeBuildStatus } from "../shared/dev-runtime-build";
import { DEV_RUNTIME_BUILD_STATUS_CHANNEL } from "./dev-runtime-ipc-channel";

export { DEV_RUNTIME_BUILD_STATUS_CHANNEL };

function fileSignature(filePath: string | undefined): string {
  if (!filePath?.trim()) return "";
  try {
    const stat = fsSync.statSync(filePath);
    const name = path.basename(filePath);
    return `${name}:${Math.trunc(stat.mtimeMs)}:${stat.size}`;
  } catch {
    return "";
  }
}

function runtimePaths(): { mainPath: string; preloadPath: string } {
  return {
    mainPath: path.join(__dirname, "electron-main.js"),
    preloadPath: path.join(__dirname, "preload.js"),
  };
}

function buildHash(): string {
  const { mainPath, preloadPath } = runtimePaths();
  return [fileSignature(mainPath), fileSignature(preloadPath)].filter(Boolean).join("|");
}

/** Captured once when the main process module loads. */
const RUNTIME_BUILD_HASH = buildHash();

export function getDevRuntimeBuildStatus(
  env: NodeJS.ProcessEnv = process.env
): DevRuntimeBuildStatus {
  const latestHash = buildHash();
  const isDev = env.NODE_ENV !== "production";
  return {
    isDev,
    runningHash: RUNTIME_BUILD_HASH,
    latestHash,
    needsRestart: Boolean(isDev && latestHash && latestHash !== RUNTIME_BUILD_HASH),
  };
}

export type DevRuntimeBuildStatusResponse =
  | { ok: true; status: DevRuntimeBuildStatus }
  | { ok: false; error: string };

export function registerDevRuntimeHandlers(): void {
  ipcMain.handle(DEV_RUNTIME_BUILD_STATUS_CHANNEL, async (): Promise<DevRuntimeBuildStatusResponse> => {
    try {
      return { ok: true, status: getDevRuntimeBuildStatus() };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
