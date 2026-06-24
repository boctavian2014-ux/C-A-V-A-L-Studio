import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAIStore, getModelDisplayLabel, type ChatMessage } from './ai-store';
import { ChatModelSelect } from './ChatModelSelect';
import { ModeSwitcher } from './ModeSwitcher';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { useCavalTheme } from '../../themes/theme-provider';

// ──────────────────────────────────────────────
//  Markdown renderer minimal (fără dependențe externe)
// ──────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    // Blocuri de cod
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<div class="code-block"><div class="code-lang">${lang || 'code'}</div><pre><code>${escHtml(code.trimEnd())}</code></pre></div>`
    )
    // Cod inline
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Paragrafe
    .replace(/\n\n/g, '</p><p>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────
//  Diff block — în interiorul unui mesaj AI
// ──────────────────────────────────────────────

function DiffBlock({ message }: { message: ChatMessage }) {
  const { applyDiff, rejectDiff } = useAIStore();
  const diff = message.diff!;

  if (diff.applied) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px', borderRadius: 6,
        background: 'rgba(47,191,113,0.08)', border: '1px solid rgba(47,191,113,0.25)',
        fontSize: 11.5, color: 'var(--caval-success)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        ✓ Modificări aplicate în {diff.filePath.split(/[/\\]/).pop()}
      </div>
    );
  }

  const removedLines = diff.original.split('\n').filter(Boolean);
  const addedLines   = diff.modified.split('\n').filter(Boolean);

  return (
    <div style={{
      marginTop: 10, borderRadius: 6, overflow: 'hidden',
      border: '1px solid var(--caval-border)',
    }}>
      <div style={{
        padding: '5px 10px', background: 'var(--caval-surface-raised)',
        borderBottom: '1px solid var(--caval-border)',
        fontSize: 10.5, color: 'var(--caval-text-muted)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'JetBrains Mono, monospace',
      }}>
        <span style={{ flex: 1 }}>{diff.filePath.split(/[/\\]/).pop()}</span>
        <span style={{ color: 'var(--caval-success)' }}>+{addedLines.length}</span>
        <span style={{ color: 'var(--caval-error)' }}>-{removedLines.length}</span>
      </div>
      {removedLines.map((line, i) => (
        <div key={`r${i}`} style={{ padding: '1px 10px', background: 'rgba(239,68,68,0.06)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: '#FF8080' }}>
          - {line}
        </div>
      ))}
      {addedLines.map((line, i) => (
        <div key={`a${i}`} style={{ padding: '1px 10px', background: 'rgba(47,191,113,0.06)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: '#70E0A0' }}>
          + {line}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, padding: '7px 10px', borderTop: '1px solid var(--caval-border)', background: 'var(--caval-surface-raised)' }}>
        <button
          onClick={() => applyDiff(message.id)}
          style={{
            padding: '4px 14px', borderRadius: 5, border: 'none',
            background: 'var(--caval-success)', color: '#0E0E0F',
            fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          ✓ Aplică
        </button>
        <button
          onClick={() => rejectDiff(message.id)}
          style={{
            padding: '4px 12px', borderRadius: 5,
            border: '1px solid var(--caval-border)', background: 'none',
            color: 'var(--caval-text-muted)', fontSize: 11.5, cursor: 'pointer',
          }}
        >
          ✕ Respinge
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  Bubble mesaj
// ──────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const { modelLabels } = useAIStore();
  const selectionLabel = message.model ? getModelDisplayLabel(message.model, modelLabels) : null;
  const resolvedLabel = message.resolvedModel
    ? getModelDisplayLabel(message.resolvedModel, modelLabels)
    : null;
  const modelLabel =
    resolvedLabel && selectionLabel && resolvedLabel !== selectionLabel && message.model?.startsWith('caval-auto/')
      ? `${selectionLabel} → ${resolvedLabel}`
      : resolvedLabel ?? selectionLabel ?? 'Caval AI';

  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '96%',
    }}>
      {/* Label */}
      <div style={{ fontSize: 9.5, color: 'var(--caval-text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em', paddingLeft: 2 }}>
        {isUser ? 'Tu' : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--caval-accent)', display: 'inline-block' }} />
            {modelLabel}
          </span>
        )}
      </div>

      {/* Conținut */}
      <div style={{
        padding: '9px 12px', borderRadius: isUser ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
        background: isUser ? 'var(--caval-accent-glow)' : 'var(--caval-surface)',
        border: `1px solid ${isUser ? 'var(--caval-accent-ring)' : 'var(--caval-border)'}`,
        fontSize: 13, lineHeight: 1.6, color: 'var(--caval-text)',
      }}>
        {message.isStreaming && !message.content ? (
          <StreamingDots />
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            style={{ overflowWrap: 'break-word' }}
          />
        )}

        {/* Diff block dacă există */}
        {message.diff && !message.isStreaming && (
          <DiffBlock message={message} />
        )}

        {/* Eroare */}
        {message.error && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 5, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11.5, color: 'var(--caval-error)' }}>
            ⚠ {message.error}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--caval-accent)',
            animation: `dot-bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────
//  AIPanel — componenta principală
// ──────────────────────────────────────────────

export function AIPanel({ onClose, onOpenComposer }: { onClose?: () => void; onOpenComposer?: () => void }) {
  const { theme } = useCavalTheme();
  const {
    messages, isStreaming, includeMode,
    sendMessage, stopStreaming, clearChat, setIncludeMode, loadModelLabels,
    threads, activeThreadId, newThread, selectThread,
  } = useAIStore();

  const { activeTabId, tabs } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [input, setInput] = useState('');

  // ── Resize drag ──
  const [panelWidth, setPanelWidth] = useState(340);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(340);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    e.preventDefault();
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - e.clientX; // drag esq = mai lat
      const newW = Math.max(260, Math.min(600, dragStartW.current + delta));
      setPanelWidth(newW);
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  // Auto-scroll la ultimul mesaj
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendMessage(text);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const QUICK_PROMPTS = [
    { label: 'Explică', text: 'Explică ce face acest cod' },
    { label: 'Refactor', text: 'Refactorizează pentru claritate' },
    { label: 'Teste', text: 'Scrie teste unitare pentru acest fișier' },
    { label: 'Bug?', text: 'Există bug-uri în acest cod?' },
  ];

  return (
    <div style={{
      width: panelWidth,
      background: theme.colors.surfaceRaised,
      borderLeft: `1px solid ${theme.colors.border}`,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
      position: 'relative',
    }}>
      {/* Resize handle — drag la stânga să ajustezi lățimea */}
      <div
        className="caval-resize-handle"
        onMouseDown={onResizeStart}
        style={{ cursor: 'col-resize' }}
      />

      {/* ── Header ─────────────────────────── */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        {/* Logo AI */}
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--caval-accent-glow)', border: '1px solid var(--caval-accent-ring)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="var(--caval-accent)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M3.5 6h5M6 3.5v5" strokeLinecap="round" />
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Caval AI</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Șterge conversația"
            style={{
              width: 22, height: 22, borderRadius: 4, border: 'none',
              background: 'none', color: 'var(--caval-text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}
          >
            ↺
          </button>
        )}

        {/* Închide panel */}
        {onClose && (
          <button
            onClick={onClose}
            title="Închide AI Panel (Ctrl+Shift+A)"
            style={{
              width: 22, height: 22, borderRadius: 4, border: 'none',
              background: 'none', color: 'var(--caval-text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, lineHeight: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--caval-text)'; e.currentTarget.style.background = 'var(--caval-surface-raised)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--caval-text-muted)'; e.currentTarget.style.background = 'none'; }}
          >
            ✕
          </button>
        )}
        </div>
      </div>

      <ModeSwitcher />

      {/* Thread tabs */}
      {threads.length > 1 && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 10px', borderBottom: `1px solid ${theme.colors.border}`, overflowX: 'auto', flexShrink: 0 }}>
          {threads.slice(0, 5).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectThread(t.id)}
              style={{
                padding: '2px 8px', fontSize: 10, borderRadius: 4, border: '1px solid',
                borderColor: t.id === activeThreadId ? 'var(--caval-accent-ring)' : 'var(--caval-border)',
                background: t.id === activeThreadId ? 'var(--caval-accent-glow)' : 'transparent',
                color: t.id === activeThreadId ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {t.title.slice(0, 20)}
            </button>
          ))}
          <button type="button" onClick={newThread} title="Chat nou" style={{ padding: '2px 8px', fontSize: 10, border: '1px dashed var(--caval-border)', borderRadius: 4, background: 'none', color: 'var(--caval-text-muted)', cursor: 'pointer' }}>+</button>
        </div>
      )}

      {/* ── Context mode ───────────────────── */}
      <div style={{
        display: 'flex', gap: 5, padding: '6px 12px',
        borderBottom: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
      }}>
        {(['file', 'selection', 'project'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setIncludeMode(mode)}
            style={{
              padding: '2px 9px', borderRadius: 999, fontSize: 10.5, cursor: 'pointer',
              border: '1px solid',
              borderColor: includeMode === mode ? 'var(--caval-accent-ring)' : 'var(--caval-border)',
              background: includeMode === mode ? 'var(--caval-accent-glow)' : 'transparent',
              color: includeMode === mode ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              transition: 'all 0.12s',
            }}
          >
            {mode === 'file' ? `📄 ${activeTab?.name ?? 'Fișier'}` : mode === 'selection' ? '✂ Selecție' : '📁 Proiect'}
          </button>
        ))}
      </div>

      {/* ── Messages ───────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 ? (
          <EmptyState quickPrompts={QUICK_PROMPTS} onSelect={(t) => setInput(t)} />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ──────────────────────────── */}
      <div style={{
        padding: '10px', borderTop: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
          borderRadius: 10, overflow: 'hidden',
          transition: 'border-color 0.15s',
        }}
          onFocusCapture={(e) => (e.currentTarget.style.borderColor = 'var(--caval-accent)')}
          onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--caval-border)')}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Întreabă Caval AI... (@file, Enter = trimite)"
            disabled={isStreaming}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              padding: '10px 12px 4px', fontSize: 13, color: 'var(--caval-text)',
              fontFamily: "'Inter', sans-serif", resize: 'none', minHeight: 52,
              lineHeight: 1.5, outline: 'none',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', padding: '4px 8px 8px',
            gap: 6,
          }}>
            {/* Attach file */}
            <IconBtn title="Atașează fișier">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12.5 8.5L7 14a4 4 0 01-5.66-5.66l7-7a2.5 2.5 0 013.54 3.54L5.5 11.5a1 1 0 01-1.42-1.42L10 4" strokeLinecap="round" />
              </svg>
            </IconBtn>
            {/* Context proiect */}
            <IconBtn title="Include tot proiectul în context" onClick={() => setIncludeMode('project')}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="1" y="4" width="14" height="9" rx="1.5" />
                <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" strokeLinecap="round" />
              </svg>
            </IconBtn>
            {onOpenComposer && (
              <IconBtn title="Deschide Composer (multi-file)" onClick={onOpenComposer}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
                </svg>
              </IconBtn>
            )}

            {/* Model + Send */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChatModelSelect />
              <button
                onClick={isStreaming ? stopStreaming : handleSend}
                disabled={!isStreaming && !input.trim()}
                style={{
                  padding: '5px 14px', borderRadius: 6,
                  border: 'none', cursor: input.trim() || isStreaming ? 'pointer' : 'default',
                  background: isStreaming ? 'rgba(239,68,68,0.15)' : 'var(--caval-accent)',
                  color: isStreaming ? 'var(--caval-error)' : '#0E0E0F',
                  fontSize: 12, fontWeight: 700, transition: 'all 0.12s',
                  opacity: !isStreaming && !input.trim() ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                {isStreaming ? '■ Stop' : 'Trimite ↵'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  Empty state cu quick prompts
// ──────────────────────────────────────────────

function EmptyState({ quickPrompts, onSelect }: {
  quickPrompts: { label: string; text: string }[];
  onSelect: (text: string) => void;
}) {
  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>
          <svg width="36" height="36" viewBox="0 0 26 26" fill="none" style={{ margin: '0 auto', display: 'block' }}>
            <polygon points="13,2 24,8 24,18 13,24 2,18 2,8" stroke="var(--caval-accent)" strokeWidth="1.2" fill="rgba(0,224,255,0.06)" />
            <path d="M8 13 L11 16 L18 10" stroke="var(--caval-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--caval-text)' }}>Caval AI</div>
        <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          Înțelege întregul tău proiect.<br/>Pune o întrebare sau alege un prompt rapid.
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
        {quickPrompts.map((p) => (
          <button
            key={p.label}
            onClick={() => onSelect(p.text)}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 11.5,
              border: '1px solid var(--caval-border)', background: 'var(--caval-surface)',
              color: 'var(--caval-text)', cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--caval-accent)';
              e.currentTarget.style.color = 'var(--caval-accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--caval-border)';
              e.currentTarget.style.color = 'var(--caval-text)';
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
//  Icon button helper
// ──────────────────────────────────────────────

function IconBtn({ title, onClick, children }: { title: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 5, border: 'none',
        background: 'none', color: 'var(--caval-text-muted)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--caval-surface-raised)'; e.currentTarget.style.color = 'var(--caval-text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--caval-text-muted)'; }}
    >
      {children}
    </button>
  );
}
