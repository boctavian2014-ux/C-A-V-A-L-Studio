import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

import { PROBLEMS_CHANNELS } from "../shared/problems-ipc-channels";
import { isValidFilePath } from "../shared/git-security";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { problemsService } from "./problems/problems-service";

function broadcastToAllWindows(channel: string, payload: unknown): void {
  const windows =
    typeof BrowserWindow.getAllWindows === "function" ? BrowserWindow.getAllWindows() : [];
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

let listenersRegistered = false;

export function registerProblemsHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  if (!listenersRegistered) {
    problemsService.on("problems-changed", (problems) => {
      try {
        broadcastToAllWindows(PROBLEMS_CHANNELS.problemsChanged, problems);
      } catch {
        // best-effort fan-out
      }
    });
    problemsService.on("summary-changed", (summary) => {
      try {
        broadcastToAllWindows(PROBLEMS_CHANNELS.summaryChanged, summary);
      } catch {
        // best-effort fan-out
      }
    });
    listenersRegistered = true;
  }

  const boundRoot = (event: IpcMainInvokeEvent): string =>
    requireBoundWorkspaceRootFromEvent(
      event,
      getBoundWorkspaceRoot,
      "Deschide un folder în workspace înainte de a rula diagnostice."
    );

  const handle: typeof ipcMain.handle = ((channel, listener) => {
    return ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedSender(event);
      return (listener as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown)(
        event,
        ...args
      );
    });
  }) as typeof ipcMain.handle;

  handle(PROBLEMS_CHANNELS.getProblems, async (_event, file?: unknown) => {
    if (file !== undefined) {
      if (!isValidFilePath(file)) throw new TypeError("Invalid file path");
      return problemsService.getProblems(file);
    }
    return problemsService.getProblems();
  });

  handle(PROBLEMS_CHANNELS.getSummary, async () => {
    return problemsService.getSummary();
  });

  handle(PROBLEMS_CHANNELS.refresh, async (event) => {
    const root = boundRoot(event);
    await problemsService.collect(root);
  });
}
