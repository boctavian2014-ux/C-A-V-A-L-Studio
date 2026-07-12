import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DebugPanel } from '../debug/DebugPanel';
import { useEditorStore } from '../../store/editor-store';
import { useOutputStore, formatOutputForChat } from '../../store/output-store';
import {
  formatProblemForChat,
  formatProblemsForChat,
  revealProblem,
  useProblemsStore,
} from '../../store/problems-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import {
  createInitialTerminalSession,
  createTerminalSessionMeta,
  type TerminalSessionMeta,
} from '../../terminal/terminal-sessions';
import type { TerminalPanelTab } from '../../terminal/terminal-events';
import { TerminalSession } from './TerminalSession';

const TERMINAL_HEIGHT_KEY = 'caval-terminal-height';

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
  const projectPath = useEditorStore((s) => s.projectPath);
  const initialSessionRef = useRef(createInitialTerminalSession());
  const [sessions, setSessions] = useState<TerminalSessionMeta[]>(() => [initialSessionRef.current]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => initialSessionRef.current.id);
  const [activeTab, setActiveTab] = useState<TerminalPanelTab>('terminal');
  const [height, setHeight] = useState(readStoredTerminalHeight);
  const [isVisible, setIsVisible] = useState(true);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const outputChannels = useOutputStore((s) => s.channels);
  const activeOutputChannel = useOutputStore((s) => s.activeChannel);
  const problems = useProblemsStore((s) => s.problems);
  const focusedIndex = useProblemsStore((s) => s.focusedIndex);
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

  const createSession = useCallback(() => {
    const meta = createTerminalSessionMeta(sessions.length);
    setSessions((prev) => [...prev, meta]);
    setActiveSessionId(meta.id);
    setIsVisible(true);
    setActiveTab('terminal');
  }, [sessions.length]);

  const closeSession = useCallback((id: string) => {
    setSessions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[next.length - 1]?.id ?? '');
      }
      return next;
    });
  }, [activeSessionId]);

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
    const onNew = () => createSession();
    const onSplit = () => createSession();
    const onToggle = () => setIsVisible((v) => !v);

    document.addEventListener('caval:terminal-panel-tab', showPanel);
    document.addEventListener('caval:run-in-terminal', onRunInTerminal);
    document.addEventListener('caval:terminal-new', onNew);
    document.addEventListener('caval:terminal-split', onSplit);
    document.addEventListener('caval:terminal-toggle', onToggle);
    return () => {
      document.removeEventListener('caval:terminal-panel-tab', showPanel);
      document.removeEventListener('caval:run-in-terminal', onRunInTerminal);
      document.removeEventListener('caval:terminal-new', onNew);
      document.removeEventListener('caval:terminal-split', onSplit);
      document.removeEventListener('caval:terminal-toggle', onToggle);
    };
  }, [createSession]);

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

        {activeTab === 'terminal' && sessions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8, gap: 2, overflow: 'auto' }}>
            {sessions.map((s) => (
              <span
                key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  background: activeSessionId === s.id ? 'rgba(0,224,255,0.12)' : 'transparent',
                  color: activeSessionId === s.id ? 'var(--caval-text)' : 'var(--caval-text-muted)',
                }}
              >
                {s.title}
                {sessions.length > 1 && (
                  <button
                    type="button"
                    title="Închide terminal"
                    onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                    style={{
                      border: 'none', background: 'none', color: 'inherit',
                      cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

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
          <PanelBtn title="Terminal nou" onClick={createSession}>+</PanelBtn>
          <PanelBtn title="Minimizează" onClick={() => setIsVisible(false)}>⌄</PanelBtn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {sessions.map((s) => (
          <TerminalSession
            key={s.id}
            sessionId={s.id}
            containerId={s.containerId}
            cwd={projectPath}
            isActive={activeTab === 'terminal' && activeSessionId === s.id}
          />
        ))}

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
                <div key={`${i}-${line.slice(0, 24)}`}>{line || '\u00a0'}</div>
              ))
            )}
          </div>
        )}

        {activeTab === 'problems' && (
          <div style={{
            padding: '4px 0', height: '100%', overflow: 'auto',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
          }}>
            {problems.length === 0 ? (
              <div style={{ padding: '8px 14px', color: 'var(--caval-text-muted)' }}>
                Nu există probleme detectate.
              </div>
            ) : (
              problems.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: i === focusedIndex ? 'rgba(0,224,255,0.08)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => revealProblem(p, projectPath)}
                    style={{
                      display: 'flex', flex: 1, minWidth: 0, textAlign: 'left',
                      gap: 8, padding: '6px 14px', border: 'none',
                      background: 'transparent',
                      color: p.severity === 'error' ? '#EF4444' : '#F59E0B',
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>{p.severity === 'error' ? '✕' : '⚠'}</span>
                    <span style={{ color: 'var(--caval-text-muted)', flexShrink: 0 }}>
                      {p.file}:{p.line}:{p.col}
                    </span>
                    <span style={{ color: 'var(--caval-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.message}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Trimite în chat"
                    onClick={() => sendProblemToChat(p)}
                    style={{
                      flexShrink: 0,
                      marginRight: 8,
                      border: '1px solid var(--caval-border)',
                      borderRadius: 4,
                      background: 'rgba(0,224,255,0.06)',
                      color: 'var(--caval-accent)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 8px',
                    }}
                  >
                    Chat
                  </button>
                </div>
              ))
            )}
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
