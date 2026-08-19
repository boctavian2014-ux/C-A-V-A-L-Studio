import { create } from "zustand";

import type {
  GitApi,
  GitBranch,
  GitFileChange,
  GitLogEntry,
  GitOperationState,
  GitStatus,
} from "../../shared/git-contract";
import { useEditorStore } from "./editor-store";

export type GitTabId = "changes" | "history";

/** @deprecated Use GitFileChange from the shared contract. Kept as a store alias. */
export type GitFileStatus = GitFileChange;

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

function getGitApi(): GitApi {
  const git = window.caval?.git;
  if (!git) {
    throw new Error("Git API unavailable");
  }
  return git as unknown as GitApi;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function applyStatusFields(status: GitStatus): Pick<
  GitState,
  "isRepo" | "branch" | "upstream" | "ahead" | "behind" | "files" | "loading" | "error"
> {
  const extra = status as GitStatus & { isRepo?: boolean; upstream?: string | null };
  return {
    isRepo: extra.isRepo ?? true,
    branch: status.branch,
    upstream: extra.upstream ?? null,
    ahead: status.ahead,
    behind: status.behind,
    files: status.files,
    loading: false,
    error: null,
  };
}

function logToCommit(entry: GitLogEntry): GitCommit {
  return {
    hash: entry.hash,
    shortHash: entry.shortHash,
    subject: entry.message,
    author: entry.author,
    date: entry.date,
    refs: "",
  };
}

export interface GitState {
  isRepo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileChange[];

  activeTab: GitTabId;
  selectedFile: GitFileChange | null;
  diffContent: string;
  diffBinary: boolean;
  isDiffStaged: boolean;
  commitMessage: string;

  commits: GitCommit[];

  loading: boolean;
  diffLoading: boolean;
  opLoading: boolean;
  error: string | null;
  opResult: { ok: boolean; message: string } | null;
  operation: GitOperationState | null;

  branches: GitBranch[];
  showBranchPicker: boolean;
  newBranchName: string;

  refresh: () => Promise<void>;
  applyStatus: (status: GitStatus) => void;
  setOperation: (operation: GitOperationState) => void;
  loadDiff: (file: GitFileChange, staged?: boolean) => Promise<void>;
  stage: (filePath: string) => Promise<void>;
  unstage: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discard: (filePath: string) => Promise<void>;
  commit: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  loadLog: () => Promise<void>;
  loadBranches: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  initRepo: () => Promise<void>;
  stash: () => Promise<void>;
  stashPop: () => Promise<void>;

  setActiveTab: (tab: GitTabId) => void;
  setCommitMessage: (msg: string) => void;
  setShowBranchPicker: (v: boolean) => void;
  setNewBranchName: (name: string) => void;
  clearOpResult: () => void;
  resetForTests: () => void;
}

let opResultTimer: ReturnType<typeof setTimeout> | null = null;

function setOpResult(set: (partial: Partial<GitState>) => void, result: { ok: boolean; message: string }) {
  if (opResultTimer) clearTimeout(opResultTimer);
  set({ opResult: result, opLoading: false });
  opResultTimer = setTimeout(() => {
    useGitStore.getState().clearOpResult();
  }, 4000);
}

const GIT_STORE_DEFAULTS: Pick<
  GitState,
  | "isRepo"
  | "branch"
  | "upstream"
  | "ahead"
  | "behind"
  | "files"
  | "activeTab"
  | "selectedFile"
  | "diffContent"
  | "diffBinary"
  | "isDiffStaged"
  | "commitMessage"
  | "commits"
  | "loading"
  | "diffLoading"
  | "opLoading"
  | "error"
  | "opResult"
  | "operation"
  | "branches"
  | "showBranchPicker"
  | "newBranchName"
> = {
  isRepo: false,
  branch: "",
  upstream: null,
  ahead: 0,
  behind: 0,
  files: [],
  activeTab: "changes",
  selectedFile: null,
  diffContent: "",
  diffBinary: false,
  isDiffStaged: false,
  commitMessage: "",
  commits: [],
  loading: true,
  diffLoading: false,
  opLoading: false,
  error: null,
  opResult: null,
  operation: null,
  branches: [],
  showBranchPicker: false,
  newBranchName: "",
};

export const useGitStore = create<GitState>((set, get) => ({
  ...GIT_STORE_DEFAULTS,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const status = await getGitApi().status();
      get().applyStatus(status);
    } catch (err: unknown) {
      set({ loading: false, error: errorMessage(err, "Git status failed") });
    }
  },

  applyStatus: (status) => {
    const fields = applyStatusFields(status);
    const { selectedFile } = get();
    let nextSelected = selectedFile;
    let clearDiff = false;
    if (selectedFile) {
      const still = status.files.find(
        (file) => file.path === selectedFile.path && file.staged === selectedFile.staged
      );
      if (!still) {
        nextSelected = null;
        clearDiff = true;
      }
    }
    set({
      ...fields,
      selectedFile: nextSelected,
      ...(clearDiff ? { diffContent: "", diffBinary: false } : {}),
    });
  },

  setOperation: (operation) => {
    const opLoading = operation.status === "running";
    const error =
      operation.status === "failed" ? operation.error ?? "Git operation failed" : get().error;
    set({ operation, opLoading, error: operation.status === "failed" ? error : get().error });
    if (operation.status === "failed" && operation.error) {
      setOpResult(set, { ok: false, message: operation.error });
    }
  },

  loadDiff: async (file, staged = file.staged) => {
    set({ selectedFile: file, diffLoading: true, isDiffStaged: staged });
    try {
      const result = await getGitApi().diff(file.path, staged);
      set({
        diffContent: result.diff,
        diffBinary: result.binary,
        diffLoading: false,
      });
    } catch (err: unknown) {
      set({
        diffContent: "",
        diffBinary: false,
        diffLoading: false,
        error: errorMessage(err, "Could not load diff"),
      });
    }
  },

  stage: async (filePath) => {
    set({ error: null });
    try {
      await getGitApi().stage([filePath]);
      await get().refresh();
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not stage file") });
    }
  },

  unstage: async (filePath) => {
    set({ error: null });
    try {
      await getGitApi().unstage([filePath]);
      await get().refresh();
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not unstage file") });
    }
  },

  stageAll: async () => {
    const paths = get()
      .files.filter((file) => !file.staged)
      .map((file) => file.path);
    if (paths.length === 0) return;
    set({ error: null });
    try {
      await getGitApi().stage(paths);
      await get().refresh();
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not stage files") });
    }
  },

  unstageAll: async () => {
    const paths = get()
      .files.filter((file) => file.staged)
      .map((file) => file.path);
    if (paths.length === 0) return;
    set({ error: null });
    try {
      await getGitApi().unstage(paths);
      await get().refresh();
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not unstage files") });
    }
  },

  discard: async (filePath) => {
    set({ error: null });
    try {
      await getGitApi().discardChanges([filePath]);
      await useEditorStore.getState().reloadTabForPath(filePath);
      await get().refresh();
      const selected = get().selectedFile;
      if (selected?.path === filePath) {
        await get().loadDiff(selected);
      }
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not discard changes") });
    }
  },

  commit: async () => {
    const { commitMessage, files } = get();
    const message = commitMessage.trim();
    if (!message || !files.some((file) => file.staged)) return;

    set({ opLoading: true, error: null });
    try {
      const result = await getGitApi().commit({ message });
      set({ commitMessage: "" });
      setOpResult(set, { ok: true, message: `Commit creat: ${result.hash}` });
      await get().refresh();
    } catch (err: unknown) {
      setOpResult(set, { ok: false, message: errorMessage(err, "Commit failed") });
      set({ error: errorMessage(err, "Commit failed") });
    }
  },

  push: async () => {
    set({
      opLoading: false,
      error: "Push rămâne pe canalul confirmat din main — Pas 4.5.",
    });
  },

  pull: async () => {
    set({
      opLoading: false,
      error: "Pull rămâne pe canalul confirmat din main — Pas 4.5.",
    });
  },

  loadLog: async () => {
    try {
      const entries = await getGitApi().log(100);
      set({ commits: entries.map(logToCommit) });
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not load history") });
    }
  },

  loadBranches: async () => {
    try {
      const branches = await getGitApi().branches();
      set({ branches });
    } catch (err: unknown) {
      set({ error: errorMessage(err, "Could not load branches") });
    }
  },

  checkout: async (branch) => {
    set({ opLoading: true, error: null });
    try {
      await getGitApi().checkout(branch);
      set({ showBranchPicker: false, opLoading: false });
      setOpResult(set, { ok: true, message: `Schimbat pe branch: ${branch}` });
      await get().refresh();
    } catch (err: unknown) {
      setOpResult(set, { ok: false, message: errorMessage(err, "Checkout failed") });
      set({ error: errorMessage(err, "Checkout failed") });
    }
  },

  createBranch: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set({ opLoading: true, error: null });
    try {
      await getGitApi().createBranch(trimmed);
      set({ showBranchPicker: false, newBranchName: "", opLoading: false });
      setOpResult(set, { ok: true, message: `Branch creat: ${trimmed}` });
      await get().refresh();
    } catch (err: unknown) {
      setOpResult(set, { ok: false, message: errorMessage(err, "Create branch failed") });
      set({ error: errorMessage(err, "Create branch failed") });
    }
  },

  initRepo: async () => {
    set({
      error: "git init rămâne pe canalul legacy — Pas 4.5.",
    });
  },

  stash: async () => {
    set({ error: "Stash rămâne pe canalul legacy — Pas 4.5." });
  },

  stashPop: async () => {
    set({ error: "Stash pop rămâne pe canalul legacy — Pas 4.5." });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setCommitMessage: (msg) => set({ commitMessage: msg, error: null }),
  setShowBranchPicker: (v) => set({ showBranchPicker: v }),
  setNewBranchName: (name) => set({ newBranchName: name }),
  clearOpResult: () => set({ opResult: null }),
  resetForTests: () => set({ ...GIT_STORE_DEFAULTS }),
}));
