import { ipcRenderer } from "electron";

import type {
  GitApi,
  GitBranch,
  GitCommitInput,
  GitFileChange,
  GitFileStatus,
  GitLogEntry,
  GitStatus,
} from "../shared/git-contract";
import { isGitBranchName, isGitRelPath } from "../shared/git-contract";
import { GIT_CHANNELS } from "../shared/git-ipc-channels";

export function assertGitRelPath(filePath: string): void {
  if (!isGitRelPath(filePath)) {
    throw new TypeError("Invalid git path");
  }
}

export function assertGitBranchName(name: string): void {
  if (!isGitBranchName(name)) {
    throw new TypeError("Invalid branch name");
  }
}

function toPorcelain(status: GitFileStatus): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
    case "ignored":
      return "!";
    default:
      return "M";
  }
}

interface GitStatusPayload extends GitStatus {
  isRepo?: boolean;
  upstream?: string | null;
}

function asGitStatus(payload: GitStatusPayload): GitStatus {
  return {
    branch: payload.branch,
    ahead: payload.ahead,
    behind: payload.behind,
    files: payload.files,
  };
}

function asCompatStatus(payload: GitStatusPayload) {
  return {
    branch: payload.branch,
    ahead: payload.ahead,
    behind: payload.behind,
    files: payload.files.map((file: GitFileChange) => ({
      ...file,
      status: toPorcelain(file.status),
    })),
    isRepo: payload.isRepo ?? true,
    upstream: payload.upstream ?? null,
  };
}

function asCompatLog(entries: GitLogEntry[]) {
  return entries.map((entry) => ({
    hash: entry.hash,
    shortHash: entry.hash.slice(0, 7),
    subject: entry.message,
    author: entry.author,
    date: entry.date,
    refs: "",
  }));
}

function asCompatBranches(branches: GitBranch[]): string[] {
  return branches.map((branch) => branch.name);
}

export const gitApi: GitApi = {
  async status() {
    const payload = (await ipcRenderer.invoke(GIT_CHANNELS.status)) as GitStatusPayload;
    return asGitStatus(payload);
  },

  async stage(files) {
    for (const file of files) assertGitRelPath(file);
    await ipcRenderer.invoke(GIT_CHANNELS.stage, files);
  },

  async unstage(files) {
    for (const file of files) assertGitRelPath(file);
    await ipcRenderer.invoke(GIT_CHANNELS.unstage, files);
  },

  async commit(input) {
    if (input.files) {
      for (const file of input.files) assertGitRelPath(file);
    }
    await ipcRenderer.invoke(GIT_CHANNELS.commit, input);
  },

  async branches() {
    return ipcRenderer.invoke(GIT_CHANNELS.branches) as Promise<GitBranch[]>;
  },

  async checkout(branch) {
    assertGitBranchName(branch);
    await ipcRenderer.invoke(GIT_CHANNELS.checkout, branch);
  },

  async diff(file) {
    if (file) assertGitRelPath(file);
    return ipcRenderer.invoke(GIT_CHANNELS.diff, file) as Promise<string>;
  },

  async log(limit) {
    return ipcRenderer.invoke(GIT_CHANNELS.log, limit) as Promise<GitLogEntry[]>;
  },
};

/**
 * GitPanel still calls status(projectPath), stage(projectPath, file), etc.
 * Keep those until the renderer store moves to GitApi.
 */
export const cavalGitPreload = {
  ...gitApi,

  status(projectPath?: string) {
    const pending = ipcRenderer.invoke(GIT_CHANNELS.status) as Promise<GitStatusPayload>;
    if (typeof projectPath === "string") {
      return pending.then(asCompatStatus);
    }
    return pending.then(asGitStatus);
  },

  stage(projectPathOrFiles: string | string[], filePath?: string) {
    if (Array.isArray(projectPathOrFiles)) {
      return gitApi.stage(projectPathOrFiles);
    }
    if (typeof filePath === "string") {
      assertGitRelPath(filePath);
      return ipcRenderer.invoke(GIT_CHANNELS.stage, projectPathOrFiles, filePath);
    }
    return gitApi.stage([projectPathOrFiles]);
  },

  unstage(projectPathOrFiles: string | string[], filePath?: string) {
    if (Array.isArray(projectPathOrFiles)) {
      return gitApi.unstage(projectPathOrFiles);
    }
    if (typeof filePath === "string") {
      assertGitRelPath(filePath);
      return ipcRenderer.invoke(GIT_CHANNELS.unstage, projectPathOrFiles, filePath);
    }
    return gitApi.unstage([projectPathOrFiles]);
  },

  commit(projectPathOrInput: string | GitCommitInput, message?: string) {
    if (typeof projectPathOrInput === "object") {
      return gitApi.commit(projectPathOrInput);
    }
    return ipcRenderer.invoke(GIT_CHANNELS.commit, projectPathOrInput, message);
  },

  diff(projectPathOrFile?: string, filePath?: string, staged?: boolean) {
    if (typeof filePath === "string") {
      assertGitRelPath(filePath);
      return ipcRenderer.invoke(GIT_CHANNELS.diff, projectPathOrFile, filePath, staged) as Promise<string>;
    }
    return gitApi.diff(projectPathOrFile);
  },

  log(projectPathOrLimit?: string | number, limit?: number) {
    if (typeof projectPathOrLimit === "string") {
      return (ipcRenderer.invoke(GIT_CHANNELS.log, projectPathOrLimit, limit) as Promise<GitLogEntry[]>).then(
        asCompatLog
      );
    }
    return gitApi.log(projectPathOrLimit);
  },

  branches(projectPath?: string) {
    const pending = ipcRenderer.invoke(GIT_CHANNELS.branches) as Promise<GitBranch[]>;
    if (typeof projectPath === "string") {
      return pending.then(asCompatBranches);
    }
    return pending;
  },

  checkout(projectPathOrBranch: string, branch?: string) {
    if (typeof branch === "string") {
      assertGitBranchName(branch);
      return ipcRenderer.invoke(GIT_CHANNELS.checkout, projectPathOrBranch, branch);
    }
    return gitApi.checkout(projectPathOrBranch);
  },

  filePair: (projectPath: string, filePath: string, staged: boolean) =>
    ipcRenderer.invoke(GIT_CHANNELS.filePair, projectPath, filePath, staged) as Promise<{
      original: string;
      modified: string;
      language: string;
    }>,
  revertHunk: (projectPath: string, filePath: string, hunkPatch: string) =>
    ipcRenderer.invoke(GIT_CHANNELS.revertHunk, projectPath, filePath, hunkPatch) as Promise<{
      ok: boolean;
      error?: string;
    }>,
  stageAll: (projectPath: string) => ipcRenderer.invoke(GIT_CHANNELS.stageAll, projectPath),
  unstageAll: (projectPath: string) => ipcRenderer.invoke(GIT_CHANNELS.unstageAll, projectPath),
  discard: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke(GIT_CHANNELS.discard, projectPath, filePath),
  push: (projectPath: string, setUpstream?: boolean) =>
    ipcRenderer.invoke(GIT_CHANNELS.push, projectPath, setUpstream),
  pull: (projectPath: string) => ipcRenderer.invoke(GIT_CHANNELS.pull, projectPath),
  createBranch: (projectPath: string, name: string) =>
    ipcRenderer.invoke(GIT_CHANNELS.createBranch, projectPath, name),
  init: (projectPath: string) => ipcRenderer.invoke(GIT_CHANNELS.init, projectPath),
  stash: (projectPath: string, message?: string) =>
    ipcRenderer.invoke(GIT_CHANNELS.stash, projectPath, message),
  stashPop: (projectPath: string) => ipcRenderer.invoke(GIT_CHANNELS.stashPop, projectPath),
  clone: (input: { url: string; parentDir?: string }) =>
    ipcRenderer.invoke(GIT_CHANNELS.clone, input) as Promise<{
      ok: boolean;
      path?: string;
      error?: string;
    }>,
};
