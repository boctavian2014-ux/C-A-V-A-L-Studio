import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DebugPanel } from '../debug/DebugPanel';
import { ProblemsPanel } from '../problems/ProblemsPanel';
import { TasksPanel } from '../tasks/TasksPanel';
import { debounce } from '../../lib/debounce';
import { MAX_TERMINAL_OUTPUT_LINES, TERMINAL_SCROLL_DEBOUNCE_MS, takeLast } from '../../lib/panel-limits';
import { useOutputStore, formatOutputForChat } from '../../store/output-store';
import {
  formatProblemForChat,
  formatProblemsForChat,
  problemToEntry,
  useProblemsStore,
} from '../../store/problems-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import type { TerminalPanelTab } from '../../terminal/terminal-events';
import { dispatchTerminalNew } from '../../terminal/terminal-events';
import type { TerminalInfo, TerminalOutputLine } from '../../../shared/terminal-contract';
import {
  detectRecentTerminalError,
  TERMINAL_AI_PALETTE,
  type TerminalAiCommand,
} from '../../../shared/ai-terminal-contract';
import { TerminalInput } from './TerminalInput';
import { TerminalExplainPopover } from './TerminalExplainPopover';
import { SuggestedCommandsCard } from './SuggestedCommandsCard';
import { TerminalAiMenu } from './TerminalAiMenu';
import { buildScrollbackContext } from '../../ai/terminal-explain-client';
import { dispatchTerminalAiCommand } from '../../ai/terminal-ai-dispatch';
import { showWorkbenchToast } from '../../commands/workbench-toast';

const TERMINAL_HEIGHT_KEY = 'caval-terminal-height';

interface TerminalTab {
  id: string;
  title: string;
  info: TerminalInfo;
}

export function TerminalSessions() {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [output, setOutput] = useState<Map<string, TerminalOutputLine[]>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string } | null>(
    null
  );
  const [hasSelection, setHasSelection] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = window.caval?.terminal;
    if (!api?.list) return;
    void api.list().then((terminals) => {
      const loadedTabs = terminals.map((info) => ({
        id: info.id,
        title: info.title || info.shell,
        info,
      }));
      setTabs(loadedTabs);
      setActiveTabId((current) => current ?? loadedTabs[0]?.id ?? null);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = window.caval?.terminal?.onOutput?.((line) => {
      setOutput((prev) => {
        const next = new Map(prev);
        const lines = next.get(line.terminalId) ?? [];
        next.set(line.terminalId, takeLast([...lines, line], MAX_TERMINAL_OUTPUT_LINES));
        return next;
      });
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const unsubscribe = window.caval?.terminal?.onExit?.((info) => {
      setTabs((prev) => prev.map((tab) => (tab.id === info.id ? { ...tab, info } : tab)));
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    const scrollToEnd = debounce(() => {
      outputEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, TERMINAL_SCROLL_DEBOUNCE_MS);
    scrollToEnd();
    return () => scrollToEnd.cancel();
  }, [output, activeTabId]);

  const handleCreateTab = useCallback(async () => {
    const api = window.caval?.terminal;
    if (!api?.create) return;
    const info = await api.create({
      title: `Terminal ${tabs.length + 1}`,
    });
    const newTab: TerminalTab = {
      id: info.id,
      title: info.title || info.shell,
      info,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(info.id);
  }, [tabs.length]);

  useEffect(() => {
    const onNew = () => {
      void handleCreateTab();
    };
    document.addEventListener('caval:terminal-new', onNew);
    document.addEventListener('caval:terminal-split', onNew);
    return () => {
      document.removeEventListener('caval:terminal-new', onNew);
      document.removeEventListener('caval:terminal-split', onNew);
    };
  }, [handleCreateTab]);

  const handleCloseTab = useCallback(async (id: string) => {
    await window.caval?.terminal?.destroy?.(id);
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      setActiveTabId((current) => (current === id ? next[0]?.id ?? null : current));
      return next;
    });
  }, []);

  const handleInput = useCallback(
    async (data: string) => {
      if (!activeTabId) return;
      await window.caval?.terminal?.write?.(activeTabId, data);
    },
    [activeTabId]
  );

  const getSelectionInOutput = useCallback((): string => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return '';
    const root = outputRef.current;
    if (!root) return '';
    const anchor = sel.anchorNode;
    const focus = sel.focusNode;
    if (!anchor || !focus) return '';
    if (!root.contains(anchor) || !root.contains(focus)) return '';
    return sel.toString();
  }, []);

  useEffect(() => {
    const syncSelection = () => setHasSelection(Boolean(getSelectionInOutput().trim()));
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [getSelectionInOutput]);

  const recentOutputText = useMemo(() => {
    if (!activeTabId) return '';
    return (output.get(activeTabId) ?? [])
      .slice(-40)
      .map((l) => l.data)
      .join('\n');
  }, [activeTabId, output]);

  const hasRecentError = useMemo(
    () => detectRecentTerminalError(recentOutputText),
    [recentOutputText]
  );

  const runExplainSelection = useCallback(
    (selectedText: string) => {
      if (!activeTabId) {
        showWorkbenchToast('Niciun terminal activ');
        return;
      }
      const text = selectedText.trim();
      if (!text) {
        showWorkbenchToast('Selectează output în terminal');
        return;
      }
      const lines = (output.get(activeTabId) ?? []).map((l) => l.data);
      const scrollbackContext = buildScrollbackContext(lines.slice(-40));
      dispatchTerminalAiCommand('explain', {
        terminalId: activeTabId,
        selectedText: text,
        scrollbackContext,
      });
      setContextMenu(null);
    },
    [activeTabId, output]
  );

  const runSuggestFix = useCallback(
    (errorText?: string) => {
      if (!activeTabId) {
        showWorkbenchToast('Niciun terminal activ');
        return;
      }
      const selected = getSelectionInOutput().trim();
      const lines = (output.get(activeTabId) ?? []).map((l) => l.data);
      const errorOutput = (errorText ?? (selected || lines.slice(-30).join('\n'))).trim();
      if (!errorOutput) {
        showWorkbenchToast('Nu există output pentru Suggest fix');
        return;
      }
      dispatchTerminalAiCommand('suggest-fix', {
        terminalId: activeTabId,
        errorOutput,
        selectedText: selected,
      });
      setContextMenu(null);
    },
    [activeTabId, getSelectionInOutput, output]
  );

  const onPaletteCommand = useCallback(
    (command: TerminalAiCommand) => {
      if (command === 'explain') {
        runExplainSelection(getSelectionInOutput() || contextMenu?.text || '');
        return;
      }
      runSuggestFix(contextMenu?.text);
    },
    [contextMenu?.text, getSelectionInOutput, runExplainSelection, runSuggestFix]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!(ctrl && e.shiftKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'e' && key !== 'f') return;

      const root = panelRef.current;
      if (!root) return;
      const active = document.activeElement;
      const focusedInTerminal = Boolean(active && root.contains(active));
      const selection = getSelectionInOutput();

      if (key === 'e') {
        if (!focusedInTerminal && !selection) return;
        if (!selection) return;
        e.preventDefault();
        e.stopPropagation();
        runExplainSelection(selection);
        return;
      }

      // Ctrl+Shift+F — Suggest when terminal focused + recent error; else leave Search alone.
      if (!focusedInTerminal) return;
      if (!hasRecentError && !selection.trim()) return;
      e.preventDefault();
      e.stopPropagation();
      runSuggestFix(selection.trim() || undefined);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [getSelectionInOutput, hasRecentError, runExplainSelection, runSuggestFix]);

  useEffect(() => {
    const onPalette = (event: Event) => {
      const action = (event as CustomEvent<{ action?: TerminalAiCommand }>).detail?.action;
      if (!action) return;
      onPaletteCommand(action);
    };
    document.addEventListener('caval:terminal-ai-palette', onPalette);
    return () => document.removeEventListener('caval:terminal-ai-palette', onPalette);
  }, [onPaletteCommand]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const activeOutput = activeTabId ? output.get(activeTabId) ?? [] : [];
  const filteredOutput = searchQuery
    ? activeOutput.filter((line) => line.data.toLowerCase().includes(searchQuery.toLowerCase()))
    : activeOutput;
  const aiAvailable = hasSelection || hasRecentError;
  const explainShortcut = TERMINAL_AI_PALETTE.find((e) => e.id === 'explain')?.shortcut;
  const suggestShortcut = TERMINAL_AI_PALETTE.find((e) => e.id === 'suggest-fix')?.shortcut;

  return (
    <div
      ref={panelRef}
      className="terminal-panel"
      role="region"
      aria-label="Terminal"
      data-testid="terminal-sessions"
      style={{ position: 'relative' }}
    >
      <div className="terminal-tabs" role="tablist" aria-label="Terminal sessions">
        {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              className={`terminal-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveTabId(tab.id);
                }
              }}
              aria-label={`Switch to ${tab.title}`}
              aria-selected={tab.id === activeTabId}
              data-testid={`terminal-tab-${tab.id}`}
            >
            <span className="terminal-tab-title">{tab.title}</span>
            <span
              className={`terminal-tab-status status-${tab.info.status}`}
              aria-label={`Status: ${tab.info.status}`}
            />
            <button
              type="button"
              className="terminal-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                void handleCloseTab(tab.id);
              }}
              aria-label={`Close ${tab.title}`}
            >
              ×
            </button>
            </div>
        ))}
        <button
          type="button"
          className="terminal-tab-add"
          onClick={() => void handleCreateTab()}
          aria-label="New terminal"
          data-testid="terminal-tab-add"
        >
          +
        </button>
      </div>

      <div className="terminal-toolbar">
        <input
          type="search"
          placeholder="Search output…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="terminal-search"
          aria-label="Search terminal output"
          data-testid="terminal-search"
        />
        <button
          type="button"
          data-testid="terminal-explain-btn"
          disabled={!hasSelection}
          onClick={() => runExplainSelection(getSelectionInOutput())}
          style={{
            marginLeft: 8,
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--caval-border)',
            background: 'transparent',
            color: 'var(--caval-text-muted)',
            cursor: hasSelection ? 'pointer' : 'not-allowed',
            opacity: hasSelection ? 1 : 0.45,
          }}
          title={`${TERMINAL_AI_PALETTE[0]?.label ?? 'Explain'} (${explainShortcut ?? 'Ctrl+Shift+E'})`}
        >
          Explain
        </button>
        <button
          type="button"
          data-testid="terminal-suggest-btn"
          disabled={!hasRecentError && !hasSelection}
          onClick={() => runSuggestFix()}
          style={{
            marginLeft: 6,
            fontSize: 11,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--caval-border)',
            background: 'transparent',
            color: 'var(--caval-text-muted)',
            cursor: hasRecentError || hasSelection ? 'pointer' : 'not-allowed',
            opacity: hasRecentError || hasSelection ? 1 : 0.45,
          }}
          title={`${TERMINAL_AI_PALETTE[1]?.label ?? 'Suggest fix'} (${suggestShortcut ?? 'Ctrl+Shift+F'})`}
        >
          Suggest fix
        </button>
      </div>

      <div
        ref={outputRef}
        className="terminal-output"
        role="log"
        aria-live="polite"
        data-testid="terminal-output"
        style={{ userSelect: 'text', cursor: 'text' }}
        onContextMenu={(event) => {
          const text = getSelectionInOutput();
          if (!text.trim() && !hasRecentError) return;
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            text: text.trim() || recentOutputText.slice(-2000),
          });
        }}
      >
        {filteredOutput.map((line, index) => (
          <div key={`${line.timestamp}-${index}`} className="terminal-line">
            {line.data}
          </div>
        ))}
        <div ref={outputEndRef} />
      </div>

      {contextMenu && (
        <TerminalAiMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          hasSelection={Boolean(getSelectionInOutput().trim())}
          hasRecentError={hasRecentError || detectRecentTerminalError(contextMenu.text)}
          onSelect={onPaletteCommand}
          onClose={() => setContextMenu(null)}
        />
      )}

      <SuggestedCommandsCard />
      <TerminalExplainPopover />

      {activeTab && (
        <TerminalInput
          key={activeTab.id}
          terminalId={activeTab.id}
          onInput={handleInput}
          disabled={activeTab.info.status !== 'active'}
          aiAvailable={aiAvailable}
        />
      )}

      {tabs.length === 0 && (
        <div className="terminal-empty" data-testid="terminal-empty">
          <p>No terminals open.</p>
          <button type="button" className="btn-primary" onClick={() => void handleCreateTab()}>
            Open Terminal
          </button>
        </div>
      )}
    </div>
  );
}

function readStoredTerminalHeight(): number {
  try {
    const raw = localStorage.getItem(TERMINAL_HEIGHT_KEY);
    const n = raw ? Number(raw) : 180;
    if (!Number.isFinite(n)) return 180;
    return Math.max(120, Math.min(480, n));
  } catch {
    return 180;
  }
}

export function TerminalPanel() {
  const [activeTab, setActiveTab] = useState<TerminalPanelTab>('terminal');
  const [height, setHeight] = useState(readStoredTerminalHeight);
  const [isVisible, setIsVisible] = useState(true);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const outputChannels = useOutputStore((s) => s.channels);
  const activeOutputChannel = useOutputStore((s) => s.activeChannel);
  const problems = useProblemsStore((s) => s.problems);
  const queueChatFromPanel = useAIStore((s) => s.queueChatFromPanel);

  const sendAllProblemsToChat = useCallback(() => {
    const text = formatProblemsForChat(problems);
    if (!text) return;
    queueChatFromPanel(text);
  }, [problems, queueChatFromPanel]);

  const sendProblemToChat = useCallback((problem: typeof problems[number]) => {
    queueChatFromPanel(formatProblemForChat(problem));
  }, [queueChatFromPanel]);

  const sendOutputToChat = useCallback(() => {
    const channel = useOutputStore.getState().channels.find(
      (c) => c.name === useOutputStore.getState().activeChannel
    );
    const lines = channel?.lines ?? [];
    const text = formatOutputForChat(lines, channel?.name ?? 'CAVAL');
    if (!text) return;
    queueChatFromPanel(text);
  }, [queueChatFromPanel]);

  const openTerminalTab = useCallback(() => {
    setIsVisible(true);
    setActiveTab('terminal');
    dispatchTerminalNew();
  }, []);

  useEffect(() => {
    const showPanel = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: TerminalPanelTab }>).detail;
      setIsVisible(true);
      if (detail?.tab) setActiveTab(detail.tab);
    };
    const onRunInTerminal = () => {
      setIsVisible(true);
      setActiveTab('terminal');
    };
    const onToggle = () => setIsVisible((v) => !v);

    document.addEventListener('caval:terminal-panel-tab', showPanel);
    document.addEventListener('caval:run-in-terminal', onRunInTerminal);
    document.addEventListener('caval:terminal-toggle', onToggle);
    return () => {
      document.removeEventListener('caval:terminal-panel-tab', showPanel);
      document.removeEventListener('caval:run-in-terminal', onRunInTerminal);
      document.removeEventListener('caval:terminal-toggle', onToggle);
    };
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.max(80, Math.min(500, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height]);

  useEffect(() => {
    try {
      localStorage.setItem(TERMINAL_HEIGHT_KEY, String(height));
    } catch {
      /* ignore */
    }
  }, [height]);

  const TABS: { id: TerminalPanelTab; label: string }[] = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'output', label: 'OUTPUT' },
    { id: 'problems', label: 'PROBLEME' },
    { id: 'tasks', label: 'TASKS' },
    { id: 'debug', label: 'DEBUG' },
  ];

  const activeChannel = outputChannels.find((c) => c.name === activeOutputChannel) ?? outputChannels[0];

  if (!isVisible) {
    return (
      <div style={{
        height: 28, background: '#09090A',
        borderTop: '1px solid var(--caval-border)',
        display: 'flex', alignItems: 'center', padding: '0 8px',
        gap: 8,
      }}>
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => { setActiveTab(t.id); setIsVisible(true); }}
            style={{
              fontSize: 10.5, color: 'var(--caval-text-muted)',
              cursor: 'pointer', padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      height, background: '#09090A',
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div
        onMouseDown={startResize}
        style={{
          height: 4, cursor: 'row-resize', flexShrink: 0,
          background: 'transparent',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,224,255,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      />

      <div style={{
        display: 'flex', alignItems: 'center', height: 30,
        borderBottom: '1px solid var(--caval-border)',
        padding: '0 4px', flexShrink: 0,
      }}>
        {TABS.map((t) => (
          <span
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0 12px', height: '100%',
              display: 'flex', alignItems: 'center',
              fontSize: 10.5, cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              color: activeTab === t.id ? 'var(--caval-text)' : 'var(--caval-text-muted)',
              borderBottom: activeTab === t.id ? '1.5px solid var(--caval-accent)' : '1.5px solid transparent',
              transition: 'all 0.12s',
            }}
          >
            {t.label}
            {t.id === 'problems' && problems.length > 0 && (
              <span style={{ marginLeft: 6, color: 'var(--caval-danger)', fontSize: 10 }}>
                {problems.length}
              </span>
            )}
          </span>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: '0 8px', alignItems: 'center' }}>
          {activeTab === 'problems' && problems.length > 0 && (
            <ChatActionBtn title="Trimite toate erorile în chat" onClick={sendAllProblemsToChat}>
              → Chat
            </ChatActionBtn>
          )}
          {activeTab === 'output' && (activeChannel?.lines.length ?? 0) > 0 && (
            <ChatActionBtn title="Trimite output-ul în chat" onClick={sendOutputToChat}>
              → Chat
            </ChatActionBtn>
          )}
          <PanelBtn title="Terminal nou" onClick={openTerminalTab}>+</PanelBtn>
          <PanelBtn title="Minimizează" onClick={() => setIsVisible(false)}>⌄</PanelBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div
          style={{
            display: activeTab === 'terminal' ? 'flex' : 'none',
            height: '100%',
            flexDirection: 'column',
          }}
        >
          <TerminalSessions />
        </div>

        {activeTab === 'output' && (
          <div style={{
            padding: '8px 14px', height: '100%', overflow: 'auto',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
            color: 'var(--caval-text-muted)', lineHeight: 1.7,
          }}>
            <div style={{ marginBottom: 8, fontSize: 10, color: 'var(--caval-accent)' }}>
              Channel: {activeChannel?.name ?? 'CAVAL'}
            </div>
            {(activeChannel?.lines ?? []).length === 0 ? (
              <span>Output gol — rulează build sau verify pentru a vedea loguri.</span>
            ) : (
              activeChannel?.lines.map((line, i) => (
                <div key={`${i}-${line.slice(0, 24)}`} className="output-line">{line || '\u00a0'}</div>
              ))
            )}
          </div>
        )}

        {activeTab === 'problems' && (
          <ProblemsPanel
            onSendToChat={(problem) => sendProblemToChat(problemToEntry(problem))}
          />
        )}

        {activeTab === 'tasks' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <TasksPanel />
          </div>
        )}

        {activeTab === 'debug' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <DebugPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatActionBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        height: 22,
        padding: '0 8px',
        border: '1px solid rgba(0,224,255,0.35)',
        borderRadius: 4,
        background: 'rgba(0,224,255,0.08)',
        color: 'var(--caval-accent)',
        cursor: 'pointer',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </button>
  );
}

function PanelBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 20, height: 20, border: 'none', background: 'none',
        color: 'var(--caval-text-muted)', cursor: 'pointer', borderRadius: 3,
        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(138,149,166,0.12)'; e.currentTarget.style.color = 'var(--caval-text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--caval-text-muted)'; }}
    >
      {children}
    </button>
  );
}
