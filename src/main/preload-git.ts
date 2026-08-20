// src/main/preload-git.ts

import { ipcRenderer } from "electron";
import { GIT_CHANNELS } from "../shared/git-ipc-channels";
import type {
  GitApi,
  GitBranch,
  GitCloneResult,
  GitCommitInput,
  GitCommitResult,
  GitDiffResult,
  GitLogEntry,
  GitOperationState,
  GitPullOptions,
  GitPushOptions,
  GitStatus,
} from "../shared/git-contract";
import {
  isValidBranchName,
  isValidCloneUrl,
  isValidCommitMessage,
  isValidFilePathArray,
  isValidStashMessage,
} from "../shared/git-security";

function assertFiles(files: unknown): asserts files is string[] {
  if (!isValidFilePathArray(files)) {
    throw new TypeError("Invalid file paths: must be an array of relative paths without traversal");
  }
}

function assertBranchName(name: unknown): asserts name is string {
  if (!isValidBranchName(name)) {
    throw new TypeError("Invalid branch name");
  }
}

function assertCommitInput(input: unknown): asserts input is GitCommitInput {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("Commit input must be an object");
  }
  const { message, files } = input as GitCommitInput;
  if (!isValidCommitMessage(message)) {
    throw new TypeError("Invalid commit message");
  }
  if (files !== undefined) {
    assertFiles(files);
  }
}

export const gitApi: GitApi = {
  async status() {
    return ipcRenderer.invoke(GIT_CHANNELS.status) as Promise<GitStatus>;
  },

  async stage(files) {
    assertFiles(files);
    return ipcRenderer.invoke(GIT_CHANNELS.stage, files) as Promise<void>;
  },

  async unstage(files) {
    assertFiles(files);
    return ipcRenderer.invoke(GIT_CHANNELS.unstage, files) as Promise<void>;
  },

  async discardChanges(files) {
    assertFiles(files);
    return ipcRenderer.invoke(GIT_CHANNELS.discardChanges, files) as Promise<void>;
  },

  async commit(input) {
    assertCommitInput(input);
    return ipcRenderer.invoke(GIT_CHANNELS.commit, input) as Promise<GitCommitResult>;
  },

  async branches() {
    return ipcRenderer.invoke(GIT_CHANNELS.branches) as Promise<GitBranch[]>;
  },

  async checkout(branch) {
    assertBranchName(branch);
    return ipcRenderer.invoke(GIT_CHANNELS.checkout, branch) as Promise<void>;
  },

  async createBranch(name, from) {
    assertBranchName(name);
    if (from !== undefined) {
      assertBranchName(from);
    }
    return ipcRenderer.invoke(GIT_CHANNELS.createBranch, name, from) as Promise<void>;
  },

  async diff(file, staged) {
    if (file !== undefined) {
      if (typeof file !== "string" || !isValidFilePathArray([file])) {
        throw new TypeError("Invalid file path for diff");
      }
    }
    return ipcRenderer.invoke(GIT_CHANNELS.diff, file, staged) as Promise<GitDiffResult>;
  },

  async log(limit) {
    if (limit !== undefined) {
      if (typeof limit !== "number" || limit < 1 || limit > 1000 || !Number.isInteger(limit)) {
        throw new TypeError("Log limit must be an integer between 1 and 1000");
      }
    }
    return ipcRenderer.invoke(GIT_CHANNELS.log, limit) as Promise<GitLogEntry[]>;
  },

  async push(options) {
    if (options !== undefined) {
      if (typeof options !== "object" || options === null || Array.isArray(options)) {
        throw new TypeError("Push options must be an object");
      }
      if (options.setUpstream !== undefined && typeof options.setUpstream !== "boolean") {
        throw new TypeError("setUpstream must be a boolean");
      }
    }
    const payload: GitPushOptions | undefined = options?.setUpstream
      ? { setUpstream: true }
      : options === undefined
        ? undefined
        : {};
    return ipcRenderer.invoke(GIT_CHANNELS.push, payload) as Promise<void>;
  },

  async pull(options) {
    if (options !== undefined) {
      if (typeof options !== "object" || options === null || Array.isArray(options)) {
        throw new TypeError("Pull options must be an object");
      }
      if (options.rebase !== undefined && typeof options.rebase !== "boolean") {
        throw new TypeError("rebase must be a boolean");
      }
    }
    const payload: GitPullOptions | undefined = options?.rebase
      ? { rebase: true }
      : options === undefined
        ? undefined
        : {};
    return ipcRenderer.invoke(GIT_CHANNELS.pull, payload) as Promise<void>;
  },

  async stash(message) {
    if (message !== undefined && !isValidStashMessage(message)) {
      throw new TypeError("Invalid stash message");
    }
    return ipcRenderer.invoke(
      GIT_CHANNELS.stash,
      message === undefined ? {} : { message }
    ) as Promise<void>;
  },

  async stashPop() {
    return ipcRenderer.invoke(GIT_CHANNELS.stashPop) as Promise<void>;
  },

  async init() {
    return ipcRenderer.invoke(GIT_CHANNELS.init) as Promise<void>;
  },

  async clone(url) {
    if (!isValidCloneUrl(url)) {
      throw new TypeError("Invalid clone URL");
    }
    return ipcRenderer.invoke(GIT_CHANNELS.clone, url) as Promise<GitCloneResult>;
  },

  onStatusChange(cb) {
    const listener = (_event: Electron.IpcRendererEvent, status: GitStatus) => {
      cb(status);
    };
    ipcRenderer.on(GIT_CHANNELS.statusChanged, listener);
    return () => {
      ipcRenderer.removeListener(GIT_CHANNELS.statusChanged, listener);
    };
  },

  onOperationChange(cb) {
    const listener = (_event: Electron.IpcRendererEvent, state: GitOperationState) => {
      cb(state);
    };
    ipcRenderer.on(GIT_CHANNELS.operationChanged, listener);
    return () => {
      ipcRenderer.removeListener(GIT_CHANNELS.operationChanged, listener);
    };
  },
};
