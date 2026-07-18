import { create } from 'zustand';
import { notifyWorkspaceChanged } from './workspace-bridge';

// ──────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────

export interface EditorTab {
  id: string;          // path complet al fișierului
  name: string;        // nume fișier
  path: string;
  content: string;
  language: string;
  isDirty: boolean;    // modificat nesalvat
  viewState?: unknown; // Monaco editor view state (cursor, scroll)
  isAiPreview?: boolean; // tab live generat de AI (nu e pe disk încă)
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  ext?: string;
  children?: FileNode[];
}

export interface EditorSelection {
  text: string;
  path: string;
  startLine: number;
  endLine: number;
}

interface EditorStore {
  // ── Proiect ────────────────────────────────
  projectPath: string | null;
  fileTree: FileNode[];
  setProjectPath: (path: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  refreshTree: () => Promise<void>;

  // ── Tabs ───────────────────────────────────
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (path: string) => Promise<void>;
  createUntitledTab: () => void;
  closeActiveTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  saveTab: (id: string) => Promise<void>;
  saveViewState: (id: string, viewState: unknown) => void;
  reloadTabForPath: (relativePath: string) => Promise<void>;
  showAiPreview: (relativePath: string, content: string) => void;
  updateAiPreview: (relativePath: string, content: string) => void;
  closeAiPreview: () => void;

  // ── Editor cursor / selection ──────────────
  editorSelection: EditorSelection | null;
  activeSymbol: string | null;
  setEditorSelection: (selection: EditorSelection | null) => void;
  setActiveSymbol: (symbol: string | null) => void;

  // ── Sidebar ────────────────────────────────
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
}

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    css: 'css', scss: 'scss',
    html: 'html', py: 'python',
    rs: 'rust', go: 'go',
    sh: 'plaintext', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', env: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

export const AI_PREVIEW_TAB_ID = 'caval-ai-live-preview';

let untitledCounter = 0;

// ──────────────────────────────────────────────
//  Store
// ──────────────────────────────────────────────

export const useEditorStore = create<EditorStore>((set, get) => ({
  // ── Proiect ────────────────────────────────
  projectPath: null,
  fileTree: [],

  setProjectPath: (path) => {
    const prev = get().projectPath;
    set({ projectPath: path });
    if (prev !== path) {
      notifyWorkspaceChanged(path);
    }
  },
  setFileTree: (tree) => set({ fileTree: tree }),

  refreshTree: async () => {
    const { projectPath } = get();
    if (!projectPath) return;
    await window.caval.workspaceSync?.(projectPath);
    const tree: FileNode[] = await window.caval.fs.readTree(projectPath);
    set({ fileTree: tree });
  },

  // ── Tabs ───────────────────────────────────
  tabs: [],
  activeTabId: null,
  editorSelection: null,
  activeSymbol: null,

  setEditorSelection: (selection) => set({ editorSelection: selection }),
  setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),

  openFile: async (filePath) => {
    const { tabs } = get();
    const withoutPreview = tabs.filter((t) => t.id !== AI_PREVIEW_TAB_ID);

    const existing = withoutPreview.find((t) => t.path === filePath);
    if (existing) {
      set({ tabs: withoutPreview, activeTabId: existing.id });
      return;
    }

    const result = await window.caval.fs.readFile(filePath);
    if (!result.ok) {
      console.error('Nu pot citi fișierul:', result.error);
      return;
    }

    const name = filePath.split(/[/\\]/).pop() ?? filePath;
    const tab: EditorTab = {
      id: filePath,
      name,
      path: filePath,
      content: result.content,
      language: detectLanguage(name),
      isDirty: false,
    };

    set({
      tabs: [...withoutPreview, tab],
      activeTabId: filePath,
    });
  },

  createUntitledTab: () => {
    untitledCounter += 1;
    const path = `untitled:${untitledCounter}.txt`;
    const tab: EditorTab = {
      id: path,
      name: `Untitled-${untitledCounter}.txt`,
      path,
      content: '',
      language: 'plaintext',
      isDirty: false,
    };
    set((state) => ({
      tabs: [...state.tabs.filter((t) => t.id !== AI_PREVIEW_TAB_ID), tab],
      activeTabId: path,
    }));
  },

  closeActiveTab: () => {
    const { activeTabId } = get();
    if (activeTabId) get().closeTab(activeTabId);
  },

  closeTab: (id) => {
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const newTabs = state.tabs.filter((t) => t.id !== id);
      let newActive = state.activeTabId;

      if (state.activeTabId === id) {
        // Activează tab-ul din stânga, sau primul rămas
        if (newTabs.length === 0) {
          newActive = null;
        } else {
          newActive = newTabs[Math.max(0, idx - 1)].id;
        }
      }

      return { tabs: newTabs, activeTabId: newActive };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, isDirty: true } : t
      ),
    }));
  },

  saveTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.isAiPreview) return;

    const result = await window.caval.fs.writeFile(tab.path, tab.content);
    if (result.ok) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id ? { ...t, isDirty: false } : t
        ),
      }));
    }
  },

  saveViewState: (id, viewState) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, viewState } : t
      ),
    }));
  },

  reloadTabForPath: async (relativePath) => {
    const { tabs, projectPath } = get();
    if (!projectPath) return;
    const norm = (p: string) => p.replace(/\\/g, '/');
    const fullPath = `${norm(projectPath)}/${norm(relativePath)}`;
    const tab = tabs.find((t) => norm(t.path) === fullPath);
    if (!tab) return;

    const result = await window.caval.fs.readFile(tab.path);
    if (result.ok) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tab.id ? { ...t, content: result.content, isDirty: false } : t
        ),
      }));
    }
  },

  showAiPreview: (relativePath, content) => {
    const name = relativePath.split(/[/\\]/).pop() ?? 'generating';
    const previewTab: EditorTab = {
      id: AI_PREVIEW_TAB_ID,
      name: `✨ ${name}`,
      path: `preview://${relativePath}`,
      content,
      language: detectLanguage(name),
      isDirty: false,
      isAiPreview: true,
    };
    set((state) => ({
      tabs: [...state.tabs.filter((t) => t.id !== AI_PREVIEW_TAB_ID), previewTab],
      activeTabId: AI_PREVIEW_TAB_ID,
    }));
  },

  updateAiPreview: (relativePath, content) => {
    const name = relativePath.split(/[/\\]/).pop() ?? 'generating';
    set((state) => {
      const existing = state.tabs.find((t) => t.id === AI_PREVIEW_TAB_ID);
      if (!existing) {
        const previewTab: EditorTab = {
          id: AI_PREVIEW_TAB_ID,
          name: `✨ ${name}`,
          path: `preview://${relativePath}`,
          content,
          language: detectLanguage(name),
          isDirty: false,
          isAiPreview: true,
        };
        return {
          tabs: [...state.tabs, previewTab],
          activeTabId: AI_PREVIEW_TAB_ID,
        };
      }
      return {
        tabs: state.tabs.map((t) =>
          t.id === AI_PREVIEW_TAB_ID
            ? {
                ...t,
                content,
                name: `✨ ${name}`,
                path: `preview://${relativePath}`,
                language: detectLanguage(name),
              }
            : t
        ),
        activeTabId: AI_PREVIEW_TAB_ID,
      };
    });
  },

  closeAiPreview: () => {
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== AI_PREVIEW_TAB_ID);
      const activeTabId =
        state.activeTabId === AI_PREVIEW_TAB_ID
          ? (tabs[tabs.length - 1]?.id ?? null)
          : state.activeTabId;
      return { tabs, activeTabId };
    });
  },

  // ── Sidebar ────────────────────────────────
  expandedDirs: new Set<string>(),

  toggleDir: (path) => {
    set((state) => {
      const next = new Set(state.expandedDirs);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedDirs: next };
    });
  },
}));
