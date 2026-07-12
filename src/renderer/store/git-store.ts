import { create } from 'zustand';
import { useEditorStore } from './editor-store';

// ──────────────────────────────────────────────
//  Git Store — CAVALLO Studio
//  Gestionează starea Git: branch, fișiere modificate,
//  staged, diff activ, commit history, operații async.
// ──────────────────────────────────────────────

export type GitTabId = 'changes' | 'history';

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
  oldPath?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  refs: string;
}

export interface GitState {
  // ── Status ──
  isRepo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];

  // ── UI state ──
  activeTab: GitTabId;
  selectedFile: GitFileStatus | null;
  diffContent: string;
  filePair: { original: string; modified: string; language: string } | null;
  isDiffStaged: boolean;
  commitMessage: string;

  // ── History ──
  commits: GitCommit[];

  // ── Loading / Error ──
  loading: boolean;
  diffLoading: boolean;
  filePairLoading: boolean;
  opLoading: boolean;
  error: string | null;
  opResult: { ok: boolean; message: string } | null;

  // ── Branch picker ──
  branches: string[];
  showBranchPicker: boolean;
  newBranchName: string;

  // ── Actions ──
  refresh:      () => Promise<void>;
  loadDiff:     (file: GitFileStatus) => Promise<void>;
  stage:        (filePath: string) => Promise<void>;
  unstage:      (filePath: string) => Promise<void>;
  stageAll:     () => Promise<void>;
  unstageAll:   () => Promise<void>;
  discard:      (filePath: string) => Promise<void>;
  revertHunk:   (hunkPatch: string) => Promise<boolean>;
  commit:       () => Promise<void>;
  push:         () => Promise<void>;
  pull:         () => Promise<void>;
  loadLog:      () => Promise<void>;
  loadBranches: () => Promise<void>;
  checkout:     (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  initRepo:     () => Promise<void>;
  stash:        () => Promise<void>;
  stashPop:     () => Promise<void>;

  // ── Setters UI ──
  setActiveTab:       (tab: GitTabId) => void;
  setCommitMessage:   (msg: string) => void;
  setShowBranchPicker: (v: boolean) => void;
  setNewBranchName:   (name: string) => void;
  clearOpResult:      () => void;
}

// Helper: obține projectPath din editor store
function getProjectPath(): string | null {
  return useEditorStore.getState().projectPath;
}

// Helper: setează opResult și îl curăță după 3s
let opResultTimer: ReturnType<typeof setTimeout> | null = null;

function setOpResult(set: (partial: Partial<GitState>) => void, result: { ok: boolean; message: string }) {
  if (opResultTimer) clearTimeout(opResultTimer);
  set({ opResult: result, opLoading: false });
  opResultTimer = setTimeout(() => {
    useGitStore.getState().clearOpResult();
  }, 4000);
}

export const useGitStore = create<GitState>((set, get) => ({
  // ── Stare inițială ──
  isRepo: false,
  branch: '',
  upstream: null,
  ahead: 0,
  behind: 0,
  files: [],

  activeTab: 'changes',
  selectedFile: null,
  diffContent: '',
  filePair: null,
  isDiffStaged: false,
  commitMessage: '',

  commits: [],

  loading: false,
  diffLoading: false,
  filePairLoading: false,
  opLoading: false,
  error: null,
  opResult: null,

  branches: [],
  showBranchPicker: false,
  newBranchName: '',

  // ──────────────────────────────────────────
  //  refresh — reîncarcă status complet
  // ──────────────────────────────────────────
  refresh: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;

    set({ loading: true, error: null });
    try {
      const status = await window.caval.git.status(projectPath);
      set({
        isRepo:   status.isRepo,
        branch:   status.branch,
        upstream: status.upstream,
        ahead:    status.ahead,
        behind:   status.behind,
        files:    status.files,
        loading:  false,
      });

      // Dacă fișierul selectat nu mai există în status, deselecționează
      const { selectedFile } = get();
      if (selectedFile) {
        const still = status.files.find((f: GitFileStatus) => f.path === selectedFile.path && f.staged === selectedFile.staged);
        if (!still) set({ selectedFile: null, diffContent: '', filePair: null });
      }

      const { selectedFile: current } = get();
      if (!current && status.files.length > 0) {
        void get().loadDiff(status.files[0]);
      }
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },

  // ──────────────────────────────────────────
  //  loadDiff — diff pentru fișierul selectat
  // ──────────────────────────────────────────
  loadDiff: async (file: GitFileStatus) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;

    set({ selectedFile: file, diffLoading: true, filePairLoading: true, isDiffStaged: file.staged, filePair: null });
    try {
      const [diff, pair] = await Promise.all([
        window.caval.git.diff(projectPath, file.path, file.staged),
        window.caval.git.filePair(projectPath, file.path, file.staged),
      ]);
      set({ diffContent: diff, filePair: pair, diffLoading: false, filePairLoading: false });
    } catch {
      set({ diffContent: '', filePair: null, diffLoading: false, filePairLoading: false });
    }
  },

  // ──────────────────────────────────────────
  //  Stage / Unstage
  // ──────────────────────────────────────────
  stage: async (filePath: string) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    await window.caval.git.stage(projectPath, filePath);
    await get().refresh();
  },

  unstage: async (filePath: string) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    await window.caval.git.unstage(projectPath, filePath);
    await get().refresh();
  },

  stageAll: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    await window.caval.git.stageAll(projectPath);
    await get().refresh();
  },

  unstageAll: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    await window.caval.git.unstageAll(projectPath);
    await get().refresh();
  },

  // ──────────────────────────────────────────
  //  Discard
  // ──────────────────────────────────────────
  discard: async (filePath: string) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    await window.caval.git.discard(projectPath, filePath);
    await useEditorStore.getState().reloadTabForPath(filePath);
    await get().refresh();
    const { selectedFile } = get();
    if (selectedFile?.path === filePath) {
      await get().loadDiff(selectedFile);
    }
  },

  revertHunk: async (hunkPatch: string) => {
    const projectPath = getProjectPath();
    const { selectedFile } = get();
    if (!projectPath || !selectedFile || selectedFile.staged) return false;

    const result = await window.caval.git.revertHunk(projectPath, selectedFile.path, hunkPatch);
    if (!result.ok) {
      set({ error: result.error ?? 'Revert hunk failed' });
      return false;
    }

    await useEditorStore.getState().reloadTabForPath(selectedFile.path);
    await get().refresh();
    const still = get().files.find((f) => f.path === selectedFile.path && !f.staged) ?? get().files.find((f) => f.path === selectedFile.path);
    if (still) await get().loadDiff(still);
    return true;
  },

  // ──────────────────────────────────────────
  //  Commit
  // ──────────────────────────────────────────
  commit: async () => {
    const projectPath = getProjectPath();
    const { commitMessage, files } = get();
    if (!projectPath) return;
    if (!commitMessage.trim()) {
      set({ error: 'Introdu un mesaj pentru commit.' });
      return;
    }
    const staged = files.filter((f) => f.staged);
    if (staged.length === 0) {
      set({ error: 'Nu există fișiere staged pentru commit.' });
      return;
    }

    set({ opLoading: true, error: null });
    const result = await window.caval.git.commit(projectPath, commitMessage);
    if (result.ok) {
      set({ commitMessage: '' });
      setOpResult(set, { ok: true, message: `Commit creat: ${result.hash}` });
      await get().refresh();
    } else {
      setOpResult(set, { ok: false, message: result.error || 'Commit eșuat.' });
    }
  },

  // ──────────────────────────────────────────
  //  Push / Pull
  // ──────────────────────────────────────────
  push: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true, error: null });
    const { upstream } = get();
    const result = await window.caval.git.push(projectPath, !upstream);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? 'Push realizat cu succes.' : (result.error || 'Push eșuat.'),
    });
    if (result.ok) await get().refresh();
  },

  pull: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true, error: null });
    const result = await window.caval.git.pull(projectPath);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? 'Pull realizat cu succes.' : (result.error || 'Pull eșuat.'),
    });
    if (result.ok) await get().refresh();
  },

  // ──────────────────────────────────────────
  //  Log / History
  // ──────────────────────────────────────────
  loadLog: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    const commits = await window.caval.git.log(projectPath, 100);
    set({ commits });
  },

  // ──────────────────────────────────────────
  //  Branch operations
  // ──────────────────────────────────────────
  loadBranches: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    const branches = await window.caval.git.branches(projectPath);
    set({ branches });
  },

  checkout: async (branch: string) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true });
    const result = await window.caval.git.checkout(projectPath, branch);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? `Schimbat pe branch: ${branch}` : (result.error || 'Checkout eșuat.'),
    });
    if (result.ok) {
      set({ showBranchPicker: false });
      await get().refresh();
    }
  },

  createBranch: async (name: string) => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true });
    const result = await window.caval.git.createBranch(projectPath, name);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? `Branch creat: ${name}` : (result.error || 'Creare branch eșuată.'),
    });
    if (result.ok) {
      set({ showBranchPicker: false, newBranchName: '' });
      await get().refresh();
    }
  },

  // ──────────────────────────────────────────
  //  Init repo
  // ──────────────────────────────────────────
  initRepo: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true, error: null });
    const result = await window.caval.git.init(projectPath);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? 'Repository Git inițializat.' : (result.error || 'git init eșuat.'),
    });
    if (result.ok) await get().refresh();
  },

  // ──────────────────────────────────────────
  //  Stash
  // ──────────────────────────────────────────
  stash: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true });
    const result = await window.caval.git.stash(projectPath);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? 'Modificări salvate în stash.' : (result.error || 'Stash eșuat.'),
    });
    if (result.ok) await get().refresh();
  },

  stashPop: async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return;
    set({ opLoading: true });
    const result = await window.caval.git.stashPop(projectPath);
    setOpResult(set, {
      ok: result.ok,
      message: result.ok ? 'Stash aplicat.' : (result.error || 'Stash pop eșuat.'),
    });
    if (result.ok) await get().refresh();
  },

  // ──────────────────────────────────────────
  //  Setters UI
  // ──────────────────────────────────────────
  setActiveTab:        (tab)  => set({ activeTab: tab }),
  setCommitMessage:    (msg)  => set({ commitMessage: msg, error: null }),
  setShowBranchPicker: (v)    => set({ showBranchPicker: v }),
  setNewBranchName:    (name) => set({ newBranchName: name }),
  clearOpResult:       ()     => set({ opResult: null }),
}));
