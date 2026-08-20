import { ipcRenderer } from "electron";

import { PROBLEMS_CHANNELS } from "../shared/problems-ipc-channels";
import type { Problem, ProblemsApi, ProblemsSummary } from "../shared/problems-contract";
import { isValidFilePath } from "../shared/git-security";

export const problemsApi: ProblemsApi = {
  async getProblems(file) {
    if (file !== undefined) {
      if (!isValidFilePath(file)) {
        throw new TypeError("Invalid file path");
      }
    }
    return ipcRenderer.invoke(PROBLEMS_CHANNELS.getProblems, file) as Promise<Problem[]>;
  },

  async getSummary() {
    return ipcRenderer.invoke(PROBLEMS_CHANNELS.getSummary) as Promise<ProblemsSummary>;
  },

  async refresh() {
    return ipcRenderer.invoke(PROBLEMS_CHANNELS.refresh) as Promise<void>;
  },

  onProblemsChanged(cb) {
    const listener = (_event: Electron.IpcRendererEvent, problems: Problem[]) => {
      cb(problems);
    };
    ipcRenderer.on(PROBLEMS_CHANNELS.problemsChanged, listener);
    return () => {
      ipcRenderer.removeListener(PROBLEMS_CHANNELS.problemsChanged, listener);
    };
  },

  onSummaryChanged(cb) {
    const listener = (_event: Electron.IpcRendererEvent, summary: ProblemsSummary) => {
      cb(summary);
    };
    ipcRenderer.on(PROBLEMS_CHANNELS.summaryChanged, listener);
    return () => {
      ipcRenderer.removeListener(PROBLEMS_CHANNELS.summaryChanged, listener);
    };
  },
};
