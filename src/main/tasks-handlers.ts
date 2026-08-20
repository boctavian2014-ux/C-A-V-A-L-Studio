import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";

import { TASKS_CHANNELS } from "../shared/tasks-ipc-channels";
import { isValidRunId, isValidTaskName } from "../shared/tasks-contract";
import { assertTrustedSender } from "./ipc-trust";
import {
  requireBoundWorkspaceRootFromEvent,
  type BoundWorkspaceRootGetter,
} from "./bound-workspace";
import { tasksService } from "./tasks/tasks-service";

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

export function registerTasksHandlers(getBoundWorkspaceRoot: BoundWorkspaceRootGetter): void {
  if (!listenersRegistered) {
    tasksService.on("run-changed", (run) => {
      try {
        broadcastToAllWindows(TASKS_CHANNELS.runChanged, run);
      } catch {
        // best-effort fan-out
      }
    });
    tasksService.on("output", (chunk) => {
      try {
        broadcastToAllWindows(TASKS_CHANNELS.output, chunk);
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
      "Deschide un folder în workspace înainte de a rula task-uri."
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

  handle(TASKS_CHANNELS.list, async (event) => {
    const cwd = boundRoot(event);
    return tasksService.list(cwd);
  });

  handle(TASKS_CHANNELS.run, async (event, taskName: unknown) => {
    if (!isValidTaskName(taskName)) {
      throw new TypeError("Invalid task name");
    }
    const cwd = boundRoot(event);
    return tasksService.run(cwd, taskName);
  });

  handle(TASKS_CHANNELS.stop, async (event, runId: unknown) => {
    if (!isValidRunId(runId)) {
      throw new TypeError("Invalid run id");
    }
    const cwd = boundRoot(event);
    return tasksService.stop(cwd, runId);
  });

  handle(TASKS_CHANNELS.getRun, async (event, runId: unknown) => {
    if (!isValidRunId(runId)) {
      throw new TypeError("Invalid run id");
    }
    const cwd = boundRoot(event);
    const run = tasksService.getRun(cwd, runId);
    if (!run) {
      throw new Error("Run not found");
    }
    return run;
  });

  handle(TASKS_CHANNELS.getRuns, async (event) => {
    const cwd = boundRoot(event);
    return tasksService.getRuns(cwd);
  });
}

export async function shutdownAllTasks(): Promise<void> {
  await tasksService.shutdownAll();
}

export function shutdownAllTasksSync(): void {
  tasksService.shutdownAllSync();
}
