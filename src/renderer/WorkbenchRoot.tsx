import React, { useEffect, useCallback, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { CavalThemeProvider } from '../../themes/theme-provider';
import { FileTree } from './components/sidebar/FileTree';
import { TabBar } from './components/editor/TabBar';
const MonacoEditor = lazy(() =>
  import('./components/editor/MonacoEditor.js').then((m) => ({ default: m.MonacoEditor }))
);
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { useEditorStore } from './store/editor-store';
import { useAIStore, hydrateApiKeysFromSecrets } from '../../ai/composer/ai-store';
import { useRestoreChatWorkspace } from './hooks/useRestoreChatWorkspace';
import { AIPanel } from '../../ai/composer/AIPanel';
import { GitPanel } from './components/git/GitPanel';
import { useGitStore } from './store/git-store';
import { CAVAL_OPEN_CODING_CHAT_EVENT } from '../../ai/engineering/engineering-handoff';
import { CAVAL_OPEN_EXPLORER_SIDEBAR_EVENT } from './components/engineering/bootstrap-robotics-project';
import { EngineeringAIPanel } from './components/engineering/EngineeringAIPanel';
import { EngineeringCadPreview } from './components/engineering/EngineeringCadPreview';
import { CadViewer } from './components/engineering/CadViewer';
import { RoboticsResponseStage } from './components/engineering/RoboticsResponseStage';
import { useEngineeringCadStore } from './store/engineering-cad-store';
import { useRoboticsSessionStore } from './store/robotics-session-store';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { SearchPanel } from './components/search/SearchPanel';
import { ExtensionsHub } from './components/extensions/ExtensionsHub';
import { QuickOpen } from './components/navigation/QuickOpen';
import { WorkspaceSearch } from './components/search/WorkspaceSearch';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsOverlay } from './components/navigation/ShortcutsOverlay';
import { ReferencesOverlay, type ReferenceHit } from './components/navigation/ReferencesOverlay';
import { QuickFixDiffPreview } from './components/editor/QuickFixDiffPreview';
import { RefactorDiffPreview } from './components/editor/RefactorDiffPreview';
import { ExplainSelectionPanel } from './components/editor/ExplainSelectionPanel';
import { buildWorkbenchCommands } from './commands/command-registry';
import { handleMenuCommand, type MenuCommandContext } from './commands/menu-command-router';
import { showWorkbenchToast } from './commands/workbench-toast';
import { tActive } from '../../ai/i18n/active-locale';
import { useTranslation } from '../../ai/i18n/useTranslation';
import { useProblemsStore } from './store/problems-store';
import { WorkbenchHeader } from './components/workbench/WorkbenchHeader';
import { WorkbenchMenuBar } from './components/workbench/WorkbenchMenuBar';
import { ConnectionStatusIndicator } from './components/workbench/ConnectionStatusIndicator';
import { useAiWorkCanvasController } from './hooks/use-ai-work-canvas';
import { SidebarCloseButton } from './components/workbench/SidebarCloseButton';
import { useOpenWorkspace } from './hooks/useOpenWorkspace';
import { useSettingsStore } from './store/settings-store';
import { pickWorkspaceStartupFile, shouldHydrateStartupDocument } from '../shared/internal-workspace-paths';
import { DEV_RESTART_TOAST, shouldNotifyRuntimeRestart } from '../shared/dev-runtime-build';
import {
  IconGit,
  IconSparkle,
} from './components/brand/CavaloIcons';
import { ActivityBar, ACTIVITY_BAR_WIDTH, type ActivityTab } from './components/sidebar/ActivityBar';
import { PreviewContentPanel } from './components/preview/PreviewContentPanel';
import { PreviewStatusSync } from './components/preview/PreviewStatusSync';
import { usePreviewStore } from './store/preview-store';

// ──────────────────────────────────────────────
//  Layout squeeze helpers
// ──────────────────────────────────────────────

const ENGINEERING_PANEL_WIDTH = 360;
const AI_PANEL_DEFAULT_WIDTH = 340;
const NARROW_WINDOW_THRESHOLD = 1100;
const MIN_EDITOR_WIDTH = 300;
const DEV_RUNTIME_BUILD_HASH_KEY = "caval-dev-runtime-build-hash";

function readAiPanelWidth(): number {
  try {
    const raw = localStorage.getItem('caval-ai-panel-width');
    const n = raw ? Number(raw) : AI_PANEL_DEFAULT_WIDTH;
    if (!Number.isFinite(n)) return AI_PANEL_DEFAULT_WIDTH;
    return Math.max(260, Math.min(600, n));
  } catch {
    return AI_PANEL_DEFAULT_WIDTH;
  }
}

function sidebarWidthFor(activity: ActivityTab, open: boolean): number {
  if (!open) return 0;
  switch (activity) {
    case 'extensions':
      return 320;
    case 'settings':
      return 520;
    default:
      return 280;
  }
}

const squeezeBtnStyle: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 4, border: '1px solid var(--caval-border)',
  background: 'var(--caval-surface-raised)', color: 'var(--caval-accent)',
  fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

function EditorSqueezeBanner({ onCollapseSidebar, onCloseAi }: { onCollapseSidebar: () => void; onCloseAi: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, maxWidth: '90%',
      padding: '6px 12px', borderRadius: 6,
      background: 'rgba(0,224,255,0.1)', border: '1px solid var(--caval-accent)',
      fontSize: 11, color: 'var(--caval-text)', lineHeight: 1.4,
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    }}>
      <span>Editor îngust — închide un panou lateral pentru mai mult spațiu.</span>
      <button type="button" onClick={onCollapseSidebar} style={squeezeBtnStyle}>Închide sidebar</button>
      <button type="button" onClick={onCloseAi} style={squeezeBtnStyle}>Închide AI</button>
    </div>
  );
}

// ──────────────────────────────────────────────
//  Status Bar
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
//  SidebarShell — container reutilizabil pentru panouri laterale
// ──────────────────────────────────────────────

function SidebarShell({
  children,
  width,
  onClose,
}: {
  children: React.ReactNode;
  width: number;
  onClose?: () => void;
}) {
  return (
    <div style={{
      width, flexShrink: 0,
      background: 'var(--caval-bg)',
      borderRight: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {onClose && (
        <SidebarCloseButton
          onClick={onClose}
          style={{ position: 'absolute', top: 6, right: 6, zIndex: 5 }}
        />
      )}
      {children}
    </div>
  );
}

function StatusBar({ aiPanelOpen, onToggleAI }: { aiPanelOpen: boolean; onToggleAI: () => void }) {
  const { t } = useTranslation();
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const { isRepo, branch } = useGitStore();
  const errorCount = useProblemsStore((s) => s.errorCount());
  const warningCount = useProblemsStore((s) => s.warningCount());

  return (
    <div
      data-testid="workbench-status-bar"
      style={{
      height: 22,
      background: 'var(--caval-surface)',
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 12,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      color: 'var(--caval-text-muted)', flexShrink: 0,
    }}>
      <StatusItem
        onClick={() => document.dispatchEvent(new CustomEvent('caval:terminal-panel-tab', { detail: { tab: 'problems' } }))}
        style={{ cursor: 'pointer' }}
        aria-label={t('statusBar.problemsSummary', { errors: errorCount, warnings: warningCount })}
      >
        {errorCount === 0 ? '✓' : '✕'} {errorCount} {t('statusBar.errors')} &nbsp;⚠ {warningCount}
      </StatusItem>
      <StatusItem style={{ gap: 6 }}>
        <ConnectionStatusIndicator />
      </StatusItem>
      <StatusItem>
        <IconGit size={11} strokeWidth={1.8} />
        {isRepo ? branch || '—' : t('statusBar.noGit')}
      </StatusItem>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
        {activeTab && (
          <>
            <StatusItem>{activeTab.language}</StatusItem>
            <StatusItem>{t('statusBar.encoding')}</StatusItem>
          </>
        )}
        {/* Buton AI în status bar — toggle rapid */}
        <button
          onClick={onToggleAI}
          title={t('statusBar.aiToggleTitle')}
          aria-label={t('statusBar.aiToggleTitle')}
          style={{
            background: aiPanelOpen ? 'rgba(0,224,255,0.12)' : 'transparent',
            border: aiPanelOpen ? '1px solid var(--caval-accent)' : 'none',
            cursor: 'pointer',
            color: aiPanelOpen ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
            display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px',
            borderRadius: 3,
          }}
        >
          <IconSparkle size={10} strokeWidth={2} />
          {aiPanelOpen ? t('statusBar.aiToggleActive') : t('statusBar.aiToggle')}
        </button>
      </div>
    </div>
  );
}

function StatusItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: 0.85 }} {...props}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
//  RoboticsCadStage — viewport CAD 3D (centru) pentru modul Robotics AI dedicat
// ──────────────────────────────────────────────

function RoboticsCadStage() {
  const hasModel = useEngineeringCadStore((s) => Boolean(s.stlUrl));
  const hasPlan = useRoboticsSessionStore((s) => Boolean(s.plan && s.project));
  const loading = useRoboticsSessionStore((s) => s.loading);

  // Cu model STL → preview 3D. Altfel răspunsul Robotics (plan/BOM) în centru.
  if (hasModel) return <EngineeringCadPreview />;
  if (hasPlan || loading) return <RoboticsResponseStage />;
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#0D1117',
      minHeight: 0,
    }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <CadViewer stlUrl={null} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  WorkbenchRoot — layout principal
// ──────────────────────────────────────────────

export function WorkbenchRoot() {
  const { t } = useTranslation();
  useAiWorkCanvasController();
  useRestoreChatWorkspace();
  const [activeActivity, setActiveActivity] = React.useState<ActivityTab>('explorer');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [aiPanelOpen, setAiPanelOpen] = React.useState(true);
  const previewPanelOpen = usePreviewStore((s) => s.previewPanelOpen);
  const [engineeringOpen, setEngineeringOpen] = React.useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = React.useState(false);
  const [workspaceSearchVisible, setWorkspaceSearchVisible] = React.useState(false);
  const [paletteVisible, setPaletteVisible] = React.useState(false);
  const [shortcutsVisible, setShortcutsVisible] = React.useState(false);
  const [referencesVisible, setReferencesVisible] = React.useState(false);
  const [referenceHits, setReferenceHits] = React.useState<ReferenceHit[]>([]);
  const [referencesLoading, setReferencesLoading] = React.useState(false);
  const [referenceSymbol, setReferenceSymbol] = React.useState('');
  const [editorSqueezed, setEditorSqueezed] = useState(false);
  const prevWindowWidthRef = useRef(window.innerWidth);
  const navStackRef = useRef<string[]>([]);
  const navIndexRef = useRef(-1);
  const { saveTab, activeTabId, setProjectPath, setFileTree, openFile, projectPath, activeSymbol } = useEditorStore();
  const { runWorkspaceVerifyAndReport, runBuildAndReport, queueChatFromPanel } = useAIStore();
  const isAiStreaming = useAIStore((s) => s.isStreaming);
  const gitChangesCount = useGitStore((s) => s.files.length);

  const toggleAI = useCallback(() => setAiPanelOpen((v) => !v), []);
  const toggleEngineering = useCallback(() => {
    setEngineeringOpen((prev) => {
      const next = !prev;
      if (next) {
        setSidebarOpen(true);
        setActiveActivity('explorer');
      }
      return next;
    });
  }, []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const { pickAndOpenFolder } = useOpenWorkspace();

  const openFolderFromPalette = useCallback(async () => {
    await pickAndOpenFolder();
  }, [pickAndOpenFolder]);

  const runVerifyFromPalette = useCallback(async () => {
    setAiPanelOpen(true);
    await runWorkspaceVerifyAndReport();
  }, [runWorkspaceVerifyAndReport]);

  const runBuildFromPalette = useCallback(async () => {
    setAiPanelOpen(true);
    await runBuildAndReport();
  }, [runBuildAndReport]);

  const openFileWithNav = useCallback(async (path: string) => {
    const stack = navStackRef.current;
    const idx = navIndexRef.current;
    const nextStack = [...stack.slice(0, idx + 1), path];
    navStackRef.current = nextStack;
    navIndexRef.current = nextStack.length - 1;
    await openFile(path);
  }, [openFile]);

  const pushNavLocation = useCallback((path: string) => {
    const stack = navStackRef.current;
    const idx = navIndexRef.current;
    navStackRef.current = [...stack.slice(0, idx + 1), path];
    navIndexRef.current = navStackRef.current.length - 1;
  }, []);

  const navBack = useCallback(() => {
    if (navIndexRef.current <= 0) return;
    navIndexRef.current -= 1;
    const path = navStackRef.current[navIndexRef.current];
    if (path) void openFile(path);
  }, [openFile]);

  const navForward = useCallback(() => {
    if (navIndexRef.current >= navStackRef.current.length - 1) return;
    navIndexRef.current += 1;
    const path = navStackRef.current[navIndexRef.current];
    if (path) void openFile(path);
  }, [openFile]);

  const openReferences = useCallback(async () => {
    const tab = useEditorStore.getState().tabs.find((t) => t.id === useEditorStore.getState().activeTabId);
    const symbol = useEditorStore.getState().activeSymbol;
    if (!tab || !projectPath || !symbol) return;
    const rel = tab.path.replace(projectPath, '').replace(/^[/\\]+/, '');
    setReferenceSymbol(symbol);
    setReferencesVisible(true);
    setReferencesLoading(true);
    setReferenceHits([]);
    try {
      const res = await window.caval.search?.findReferences?.({ filePath: rel, symbol });
      if (res?.ok && res.references) {
        setReferenceHits(res.references);
      }
    } finally {
      setReferencesLoading(false);
    }
  }, [projectPath]);

  const openDefinition = useCallback(async () => {
    const tab = useEditorStore.getState().tabs.find((t) => t.id === useEditorStore.getState().activeTabId);
    const symbol = useEditorStore.getState().activeSymbol;
    if (!tab || !projectPath || !symbol) return;
    const rel = tab.path.replace(projectPath, '').replace(/^[/\\]+/, '');
    const res = await window.caval.search?.gotoDefinition?.({ filePath: rel, symbol });
    if (res?.ok && res.location?.filePath) {
      const full = `${projectPath}/${res.location.filePath}`.replace(/\\/g, '/');
      await openFileWithNav(full);
    }
  }, [projectPath, openFileWithNav]);

  const openComposer = useCallback(() => {
    setAiPanelOpen(true);
    useAIStore.getState().setAgentMode('code');
  }, []);

  const menuCommandCtx = useMemo<MenuCommandContext>(() => ({
    toggleAI,
    toggleSidebar,
    setActiveActivity: setActiveActivity,
    setSidebarOpen,
    openQuickOpen: () => {
      setWorkspaceSearchVisible(false);
      setQuickOpenVisible(true);
    },
    openWorkspaceSearch: () => {
      setQuickOpenVisible(false);
      setWorkspaceSearchVisible(true);
    },
    saveActiveTab: () => {
      const tabId = useEditorStore.getState().activeTabId;
      if (tabId) void saveTab(tabId);
    },
    openFolder: openFolderFromPalette,
    runWorkspaceVerify: runVerifyFromPalette,
    runBuild: runBuildFromPalette,
    openShortcuts: () => setShortcutsVisible(true),
    setPaletteVisible,
    openReferences,
    openDefinition,
    setAgentModeBuild: () => useAIStore.getState().setAgentMode('code'),
    openComposer,
    pushNavLocation,
    navBack,
    navForward,
  }), [
    toggleAI,
    toggleSidebar,
    saveTab,
    openFolderFromPalette,
    runVerifyFromPalette,
    runBuildFromPalette,
    openReferences,
    openDefinition,
    openComposer,
    pushNavLocation,
    navBack,
    navForward,
  ]);

  const workbenchCommands = useMemo(
    () =>
      buildWorkbenchCommands({
        toggleAI,
        toggleSidebar,
        setActiveActivity: setActiveActivity,
        setSidebarOpen,
        openQuickOpen: () => {
          setWorkspaceSearchVisible(false);
          setQuickOpenVisible(true);
        },
        openWorkspaceSearch: () => {
          setQuickOpenVisible(false);
          setWorkspaceSearchVisible(true);
        },
        saveActiveTab: () => {
          const tabId = useEditorStore.getState().activeTabId;
          if (tabId) void saveTab(tabId);
        },
        openFolder: openFolderFromPalette,
        runWorkspaceVerify: runVerifyFromPalette,
        runBuild: runBuildFromPalette,
        openShortcuts: () => setShortcutsVisible(true),
        queueChatFromPanel,
      }),
    [toggleAI, toggleSidebar, saveTab, openFolderFromPalette, runVerifyFromPalette, runBuildFromPalette, queueChatFromPanel]
  );

  useEffect(() => {
    const openCodingChat = () => {
      // Handoff „Generează software în Coding Chat": ieși din modul Robotics dedicat.
      setEngineeringOpen(false);
      setAiPanelOpen(true);
    };
    window.addEventListener(CAVAL_OPEN_CODING_CHAT_EVENT, openCodingChat);
    return () => window.removeEventListener(CAVAL_OPEN_CODING_CHAT_EVENT, openCodingChat);
  }, []);

  useEffect(() => {
    const openExplorer = () => {
      setSidebarOpen(true);
      setActiveActivity('explorer');
    };
    window.addEventListener(CAVAL_OPEN_EXPLORER_SIDEBAR_EVENT, openExplorer);
    return () => window.removeEventListener(CAVAL_OPEN_EXPLORER_SIDEBAR_EVENT, openExplorer);
  }, []);

  useEffect(() => {
    void hydrateApiKeysFromSecrets();
    void window.caval?.settingsLoad?.();
  }, []);

  useEffect(() => {
    const unsub = window.caval?.onRendererRecovered?.((payload) => {
      console.warn('[caval] Renderer recovered after', payload.reason);
      void (async () => {
        const root = useEditorStore.getState().projectPath;
        if (!root || !window.caval?.getRecentPipelineCompletion) return;
        const res = await window.caval.getRecentPipelineCompletion(root);
        const files = res.completion?.writtenFiles;
        if (!res.ok || !files?.length) return;
        showWorkbenchToast(
          tActive('toast.arenaCompleted', { count: files.length }),
          6000
        );
        const last = files[files.length - 1];
        if (last && root) {
          const sep = root.includes('\\') ? '\\' : '/';
          const abs = `${root}${sep}${last.replace(/\//g, sep)}`;
          void useEditorStore.getState().openFile(abs);
        }
      })();
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkRuntimeBuild = async () => {
      const status = await window.caval?.getDevRuntimeBuildStatus?.();
      if (disposed || !status) return;
      let lastSeenHash: string | null = null;
      try {
        lastSeenHash = window.localStorage.getItem(DEV_RUNTIME_BUILD_HASH_KEY);
      } catch {
        lastSeenHash = null;
      }
      if (!shouldNotifyRuntimeRestart(status, lastSeenHash)) return;
      showWorkbenchToast(DEV_RESTART_TOAST, 5000);
      try {
        window.localStorage.setItem(DEV_RUNTIME_BUILD_HASH_KEY, status.latestHash);
      } catch {
        /* ignore storage failures */
      }
    };

    void checkRuntimeBuild();
    const timer = window.setInterval(() => {
      void checkRuntimeBuild();
    }, 4000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      if (prevWindowWidthRef.current >= NARROW_WINDOW_THRESHOLD && w < NARROW_WINDOW_THRESHOLD && sidebarOpen) {
        setSidebarOpen(false);
      }
      prevWindowWidthRef.current = w;

      const reserved =
        ACTIVITY_BAR_WIDTH +
        sidebarWidthFor(activeActivity, sidebarOpen) +
        (engineeringOpen ? ENGINEERING_PANEL_WIDTH : 0) +
        (aiPanelOpen ? readAiPanelWidth() : 0);
      setEditorSqueezed(w - reserved < MIN_EDITOR_WIDTH);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [sidebarOpen, activeActivity, engineeringOpen, aiPanelOpen]);

  const openAccountSettings = useCallback(() => {
    useSettingsStore.getState().setActiveSection('ai');
    setActiveActivity('settings');
    setSidebarOpen(true);
  }, []);

  const handleActivityChange = useCallback((tab: ActivityTab) => {
    if (tab === activeActivity && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveActivity(tab);
      setSidebarOpen(true);
    }
  }, [activeActivity, sidebarOpen]);

  // Sync Electron menu Open Folder/File → editor store (P0-1)
  useEffect(() => {
    const caval = window.caval;
    if (!caval?.onFolderOpened) return;

    const offFolder = caval.onFolderOpened(async (folder) => {
      setProjectPath(folder.path);
      await window.caval.workspaceSync?.(folder.path);
      const tree = await window.caval.fs.readTree(folder.path);
      setFileTree(tree);
      void useGitStore.getState().refresh();
      useAIStore.getState().setIncludeMode('project');
      const editor = useEditorStore.getState();
      if (!shouldHydrateStartupDocument(editor.tabs, editor.activeTabId)) return;
      const startup = pickWorkspaceStartupFile(folder.files ?? []);
      if (startup?.path) {
        void openFile(startup.label?.trim() || startup.path);
      }
    });

    const offFile = caval.onFileOpened?.((file) => {
      void openFile(file.path);
    });

    return () => {
      offFolder();
      offFile?.();
    };
  }, [setProjectPath, setFileTree, openFile]);

  // Keep main-process sandbox root bound whenever renderer has a projectPath.
  useEffect(() => {
    const root = projectPath?.trim();
    if (!root) return;
    void window.caval?.workspaceSync?.(root);
  }, [projectPath]);

  // Keyboard shortcuts globale
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S → salvează fișierul activ
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (activeTabId) saveTab(activeTabId);
      }

      // Ctrl+B → Toggle primary sidebar
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }

      // Ctrl+Shift+E → Explorer
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setActiveActivity('explorer');
        setSidebarOpen(true);
      }

      // Ctrl+P → Quick Open (not Ctrl+Shift+P)
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setWorkspaceSearchVisible(false);
        setQuickOpenVisible(true);
      }

      // Ctrl+T → Search workspace symbols (index)
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setQuickOpenVisible(false);
        setWorkspaceSearchVisible(true);
      }

      // Ctrl+Shift+P → Command Palette
      if (ctrl && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteVisible(true);
      }

      // Ctrl+Shift+/ → Keyboard shortcuts help
      if (ctrl && e.shiftKey && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setShortcutsVisible(true);
      }

      // F12 → Go to Definition (word at cursor)
      if (e.key === 'F12' && !e.shiftKey) {
        e.preventDefault();
        void openDefinition();
      }

      // Shift+F12 → Find References
      if (e.key === 'F12' && e.shiftKey) {
        e.preventDefault();
        void openReferences();
      }

      // Ctrl+Shift+F → Search
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setActiveActivity('search');
        setSidebarOpen(true);
      }

      // Ctrl+Shift+G → Source Control
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setActiveActivity('git');
        setSidebarOpen(true);
      }

      // Ctrl+Shift+X → Extensions
      if (ctrl && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        setActiveActivity('extensions');
        setSidebarOpen(true);
      }

      // Ctrl+Shift+A → Toggle AI Panel
      if (ctrl && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleAI();
      }

      // Ctrl+, → Setări (toggle)
      if (ctrl && e.key === ',') {
        e.preventDefault();
        setActiveActivity((prev) => {
          const next = prev === 'settings' ? 'explorer' : 'settings';
          if (next === 'settings') setSidebarOpen(true);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, saveTab, toggleAI, toggleSidebar, openDefinition, openReferences]);

  useEffect(() => {
    const caval = window.caval;
    if (!caval?.onMenuCommand) return;
    return caval.onMenuCommand((command) => {
      handleMenuCommand(command, menuCommandCtx);
    });
  }, [menuCommandCtx]);

  return (
    <CavalThemeProvider defaultMode="dark">
      <PreviewStatusSync />
      {/* CSS global pentru markdown + code blocks din AIPanel */}
      <style>{`
        /* ── Markdown renderer stiluri ── */
        .caval-md { color: var(--caval-text); line-height: 1.6; }
        .caval-md p { margin: 0 0 8px; }
        .caval-md p:last-child { margin-bottom: 0; }
        .caval-md strong { color: var(--caval-text); font-weight: 600; }
        .caval-md em { color: var(--caval-text-muted); }

        .inline-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          background: rgba(0, 224, 255, 0.08);
          border: 1px solid rgba(0, 224, 255, 0.15);
          border-radius: 3px;
          padding: 1px 5px;
          color: #00E0FF;
        }

        .code-block {
          background: #080809;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 6px;
          margin: 8px 0;
          overflow: hidden;
        }

        .code-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 5px 10px;
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: rgba(255,255,255,0.4);
        }

        .code-block-copy {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 3px;
          transition: all 0.15s;
        }

        .code-block-copy:hover {
          background: rgba(255,255,255,0.06);
          color: #00E0FF;
        }

        .code-block pre {
          margin: 0;
          padding: 10px 12px;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12.5px;
          line-height: 1.55;
          color: #c9d1d9;
        }

        /* ── AI Panel scrollbar ── */
        .ai-messages-scroll::-webkit-scrollbar { width: 4px; }
        .ai-messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .ai-messages-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .ai-messages-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,224,255,0.3); }

        /* ── Animație streaming ── */
        @keyframes caval-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes zl-step-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
        .caval-stream-text {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          line-height: 1.42;
          letter-spacing: 0.055em;
          font-weight: 400;
          color: rgba(186, 230, 253, 0.58);
        }
        .caval-stream-cursor {
          display: inline-block;
          width: 1px;
          height: 0.85em;
          margin-left: 1px;
          vertical-align: -0.05em;
          background: rgba(0, 224, 255, 0.55);
          animation: cursor-blink 0.9s step-end infinite;
          flex-shrink: 0;
        }

        /* ── Diff block stiluri ── */
        .diff-remove { background: rgba(255, 70, 70, 0.08); color: #ff7070; }
        .diff-add { background: rgba(47, 191, 113, 0.08); color: #2FBF71; }
        .diff-line { font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 1px 8px; white-space: pre; }

        /* ── Animație spin pentru refresh ── */
        @keyframes caval-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ── Resize handle ── */
        .caval-resize-handle {
          position: absolute; top: 0; left: 0;
          width: 3px; height: 100%;
          cursor: col-resize;
          background: transparent;
          transition: background 0.15s;
          z-index: 10;
        }
        .caval-resize-handle:hover,
        .caval-resize-handle:active {
          background: rgba(0, 224, 255, 0.4);
        }

        /* ── Chat panel compact layout ── */
        .chat-panel-header {
          padding: 8px 12px;
          border-bottom: 1px solid var(--caval-border);
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-shrink: 0;
        }
        .chat-panel-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .chat-panel-title {
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--caval-text);
        }
        .chat-panel-brand { opacity: 0.92; }
        .chat-panel-title-sep { color: var(--caval-text-muted); font-weight: 400; }
        .chat-panel-context { color: var(--caval-text-muted); font-weight: 500; }
        .chat-panel-header-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .chat-panel-icon-btn {
          width: 28px; height: 28px; min-width: 28px; min-height: 28px;
          border: none; border-radius: 4px; background: transparent;
          color: var(--caval-text-muted); cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        .chat-panel-icon-btn:hover,
        .chat-panel-icon-btn:focus-visible {
          background: var(--caval-surface-raised);
          color: var(--caval-text);
          outline: 1px solid var(--caval-accent-ring);
          outline-offset: 1px;
        }
        .chat-panel-icon-btn-active {
          color: var(--caval-accent);
          background: rgba(255,255,255,0.04);
        }
        .chat-panel-new-chat-btn {
          padding: 4px 8px;
          font-size: 10px;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--caval-text-muted);
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: border-color 0.12s, color 0.12s, background 0.12s;
        }
        .chat-panel-new-chat-btn:hover,
        .chat-panel-new-chat-btn:focus-visible {
          border-color: var(--caval-border);
          color: var(--caval-text);
          background: var(--caval-surface-raised);
          outline: none;
        }

        .chat-messages-scroll { gap: 12px; }
        .chat-message {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 100%;
          align-self: stretch;
        }
        .chat-message-header {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex-wrap: wrap;
          font-size: 11px;
          line-height: 1.3;
        }
        .chat-message-avatar {
          width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;
        }
        .chat-message-avatar-user {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .chat-message-avatar-assistant {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          position: relative;
        }
        .chat-message-avatar-assistant::after {
          content: '';
          position: absolute;
          width: 6px; height: 6px; border-radius: 50%;
          top: 50%; left: 50%; transform: translate(-50%, -50%);
          background: var(--caval-success);
        }
        .chat-message-sender {
          font-weight: 600;
          color: var(--caval-text);
        }
        .chat-message-meta-sep,
        .chat-message-model {
          color: var(--caval-text-muted);
          font-weight: 500;
        }
        .chat-message-body {
          padding-left: 22px;
          font-size: 13px;
          line-height: 1.55;
          color: var(--caval-text);
          user-select: text;
          -webkit-user-select: text;
        }
        .chat-message-error {
          margin-top: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.18);
          font-size: 11.5px;
          color: var(--caval-error);
        }

        .ai-timeline-compact {
          margin: 4px 0 6px 22px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ai-timeline-toggle {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 0;
          border: none;
          background: transparent;
          color: var(--caval-text-muted);
          font-size: 11px;
          cursor: pointer;
          text-align: left;
        }
        .ai-timeline-toggle:hover,
        .ai-timeline-toggle:focus-visible {
          color: var(--caval-text);
          outline: none;
        }
        .ai-timeline-chevron { width: 10px; flex-shrink: 0; opacity: 0.75; }
        .ai-timeline-live {
          font-size: 10px;
          opacity: 0.7;
          text-transform: lowercase;
        }
        .ai-timeline-steps {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 2px 0 4px 12px;
          border-left: 1px solid rgba(255,255,255,0.06);
          margin-left: 4px;
        }
        .ai-timeline-compact .timeline-event {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 11px;
          line-height: 1.35;
          color: var(--caval-text-muted);
          cursor: default;
          outline: none;
        }
        .ai-timeline-compact .timeline-event[tabindex="0"] { cursor: pointer; }
        .ai-timeline-compact .timeline-event:focus-visible {
          color: var(--caval-text);
          outline: 1px solid var(--caval-accent-ring);
          outline-offset: 2px;
          border-radius: 2px;
        }
        .ai-timeline-time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          flex-shrink: 0;
          min-width: 52px;
          opacity: 0.75;
        }
        .ai-timeline-dot {
          width: 4px; height: 4px; border-radius: 50%;
          margin-top: 6px; flex-shrink: 0;
          background: currentColor;
        }
        .ai-timeline-label { min-width: 0; }
        .ai-timeline-detail {
          display: block;
          font-size: 10px;
          opacity: 0.85;
          margin-top: 1px;
        }

        .chat-review-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 0;
          font-size: 11px;
          color: var(--caval-text-muted);
        }
        .chat-review-badge-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--caval-warning, #F59E0B);
          flex-shrink: 0;
        }
        .chat-review-badge-hint {
          margin-left: auto;
          font-size: 10px;
          opacity: 0.75;
        }

        .message-feedback {
          margin-top: 6px;
        }
        .message-feedback-actions { display: flex; align-items: center; gap: 4px; }
        .message-feedback .feedback-btn {
          width: 28px; height: 28px; min-width: 28px; min-height: 28px;
          padding: 0;
          border-radius: 4px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--caval-text-muted);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0.4;
          transition: opacity 0.12s ease, border-color 0.12s ease, color 0.12s ease, background 0.12s ease;
        }
        .message-feedback .feedback-btn:hover,
        .message-feedback .feedback-btn:focus-visible,
        .message-feedback .feedback-btn[aria-pressed="true"],
        .message-feedback .feedback-btn.active {
          opacity: 1;
        }
        .message-feedback .feedback-btn:hover,
        .message-feedback .feedback-btn:focus-visible {
          border-color: var(--caval-border);
          color: var(--caval-text);
          background: var(--caval-surface-raised);
          outline: none;
        }
        .message-feedback .feedback-btn.active,
        .message-feedback .feedback-btn[aria-pressed="true"] {
          border-color: var(--caval-border);
          color: var(--caval-text);
          background: rgba(255,255,255,0.04);
        }
        .message-feedback .feedback-comment {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 4px;
        }
        .message-feedback .feedback-comment textarea {
          width: 100%;
          resize: vertical;
          font-size: 11px;
          padding: 6px;
          border-radius: 4px;
          border: 1px solid var(--caval-border);
          background: var(--caval-surface-raised);
          color: var(--caval-text);
          font-family: inherit;
        }
        .message-feedback .feedback-comment-actions { display: flex; gap: 6px; }
        .message-feedback-error { font-size: 10px; color: var(--caval-error); }

        .chat-composer-footer {
          padding: 8px 12px 12px;
          border-top: 1px solid var(--caval-border);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .chat-composer-notices { display: flex; flex-direction: column; gap: 4px; }
        .chat-composer-notice {
          font-size: 10px;
          line-height: 1.35;
          color: var(--caval-text-muted);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .chat-composer-notice button {
          border: none; background: none; color: inherit; cursor: pointer; padding: 0;
        }
        .chat-composer-notice-warning {
          color: #F59E0B;
          padding: 4px 6px;
          border-radius: 4px;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.15);
        }
        .chat-composer-card {
          background: var(--caval-surface);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          transition: border-color 0.15s, box-shadow 0.15s;
          min-width: 0;
        }
        .chat-composer-card:focus-within {
          border-color: rgba(45, 212, 191, 0.35);
          box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.12);
        }
        .chat-composer-input {
          width: 100%;
          border: none;
          background: transparent;
          padding: 8px 10px 4px;
          font-size: 13px;
          color: var(--caval-text);
          font-family: 'Inter', sans-serif;
          resize: none;
          line-height: 1.5;
          outline: none;
          overflow: auto;
          box-sizing: border-box;
        }
        .chat-composer-attachments {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 0 8px 4px;
        }
        .chat-composer-attachment-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          border: 1px solid var(--caval-border);
          background: var(--caval-surface-raised);
          color: var(--caval-text-muted);
          max-width: 100%;
        }
        .chat-composer-attachment-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-composer-attachment-chip button {
          border: none; background: none; cursor: pointer;
          color: var(--caval-text-muted); font-size: 11px; line-height: 1; padding: 0;
        }
        .chat-composer-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px 6px;
          min-width: 0;
        }
        .chat-composer-toolbar-left,
        .chat-composer-toolbar-right {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .chat-composer-toolbar-left { margin-right: auto; }
        .chat-composer-icon-btn {
          width: 32px; height: 32px; min-width: 32px; min-height: 32px;
          border: none; border-radius: 4px; background: transparent;
          color: var(--caval-text-muted); cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          transition: background 0.12s, color 0.12s;
        }
        .chat-composer-icon-btn:hover,
        .chat-composer-icon-btn:focus-visible {
          background: var(--caval-surface-raised);
          color: var(--caval-text);
          outline: 1px solid var(--caval-accent-ring);
          outline-offset: 1px;
        }
        .chat-composer-status {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          flex: 1 1 auto;
          justify-content: center;
          font-size: 10px;
          color: var(--caval-text-muted);
          overflow: hidden;
        }
        .chat-composer-status-item { white-space: nowrap; flex-shrink: 0; }
        .chat-composer-status-muted { opacity: 0.85; }
        .chat-composer-status-ready { color: var(--caval-success); }
        .chat-composer-status-dot {
          display: inline-block;
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          margin-right: 3px;
          vertical-align: middle;
        }
        .chat-composer-status-sep { opacity: 0.45; flex-shrink: 0; }
        .caval-model-select-trigger:hover:not(:disabled) {
          color: var(--caval-text);
        }
        .caval-model-select-trigger:focus-visible {
          color: var(--caval-text);
          outline: 2px solid var(--caval-accent);
          outline-offset: 2px;
        }
        .caval-model-menu-item:hover:not([aria-disabled="true"]),
        .caval-model-menu-item.caval-model-menu-item-selected:not([aria-disabled="true"]) {
          background: var(--caval-accent-glow);
        }
        .caval-model-menu-item:focus-visible,
        .caval-model-menu-item.caval-model-menu-item-active {
          outline: 2px solid var(--caval-accent);
          outline-offset: -2px;
        }
        .caval-model-menu-item[aria-disabled="true"] {
          opacity: 0.65;
          pointer-events: none;
          cursor: not-allowed;
        }
        .chat-composer-send {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          min-height: 32px;
          border-radius: 6px;
          border: none;
          background: rgba(45, 212, 191, 0.85);
          color: #0E0E0F;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.12s, opacity 0.12s;
        }
        .chat-composer-send:hover:not(:disabled) {
          background: rgba(45, 212, 191, 0.95);
        }
        .chat-composer-send:focus-visible {
          outline: 2px solid rgba(45, 212, 191, 0.45);
          outline-offset: 1px;
        }
        .chat-composer-send-disabled {
          background: var(--caval-surface-raised);
          color: var(--caval-text-muted);
          border: 1px solid var(--caval-border);
          cursor: default;
          opacity: 0.65;
        }
        .chat-composer-send-stop {
          background: rgba(239,68,68,0.12);
          color: var(--caval-error);
          border: 1px solid rgba(239,68,68,0.2);
        }
        .chat-composer-send-hint {
          font-size: 9px;
          font-weight: 500;
          padding: 1px 4px;
          border-radius: 3px;
          border: 1px solid rgba(14,14,15,0.15);
          background: rgba(14,14,15,0.08);
          font-family: inherit;
          line-height: 1.2;
        }

        .ai-message-details { margin-top: 6px; }
        .ai-message-details-toggle {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 0;
          border: none;
          background: none;
          color: var(--caval-text-muted);
          font-size: 11px;
          cursor: pointer;
        }
        .ai-message-details-toggle:hover,
        .ai-message-details-toggle:focus-visible {
          color: var(--caval-text);
          outline: none;
        }
        .ai-message-details-body {
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        @media (max-width: 360px) {
          .chat-composer-status-item.chat-composer-status-muted { display: none; }
          .chat-message-model { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        }
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}>
        <WorkbenchMenuBar />
        <WorkbenchHeader
          engineeringOpen={engineeringOpen}
          onToggleEngineering={toggleEngineering}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          onOpenAccount={openAccountSettings}
        />

        {/* File tabs — ascunse în modul Robotics AI dedicat */}
        {!engineeringOpen && <TabBar />}

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {engineeringOpen ? (
            /* ── Robotics AI: ActivityBar + sidebars + CAD centru + chat Robotics dreapta ── */
            <>
              <ActivityBar
                active={activeActivity}
                onChange={handleActivityChange}
                aiPanelOpen
                onToggleAI={() => undefined}
                gitChangesCount={gitChangesCount}
                engineeringOpen={engineeringOpen}
                onToggleEngineering={toggleEngineering}
                arenaStatus={isAiStreaming ? "active" : "open"}
              />

              {sidebarOpen && activeActivity === 'explorer' && (
                <FileTree onClose={closeSidebar} />
              )}

              {sidebarOpen && activeActivity === 'search' && (
                <SidebarShell width={280} onClose={closeSidebar}>
                  <SearchPanel />
                </SidebarShell>
              )}

              {sidebarOpen && activeActivity === 'git' && (
                <SidebarShell width={280} onClose={closeSidebar}>
                  <GitPanel />
                </SidebarShell>
              )}

              {sidebarOpen && activeActivity === 'extensions' && (
                <SidebarShell width={320} onClose={closeSidebar}>
                  <ExtensionsHub />
                </SidebarShell>
              )}

              {sidebarOpen && activeActivity === 'settings' && (
                <SidebarShell width={520} onClose={closeSidebar}>
                  <SettingsPanel onClose={() => setActiveActivity('explorer')} />
                </SidebarShell>
              )}

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
                <RoboticsCadStage />
              </div>
              <div style={{
                width: 'clamp(380px, 34%, 460px)',
                flexShrink: 0,
                borderLeft: '1px solid var(--caval-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--caval-bg)',
              }}>
                <EngineeringAIPanel />
              </div>
            </>
          ) : (
          <>
          {/* Activity bar */}
          <ActivityBar
            active={activeActivity}
            onChange={handleActivityChange}
            aiPanelOpen={aiPanelOpen}
            onToggleAI={toggleAI}
            gitChangesCount={gitChangesCount}
            engineeringOpen={engineeringOpen}
            onToggleEngineering={toggleEngineering}
            arenaStatus={isAiStreaming ? "active" : aiPanelOpen ? "open" : "idle"}
          />

          {/* Primary sidebar — Cursor order */}
          {sidebarOpen && activeActivity === 'explorer' && (
            <FileTree onClose={closeSidebar} />
          )}

          {sidebarOpen && activeActivity === 'search' && (
            <SidebarShell width={280} onClose={closeSidebar}>
              <SearchPanel />
            </SidebarShell>
          )}

          {sidebarOpen && activeActivity === 'git' && (
            <SidebarShell width={280} onClose={closeSidebar}>
              <GitPanel />
            </SidebarShell>
          )}

          {sidebarOpen && activeActivity === 'extensions' && (
            <SidebarShell width={320} onClose={closeSidebar}>
              <ExtensionsHub />
            </SidebarShell>
          )}

          {sidebarOpen && activeActivity === 'settings' && (
            <SidebarShell width={520} onClose={closeSidebar}>
              <SettingsPanel onClose={() => setActiveActivity('explorer')} />
            </SidebarShell>
          )}

          {/* Editor + Terminal (+ Preview content from activity bar) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
            {editorSqueezed && (
              <EditorSqueezeBanner
                onCollapseSidebar={() => setSidebarOpen(false)}
                onCloseAi={() => setAiPanelOpen(false)}
              />
            )}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Suspense
                  fallback={
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--caval-text-muted, #8a95a6)',
                        fontSize: 13,
                      }}
                    >
                      {t('loading.editor')}
                    </div>
                  }
                >
                  <MonacoEditor />
                </Suspense>
              </div>
              {previewPanelOpen && (
                <div
                  className="content-area preview-content-host"
                  data-testid="preview-content-host"
                  style={{
                    width: 'min(480px, 42%)',
                    flexShrink: 0,
                    minWidth: 280,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <PreviewContentPanel />
                </div>
              )}
            </div>
            <TerminalPanel />
          </div>

          <QuickOpen open={quickOpenVisible} onClose={() => setQuickOpenVisible(false)} />
          <WorkspaceSearch
            open={workspaceSearchVisible}
            onClose={() => setWorkspaceSearchVisible(false)}
          />
          <CommandPalette
            open={paletteVisible}
            commands={workbenchCommands}
            onClose={() => setPaletteVisible(false)}
          />
          <ShortcutsOverlay
            open={shortcutsVisible}
            onClose={() => setShortcutsVisible(false)}
          />
          <ReferencesOverlay
            open={referencesVisible}
            symbol={referenceSymbol || activeSymbol || ''}
            references={referenceHits}
            loading={referencesLoading}
            onClose={() => setReferencesVisible(false)}
            onOpenReference={(hit) => {
              if (!projectPath) return;
              const full = `${projectPath}/${hit.filePath}`.replace(/\\/g, '/');
              void openFile(full);
              setReferencesVisible(false);
            }}
          />
          <QuickFixDiffPreview />
          <RefactorDiffPreview />
          <ExplainSelectionPanel />

          {/* AI Panel — dreapta, 340px, ascundibil */}
          {aiPanelOpen && (
            <AIPanel onClose={() => setAiPanelOpen(false)} onOpenComposer={openComposer} />
          )}
          </>
          )}
        </div>

        {/* Status bar */}
        <StatusBar aiPanelOpen={aiPanelOpen} onToggleAI={toggleAI} />
      </div>
    </CavalThemeProvider>
  );
}
