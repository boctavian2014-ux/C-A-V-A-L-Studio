import React, { useEffect, useCallback, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { CavalThemeProvider } from '../../themes/theme-provider';
import { FileTree } from './components/sidebar/FileTree';
import { TabBar } from './components/editor/TabBar';
const MonacoEditor = lazy(() =>
  import('./components/editor/MonacoEditor').then((m) => ({ default: m.MonacoEditor }))
);
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { useEditorStore } from './store/editor-store';
import { useAIStore, hydrateApiKeysFromSecrets } from '../../ai/composer/ai-store';
import { AIPanel } from '../../ai/composer/AIPanel';
import { GitPanel } from './components/git/GitPanel';
import { useGitStore } from './store/git-store';
import { CAVAL_OPEN_CODING_CHAT_EVENT } from '../../ai/engineering/engineering-handoff';
import { EngineeringAIPanel } from './components/engineering/EngineeringAIPanel';
import { EngineeringCadPreview } from './components/engineering/EngineeringCadPreview';
import { CadViewer } from './components/engineering/CadViewer';
import { useEngineeringCadStore } from './store/engineering-cad-store';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { SearchPanel } from './components/search/SearchPanel';
import { ExtensionsHub } from './components/extensions/ExtensionsHub';
import { QuickOpen } from './components/navigation/QuickOpen';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsOverlay } from './components/navigation/ShortcutsOverlay';
import { ReferencesOverlay, type ReferenceHit } from './components/navigation/ReferencesOverlay';
import { buildWorkbenchCommands } from './commands/command-registry';
import { handleMenuCommand, type MenuCommandContext } from './commands/menu-command-router';
import { showWorkbenchToast } from './commands/workbench-toast';
import { useProblemsStore } from './store/problems-store';
import { WorkbenchHeader } from './components/workbench/WorkbenchHeader';
import { SidebarCloseButton } from './components/workbench/SidebarCloseButton';
import { useOpenWorkspace } from './hooks/useOpenWorkspace';
import { useSettingsStore } from './store/settings-store';
import {
  IconExplorer, IconSearch, IconGit, IconMarketplace,
  IconSparkle, IconSettings,
} from './components/brand/CavaloIcons';

type ActivityTab = 'explorer' | 'search' | 'git' | 'extensions' | 'settings';

// ──────────────────────────────────────────────
//  Layout squeeze helpers
// ──────────────────────────────────────────────

const ENGINEERING_PANEL_WIDTH = 360;
const AI_PANEL_DEFAULT_WIDTH = 340;
const NARROW_WINDOW_THRESHOLD = 1100;
const MIN_EDITOR_WIDTH = 300;

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
//  Activity Bar
// ──────────────────────────────────────────────

/** 3D PNG icons include a rounded black tile — render larger than line SVG icons. */
const ACTIVITY_BAR_WIDTH = 48;
const ACTIVITY_BTN = 36;
const ACTIVITY_ICON = 26;

function ActivityBar({
  active,
  onChange,
  aiPanelOpen,
  onToggleAI,
  gitChangesCount,
  onOpenAccount,
}: {
  active: ActivityTab;
  onChange: (tab: ActivityTab) => void;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  gitChangesCount: number;
  onOpenAccount: () => void;
}) {
  const ITEMS: { id: ActivityTab; title: string; icon: React.ReactNode }[] = [
    {
      id: 'explorer', title: 'Explorer (Ctrl+Shift+E)',
      icon: <IconExplorer size={ACTIVITY_ICON} />,
    },
    {
      id: 'search', title: 'Căutare (Ctrl+Shift+F)',
      icon: <IconSearch size={ACTIVITY_ICON} />,
    },
    {
      id: 'git', title: 'Source Control (Ctrl+Shift+G)',
      icon: (
        <div style={{ position: 'relative' }}>
          <IconGit size={ACTIVITY_ICON} />
          {/* Badge număr fișiere modificate */}
          {gitChangesCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -5,
              background: '#E2C08D', color: '#0E0E0F',
              fontSize: 8, fontWeight: 700, lineHeight: 1,
              padding: '1px 3px', borderRadius: 99,
              minWidth: 12, textAlign: 'center',
            }}>
              {gitChangesCount > 99 ? '99+' : gitChangesCount}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'extensions', title: 'Extensions (Ctrl+Shift+X)',
      icon: <IconMarketplace size={ACTIVITY_ICON} />,
    },
  ];

  // Butonul Settings e separat (jos), tracked separat
  const isSettingsActive = active === 'settings';

  return (
    <div style={{
      width: ACTIVITY_BAR_WIDTH,
      background: 'var(--caval-surface)',
      borderRight: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '10px 0', gap: 4,
      flexShrink: 0,
    }}>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => onChange(item.id)}
          style={{
            width: ACTIVITY_BTN, height: ACTIVITY_BTN, borderRadius: 8,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: active === item.id ? 'var(--caval-accent-glow)' : 'transparent',
            color: active === item.id ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            transition: 'all 0.15s',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (active !== item.id) {
              e.currentTarget.style.background = 'var(--caval-surface-raised)';
              e.currentTarget.style.color = 'var(--caval-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (active !== item.id) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--caval-text-muted)';
            }
          }}
        >
          {item.icon}
          {/* Indicator stânga pentru tab activ */}
          {active === item.id && (
            <span style={{
              position: 'absolute', left: 0, top: 6, bottom: 6,
              width: 2, borderRadius: '0 2px 2px 0',
              background: 'var(--caval-accent)',
            }} />
          )}
        </button>
      ))}

      {/* Separator */}
      <div style={{ width: 20, height: 1, background: 'var(--caval-border)', margin: '4px 0' }} />

      {/* Buton AI Panel — special, cu glow cyan când activ */}
      <button
        title="AI Panel Caval (Ctrl+Shift+A)"
        onClick={onToggleAI}
        style={{
          width: ACTIVITY_BTN, height: ACTIVITY_BTN, borderRadius: 8,
          border: aiPanelOpen ? '1px solid var(--caval-accent)' : 'none',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: aiPanelOpen
            ? 'var(--caval-accent-glow)'
            : 'transparent',
          color: aiPanelOpen ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
          transition: 'all 0.15s',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!aiPanelOpen) {
            e.currentTarget.style.background = 'var(--caval-surface-raised)';
            e.currentTarget.style.color = 'var(--caval-text)';
          }
        }}
        onMouseLeave={(e) => {
          if (!aiPanelOpen) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--caval-text-muted)';
          }
        }}
      >
        <IconSparkle size={ACTIVITY_ICON} />
        {/* Punct indicator glow când AI e activ */}
        {aiPanelOpen && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 5, height: 5, borderRadius: '50%',
            background: 'var(--caval-accent)',
            boxShadow: '0 0 4px var(--caval-accent)',
          }} />
        )}
      </button>

      {/* Bottom icons */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          title="Setări Caval (Ctrl+,)"
          onClick={() => onChange('settings')}
          style={{
            width: ACTIVITY_BTN, height: ACTIVITY_BTN, borderRadius: 8,
            border: isSettingsActive ? '1px solid var(--caval-accent)' : 'none',
            background: isSettingsActive ? 'var(--caval-accent-glow)' : 'transparent',
            color: isSettingsActive ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (!isSettingsActive) {
              e.currentTarget.style.background = 'var(--caval-surface-raised)';
              e.currentTarget.style.color = 'var(--caval-text)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSettingsActive) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--caval-text-muted)';
            }
          }}
        >
          <IconSettings size={ACTIVITY_ICON} />
          {/* Indicator activ stânga */}
          {isSettingsActive && (
            <span style={{
              position: 'absolute', left: 0, top: 6, bottom: 6,
              width: 2, borderRadius: '0 2px 2px 0',
              background: 'var(--caval-accent)',
            }} />
          )}
        </button>
        <button
          title="Cont & credite"
          onClick={onOpenAccount}
          style={{
            width: ACTIVITY_BTN, height: ACTIVITY_BTN, borderRadius: '50%', border: 'none',
            background: 'rgba(212,168,87,0.15)', color: '#D4A857',
            cursor: 'pointer', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          OB
        </button>
      </div>
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
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const { isRepo, branch } = useGitStore();
  const errorCount = useProblemsStore((s) => s.errorCount());
  const warningCount = useProblemsStore((s) => s.warningCount());

  return (
    <div style={{
      height: 22,
      background: 'var(--caval-surface)',
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 12,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      color: 'var(--caval-text-muted)', flexShrink: 0,
    }}>
      <StatusItem>
        <IconGit size={11} strokeWidth={1.8} />
        {isRepo ? branch || '—' : 'fără git'}
      </StatusItem>
      <StatusItem
        onClick={() => document.dispatchEvent(new CustomEvent('caval:terminal-panel-tab', { detail: { tab: 'problems' } }))}
        style={{ cursor: 'pointer' }}
      >
        {errorCount === 0 ? '✓' : '✕'} {errorCount} erori &nbsp;⚠ {warningCount}
      </StatusItem>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
        {activeTab && (
          <>
            <StatusItem>{activeTab.language}</StatusItem>
            <StatusItem>UTF-8</StatusItem>
          </>
        )}
        {/* Buton AI în status bar — toggle rapid */}
        <button
          onClick={onToggleAI}
          title="Toggle AI Panel (Ctrl+Shift+A)"
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
          {aiPanelOpen ? 'AI activ' : 'AI'}
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
  // Cu model → preview complet (titlu + download + viewer). Fără model → placeholder-ul viewer-ului.
  if (hasModel) return <EngineeringCadPreview />;
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
  const [activeActivity, setActiveActivity] = React.useState<ActivityTab>('explorer');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [aiPanelOpen, setAiPanelOpen] = React.useState(true);
  const [engineeringOpen, setEngineeringOpen] = React.useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = React.useState(false);
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
  const { saveTab, activeTabId, setProjectPath, setFileTree, openFile, tabs, projectPath, activeSymbol } = useEditorStore();
  const { runWorkspaceVerifyAndReport, runBuildAndReport, queueChatFromPanel } = useAIStore();
  const gitChangesCount = useGitStore((s) => s.files.length);

  const toggleAI = useCallback(() => setAiPanelOpen((v) => !v), []);
  const toggleEngineering = useCallback(() => setEngineeringOpen((v) => !v), []);
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
    openQuickOpen: () => setQuickOpenVisible(true),
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
        openQuickOpen: () => setQuickOpenVisible(true),
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
          `Ultimul run Arena s-a terminat — ${files.length} fișier(e) scrise pe disc.`,
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

    const offFolder = caval.onFolderOpened((folder) => {
      setProjectPath(folder.path);
      void window.caval.fs.readTree(folder.path).then((tree) => setFileTree(tree));
      void useGitStore.getState().refresh();
      useAIStore.getState().setIncludeMode('project');
      const first = folder.files?.[0];
      if (first?.path) void openFile(first.path);
    });

    const offFile = caval.onFileOpened?.((file) => {
      void openFile(file.path);
    });

    return () => {
      offFolder();
      offFile?.();
    };
  }, [setProjectPath, setFileTree, openFile]);

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
        setQuickOpenVisible(true);
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
          font-family: inherit;
        }
        .caval-stream-cursor {
          display: inline-block;
          width: 2px;
          height: 0.9em;
          margin-left: 1px;
          vertical-align: -0.05em;
          background: var(--caval-accent);
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
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}>
        <WorkbenchHeader
          engineeringOpen={engineeringOpen}
          onToggleEngineering={toggleEngineering}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
        />

        {/* File tabs — ascunse în modul Robotics AI dedicat */}
        {!engineeringOpen && <TabBar />}

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {engineeringOpen ? (
            /* ── Robotics AI — workspace dedicat: viewport CAD 3D (centru) + chat Robotics (dreapta).
               Coding Arena / pipeline / editor / sidebar-uri NU se montează. ── */
            <>
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
            onOpenAccount={openAccountSettings}
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

          {/* Editor + Terminal */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
            {editorSqueezed && (
              <EditorSqueezeBanner
                onCollapseSidebar={() => setSidebarOpen(false)}
                onCloseAi={() => setAiPanelOpen(false)}
              />
            )}
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
                  Loading editor…
                </div>
              }
            >
              <MonacoEditor />
            </Suspense>
            <TerminalPanel />
          </div>

          <QuickOpen open={quickOpenVisible} onClose={() => setQuickOpenVisible(false)} />
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
