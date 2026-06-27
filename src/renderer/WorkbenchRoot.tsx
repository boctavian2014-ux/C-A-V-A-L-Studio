import React, { useEffect, useCallback } from 'react';
import { CavalThemeProvider } from '../../themes/theme-provider';
import { FileTree } from './components/sidebar/FileTree';
import { TabBar } from './components/editor/TabBar';
import { MonacoEditor } from './components/editor/MonacoEditor';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { useEditorStore } from './store/editor-store';
import { AIPanel } from '../../ai/composer/AIPanel';
import { GitPanel } from './components/git/GitPanel';
import { useGitStore } from './store/git-store';
import { CAVAL_OPEN_CODING_CHAT_EVENT } from '../../ai/engineering/engineering-handoff';
import { EngineeringAIPanel } from './components/engineering/EngineeringAIPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { SearchPanel } from './components/search/SearchPanel';
import { MCPPanel } from './components/mcp/MCPPanel';
import { WorkbenchHeader } from './components/workbench/WorkbenchHeader';
import { SidebarCloseButton } from './components/workbench/SidebarCloseButton';
import {
  IconExplorer, IconSearch, IconGit, IconMarketplace,
  IconSparkle, IconSettings,
} from './components/brand/CavaloIcons';

// ──────────────────────────────────────────────
//  Activity Bar
// ──────────────────────────────────────────────

type ActivityTab = 'explorer' | 'search' | 'git' | 'extensions' | 'settings';

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
}: {
  active: ActivityTab;
  onChange: (tab: ActivityTab) => void;
  aiPanelOpen: boolean;
  onToggleAI: () => void;
  gitChangesCount: number;
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
          title="Cont"
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

  return (
    <div style={{
      height: 22,
      background: '#111214',
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 12,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      color: 'var(--caval-text-muted)', flexShrink: 0,
    }}>
      <StatusItem>
        <IconGit size={11} strokeWidth={1.8} />
        main
      </StatusItem>
      <StatusItem>✓ 0 erori &nbsp;⚠ 0</StatusItem>

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

function StatusItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: 0.85 }}>
      {children}
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
  const { saveTab, activeTabId, setProjectPath, setFileTree, openFile } = useEditorStore();
  const gitChangesCount = useGitStore((s) => s.files.length);

  const toggleAI = useCallback(() => setAiPanelOpen((v) => !v), []);
  const toggleEngineering = useCallback(() => setEngineeringOpen((v) => !v), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    const openCodingChat = () => setAiPanelOpen(true);
    window.addEventListener(CAVAL_OPEN_CODING_CHAT_EVENT, openCodingChat);
    return () => window.removeEventListener(CAVAL_OPEN_CODING_CHAT_EVENT, openCodingChat);
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
  }, [activeTabId, saveTab, toggleAI, toggleSidebar]);

  useEffect(() => {
    const caval = window.caval;
    if (!caval?.onMenuCommand) return;
    return caval.onMenuCommand((command) => {
      if (command === 'save') {
        const tabId = useEditorStore.getState().activeTabId;
        if (tabId) void saveTab(tabId);
      }
      if (command === 'save-as') {
        const { activeTabId: tabId, tabs } = useEditorStore.getState();
        const tab = tabs.find((t) => t.id === tabId);
        if (tab && caval.saveFile) {
          void caval.saveFile({ path: tab.path, content: tab.content, saveAs: true }).then((res) => {
            if (res.canceled || !res.path) return;
            useEditorStore.setState((s) => ({
              tabs: s.tabs.map((t) =>
                t.id === tab.id
                  ? { ...t, id: res.path!, path: res.path!, name: res.label ?? t.name, isDirty: false }
                  : t
              ),
              activeTabId: res.path!,
            }));
          });
        }
      }
      if (command === 'toggle-sidebar') toggleSidebar();
      if (command === 'view-explorer') {
        setActiveActivity('explorer');
        setSidebarOpen(true);
      }
      if (command === 'view-search' || command === 'find-in-files') {
        setActiveActivity('search');
        setSidebarOpen(true);
      }
      if (command === 'view-source-control') {
        setActiveActivity('git');
        setSidebarOpen(true);
      }
      if (command === 'view-extensions') {
        setActiveActivity('extensions');
        setSidebarOpen(true);
      }
      if (command === 'open-settings') {
        setActiveActivity('settings');
        setSidebarOpen(true);
      }
    });
  }, [toggleSidebar, saveTab]);

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

        {/* File tabs */}
        <TabBar />

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Activity bar */}
          <ActivityBar
            active={activeActivity}
            onChange={handleActivityChange}
            aiPanelOpen={aiPanelOpen}
            onToggleAI={toggleAI}
            gitChangesCount={gitChangesCount}
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
            <SidebarShell width={280} onClose={closeSidebar}>
              <MCPPanel />
            </SidebarShell>
          )}

          {engineeringOpen && (
            <SidebarShell width={360}>
              <EngineeringAIPanel />
            </SidebarShell>
          )}

          {sidebarOpen && activeActivity === 'settings' && (
            <SidebarShell width={520} onClose={closeSidebar}>
              <SettingsPanel onClose={() => setActiveActivity('explorer')} />
            </SidebarShell>
          )}

          {/* Editor + Terminal */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <MonacoEditor />
            <TerminalPanel />
          </div>

          {/* AI Panel — dreapta, 340px, ascundibil */}
          {aiPanelOpen && (
            <AIPanel onClose={() => setAiPanelOpen(false)} />
          )}
        </div>

        {/* Status bar */}
        <StatusBar aiPanelOpen={aiPanelOpen} onToggleAI={toggleAI} />
      </div>
    </CavalThemeProvider>
  );
}
