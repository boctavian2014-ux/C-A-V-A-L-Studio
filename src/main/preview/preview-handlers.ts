import fs from "node:fs";
import fsPromises from "node:fs/promises";

import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";

import { PREVIEW_CHANNELS } from "../../shared/preview-ipc-channels";
import { parsePreviewTarget } from "../../shared/preview-security";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "../bound-workspace";
import { assertTrustedSender } from "../ipc-trust";
import { resolveSandboxedWorkspacePath } from "../path-security";
import { previewLauncher } from "./preview-launcher";

const PREVIEW_CONFIG_STUB = `{
  "preview": {
    "web": {
      "enabled": true,
      "cwd": ".",
      "command": "npm run dev",
      "url": "http://localhost:5173",
      "openMode": "external"
    },
    "mobile": {
      "enabled": true,
      "cwd": "mobile-app",
      "command": "npx expo start",
      "url": "exp://127.0.0.1:8081"
    }
  }
}
`;

function broadcastPreviewState(state: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(PREVIEW_CHANNELS.stateChanged, state);
  }
}

function broadcastPreviewLog(line: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(PREVIEW_CHANNELS.logLine, line);
  }
}

let wired = false;

function wirePreviewLauncherEvents(): void {
  if (wired) return;
  wired = true;
  previewLauncher.on("state-changed", (state) => broadcastPreviewState(state));
  previewLauncher.on("log", (line) => broadcastPreviewLog(line));
}

async function ensurePreviewConfig(workspaceRoot: string): Promise<string> {
  const configPath = resolveSandboxedWorkspacePath(workspaceRoot, "caval.jsonc");
  if (!fs.existsSync(configPath)) {
    await fsPromises.writeFile(configPath, PREVIEW_CONFIG_STUB, "utf8");
  }
  return configPath;
}

export function registerPreviewHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  wirePreviewLauncherEvents();

  const boundRoot = (event: IpcMainInvokeEvent): string =>
    requireBoundWorkspaceRootFromEvent(
      event,
      getBoundWorkspaceRoot,
      "Open a folder before using Preview."
    );

  const handle = <T>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T
  ) => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedSender(event);
      return listener(event, ...args);
    });
  };

  handle(PREVIEW_CHANNELS.getState, (_event, target: unknown) => {
    const validTarget = parsePreviewTarget(target);
    return previewLauncher.getState(validTarget);
  });

  handle(PREVIEW_CHANNELS.start, async (event, target: unknown) => {
    const validTarget = parsePreviewTarget(target);
    const workspaceRoot = boundRoot(event);
    return previewLauncher.start(validTarget, workspaceRoot);
  });

  handle(PREVIEW_CHANNELS.stop, (_event, target: unknown) => {
    const validTarget = parsePreviewTarget(target);
    return previewLauncher.stop(validTarget);
  });

  handle(PREVIEW_CHANNELS.restart, async (event, target: unknown) => {
    const validTarget = parsePreviewTarget(target);
    const workspaceRoot = boundRoot(event);
    return previewLauncher.restart(validTarget, workspaceRoot);
  });

  handle(PREVIEW_CHANNELS.getLogs, (_event, target: unknown) => {
    const validTarget = parsePreviewTarget(target);
    return previewLauncher.getLogs(validTarget);
  });

  handle(PREVIEW_CHANNELS.openConfig, async (event) => {
    const workspaceRoot = boundRoot(event);
    const configPath = await ensurePreviewConfig(workspaceRoot);
    await shell.openPath(configPath);
  });
}

export async function stopAllPreviewProcesses(): Promise<void> {
  await previewLauncher.shutdownAll();
}
