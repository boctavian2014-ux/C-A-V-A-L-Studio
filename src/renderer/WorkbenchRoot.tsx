import React, { useEffect, useCallback } from 'react';
import { CavalThemeProvider } from '../../themes/theme-provider';
import { FileTree } from './components/sidebar/FileTree';
import { TabBar } from './components/editor/TabBar';
import { MonacoEditor } from './components/editor/MonacoEditor';
import { TerminalPanel } from './components/terminal/TerminalPanel';
import { useEditorStore } from './store/editor-store';
import { AIPanel } from '../../ai/composer/AIPanel';
import { ComposerPanel } from '../../ai/composer/ComposerPanel';
import { useAIStore, formatWorkingModel } from '../../ai/composer/ai-store';
import { GitPanel } from './components/git/GitPanel';
import { MCPPanel } from './components/mcp/MCPPanel';
import { useGitStore } from './store/git-store';

// ──────────────────────────────────────────────
//  Activity Bar
// ──────────────────────────────────────────────

type ActivityTab = 'explorer' | 'search' | 'git' | 'extensions';

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
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
        </svg>
      ),
    },
    {
      id: 'search', title: 'Căutare (Ctrl+Shift+F)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M15 15l3 3" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'git', title: 'Git (Ctrl+Shift+G)',
      icon: (
        <div style={{ position: 'relative' }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <path d="M5 4.5v7M5 4.5C5 6.5 11 6.5 11 8" />
          </svg>
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
      id: 'extensions', title: 'Marketplace',
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 3a1 1 0 100 2h1a2 2 0 012 2v1a1 1 0 102 0V7a4 4 0 00-4-4h-1zM9 17a1 1 0 100-2H8a2 2 0 01-2-2v-1a1 1 0 10-2 0v1a4 4 0 004 4h1z" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{
      width: 40,
      background: 'var(--caval-surface)',
      borderRight: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '8px 0', gap: 2,
      flexShrink: 0,
    }}>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => onChange(item.id)}
          style={{
            width: 32, height: 32, borderRadius: 5,
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
          width: 32, height: 32, borderRadius: 5,
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
        {/* Iconiță AI — spark/bolt */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
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
          title="Setări"
          style={{
            width: 32, height: 32, borderRadius: 5, border: 'none',
            background: 'transparent', color: 'var(--caval-text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          title="Cont"
          style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: 'rgba(212,168,87,0.15)', color: '#D4A857',
            cursor: 'pointer', fontSize: 12, fontWeight: 700,
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

function StatusBar({ aiPanelOpen, onToggleAI }: { aiPanelOpen: boolean; onToggleAI: () => void }) {
  const { tabs, activeTabId } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const { selectedModel, activeResolvedModel, modelLabels, isStreaming } = useAIStore();
  const workingModel = formatWorkingModel(selectedModel, activeResolvedModel, modelLabels);

  return (
    <div style={{
      height: 22, background: 'var(--caval-accent)',
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 12,
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
      color: 'rgba(14,14,15,0.85)', flexShrink: 0,
    }}>
      <StatusItem>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="5" cy="3" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="11" cy="8" r="1.5" />
          <path d="M5 4.5v7M5 4.5C5 6.5 11 6.5 11 8" />
        </svg>
        main
      </StatusItem>
      <StatusItem>✓ 0 erori &nbsp;⚠ 0</StatusItem>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
        <StatusItem title={workingModel.secondary ? `via ${workingModel.secondary}` : undefined}>
          {isStreaming ? '⬤ ' : ''}AI: {workingModel.primary}
        </StatusItem>
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
            background: aiPanelOpen ? 'rgba(0,0,0,0.2)' : 'transparent',
            border: 'none', cursor: 'pointer',
            color: 'rgba(14,14,15,0.85)',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
            display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px',
            borderRadius: 3,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          {aiPanelOpen ? 'AI activ' : 'AI'}
        </button>
      </div>
    </div>
  );
}

function StatusItem({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default', opacity: 0.85 }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
//  WorkbenchRoot — layout principal
// ──────────────────────────────────────────────

export function WorkbenchRoot() {
  const [activeActivity, setActiveActivity] = React.useState<ActivityTab>('explorer');
  const [aiPanelOpen, setAiPanelOpen] = React.useState(true);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const { saveTab, activeTabId } = useEditorStore();
  const gitChangesCount = useGitStore((s) => s.files.length);

  const toggleAI = useCallback(() => setAiPanelOpen((v) => !v), []);

  // Keyboard shortcuts globale
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S → salvează fișierul activ
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (activeTabId) saveTab(activeTabId);
      }

      // Ctrl+Shift+E → Explorer
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setActiveActivity('explorer');
      }

      // Ctrl+Shift+G → Git
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        setActiveActivity('git');
      }

      // Ctrl+Shift+A → Toggle AI Panel
      if (ctrl && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleAI();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, saveTab, toggleAI]);

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
        {/* File tabs */}
        <TabBar />

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Activity bar */}
          <ActivityBar
            active={activeActivity}
            onChange={setActiveActivity}
            aiPanelOpen={aiPanelOpen}
            onToggleAI={toggleAI}
            gitChangesCount={gitChangesCount}
          />

          {/* Sidebar — Explorer sau Git Panel */}
          {activeActivity === 'explorer' && <FileTree />}
          {activeActivity === 'git' && (
            <div style={{
              width: 280, flexShrink: 0,
              background: 'var(--caval-bg)',
              borderRight: '1px solid var(--caval-border)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <GitPanel />
            </div>
          )}
          {activeActivity === 'extensions' && (
            <div style={{
              width: 280, flexShrink: 0,
              background: 'var(--caval-bg)',
              borderRight: '1px solid var(--caval-border)',
              overflow: 'auto',
            }}>
              <MCPPanel />
            </div>
          )}

          {/* Editor + Terminal */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            <MonacoEditor />
            <TerminalPanel />
          </div>

          {/* AI + Composer panels */}
          {composerOpen && (
            <ComposerPanel onClose={() => setComposerOpen(false)} />
          )}
          {aiPanelOpen && (
            <AIPanel onClose={() => setAiPanelOpen(false)} onOpenComposer={() => setComposerOpen(true)} />
          )}
        </div>

        {/* Status bar */}
        <StatusBar aiPanelOpen={aiPanelOpen} onToggleAI={toggleAI} />
      </div>
    </CavalThemeProvider>
  );
}
