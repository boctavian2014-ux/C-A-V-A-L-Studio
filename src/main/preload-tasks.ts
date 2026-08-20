import { ipcRenderer } from "electron";

import { TASKS_CHANNELS } from "../shared/tasks-ipc-channels";
import {
  isValidRunId,
  isValidTaskName,
  type Task,
  type TaskOutputChunk,
  type TaskRun,
  type TasksApi,
} from "../shared/tasks-contract";

export const tasksApi: TasksApi = {
  async list() {
    return ipcRenderer.invoke(TASKS_CHANNELS.list) as Promise<Task[]>;
  },

  async run(taskName) {
    if (!isValidTaskName(taskName)) {
      throw new TypeError("Invalid task name");
    }
    return ipcRenderer.invoke(TASKS_CHANNELS.run, taskName) as Promise<TaskRun>;
  },

  async stop(runId) {
    if (!isValidRunId(runId)) {
      throw new TypeError("Invalid run id");
    }
    return ipcRenderer.invoke(TASKS_CHANNELS.stop, runId) as Promise<void>;
  },

  async getRun(runId) {
    if (!isValidRunId(runId)) {
      throw new TypeError("Invalid run id");
    }
    return ipcRenderer.invoke(TASKS_CHANNELS.getRun, runId) as Promise<TaskRun>;
  },

  async getRuns() {
    return ipcRenderer.invoke(TASKS_CHANNELS.getRuns) as Promise<TaskRun[]>;
  },

  onRunChanged(cb) {
    const listener = (_event: Electron.IpcRendererEvent, run: TaskRun) => {
      cb(run);
    };
    ipcRenderer.on(TASKS_CHANNELS.runChanged, listener);
    return () => {
      ipcRenderer.removeListener(TASKS_CHANNELS.runChanged, listener);
    };
  },

  onOutput(cb) {
    const listener = (_event: Electron.IpcRendererEvent, chunk: TaskOutputChunk) => {
      cb(chunk);
    };
    ipcRenderer.on(TASKS_CHANNELS.output, listener);
    return () => {
      ipcRenderer.removeListener(TASKS_CHANNELS.output, listener);
    };
  },
};
