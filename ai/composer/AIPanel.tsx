import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAIStore, getModelDisplayLabel, type ChatMessage } from './ai-store';
import { ChatModelSelect } from './ChatModelSelect';
import { ChatModeSelect } from './ChatModeSelect';
import { useModelCatalog } from './use-model-catalog';
import { useCavalTheme } from '../../themes/theme-provider';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { ChatActivityTimeline } from './ChatActivityTimeline';
import { CavaloAiMark } from '../../src/renderer/components/brand/CavaloHorseMark';
import { ChatReasoningBlock } from './ChatReasoningBlock';
import { hashChatDraft } from './chat-prepare';
import { summarizeForChatPanel, formatChatPanelSummary, formatArenaReasoning } from './chat-display';

const ARENA_INPUT_ROWS = 4;
const ARENA_LINE_HEIGHT = 1.5;
const ARENA_FONT_SIZE = 13;
const ARENA_INPUT_HEIGHT =
  ARENA_INPUT_ROWS * ARENA_FONT_SIZE * ARENA_LINE_HEIGHT + 14;

// ──────────────────────────────────────────────
//  Markdown renderer minimal (fără dependențe externe)
// ──────────────────────────────────────────────

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  let src = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<div class="code-block"><div class="code-lang">${escHtml(lang || 'code')}</div><pre><code>${escHtml(code.trimEnd())}</code></pre></div>`
    );
    return `\uE000CB${idx}\uE001`;
  });
  src = escHtml(src);
  src = src.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  src = src.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  src = src.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>');
  src = src.replace(/\uE000CB(\d+)\uE001/g, (_, i) => codeBlocks[Number(i)] ?? '');
  return src;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function ArenaReasoningPanel({ message }: { message: ChatMessage }) {
  const isStreaming = Boolean(message.isStreaming);
  const text = formatArenaReasoning(
    message.reasoningBrief,
    message.recap,
    isStreaming,
    isStreaming && Boolean(message.multiAgentStatus?.toLowerCase().includes('compose'))
  );

  if (message.recap) {
    return <CompactArenaStatus text={text} />;
  }

  if (isStreaming) {
    if (message.reasoningBrief) {
      return (
        <CompactArenaStatus
          text={
            text ||
            formatArenaReasoning(message.reasoningBrief, undefined, true) ||
            'Full Integration pipeline…'
          }
        />
      );
    }
    return (
      <CompactArenaStatus
        text={message.multiAgentStatus || text || 'Full Integration pipeline…'}
      />
    );
  }

  return (
    <CompactArenaStatus
      text={
        text ||
        formatChatPanelSummary(summarizeForChatPanel(message.content)) ||
        (message.writtenFiles?.length
          ? `✓ ${message.writtenFiles.length} fișier(e) — vezi editorul.`
          : '')
      }
    />
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const { modelLabels, agentMode } = useAIStore();
  const arenaMode = agentMode === 'code';
  const selectionLabel = message.model ? getModelDisplayLabel(message.model, modelLabels) : null;
  const resolvedLabel = message.resolvedModel
    ? getModelDisplayLabel(message.resolvedModel, modelLabels)
    : null;
  const modelLabel =
    resolvedLabel && selectionLabel && resolvedLabel !== selectionLabel && message.model?.startsWith('caval-auto/')
      ? `${selectionLabel} → ${resolvedLabel}`
      : resolvedLabel ?? selectionLabel ?? 'Cavallo Arena';

  const displayText = arenaMode
    ? message.reasoningBrief || message.recap
      ? formatArenaReasoning(message.reasoningBrief, message.recap, Boolean(message.isStreaming))
      : formatChatPanelSummary(
          summarizeForChatPanel(message.content),
          Boolean(message.isStreaming && !isUser)
        )
    : message.content;

  const arenaStatusText =
    arenaMode && message.isStreaming && message.multiAgentStatus && !message.reasoningBrief
      ? message.multiAgentStatus
      : displayText;

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
        userSelect: 'text',
        WebkitUserSelect: 'text',
        cursor: 'text',
      }}>
        {message.reasoning && !arenaMode && (
          <ChatReasoningBlock
            reasoning={message.reasoning}
            isStreaming={Boolean(message.isStreaming && !message.content)}
            defaultExpanded={message.reasoningExpanded ?? true}
          />
        )}
        {!isUser && arenaMode ? (
          message.isStreaming || message.reasoningBrief || message.recap ? (
            <ArenaReasoningPanel message={message} />
          ) : (
            <>
              <CompactArenaStatus text={arenaStatusText || (message.writtenFiles?.length ? `✓ ${message.writtenFiles.length} fișier(e) — vezi editorul.` : '')} />
              {message.writtenFiles && message.writtenFiles.length > 0 ? (
                <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--caval-success)' }}>
                  {message.writtenFiles.slice(0, 3).join(', ')}
                  {message.writtenFiles.length > 3 ? '…' : ''}
                </div>
              ) : null}
            </>
          )
        ) : message.isStreaming && message.activitySteps?.length ? (
          <>
            <ChatActivityTimeline
              steps={message.activitySteps}
              collapsed={Boolean(message.content)}
            />
            {message.content ? (
              <StreamingText content={message.content} />
            ) : null}
          </>
        ) : message.isStreaming && !message.content ? (
          <StreamingDots />
        ) : message.isStreaming ? (
          <StreamingText content={message.content} />
        ) : (
          <div
            className="caval-md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            style={{ overflowWrap: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}
          />
        )}

        {/* Diff block dacă există */}
        {message.diff && !message.isStreaming && (
          <DiffBlock message={message} />
        )}

        {message.writtenFiles && message.writtenFiles.length > 0 && !message.isStreaming && !arenaMode && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 6,
            background: 'rgba(47,191,113,0.08)', border: '1px solid rgba(47,191,113,0.25)',
            fontSize: 11.5, color: 'var(--caval-success)',
          }}>
            ✓ {message.writtenFiles.length} fișier(e) create în workspace: {message.writtenFiles.slice(0, 4).join(', ')}
            {message.writtenFiles.length > 4 ? '…' : ''}
          </div>
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

function CompactArenaStatus({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--caval-text-muted)',
        maxHeight: '5.8em',
        overflow: 'hidden',
      }}
    >
      {text}
    </div>
  );
}

function StreamingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <div style={{ display: 'flex', gap: 4 }}>
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
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--caval-text-muted)' }}>Scriu…</span>
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function StreamingText({ content }: { content: string }) {
  return (
    <div
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        fontFamily: 'inherit',
      }}
    >
      {content}
      <span
        style={{
          display: 'inline-block',
          width: 2,
          height: '1em',
          marginLeft: 2,
          verticalAlign: 'text-bottom',
          background: 'var(--caval-accent)',
          animation: 'cursor-blink 0.9s step-end infinite',
        }}
      />
      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
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
    messages, isStreaming,
    sendMessage, stopStreaming, clearChat, loadModelLabels,
    threads, activeThreadId, newThread, selectThread,
    attachedFiles, addAttachments, removeAttachment,
    prepareState, prepareInFlight, chatPrepareDraft, clearPrepareState,
    selectedModel, pendingChatDraft, clearPendingChatDraft, pendingAutoSend,
  } = useAIStore();

  const { catalog, loading: catalogLoading, refresh: refreshCatalog } = useModelCatalog();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectPath = useEditorStore((s) => s.projectPath);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const inputDraftHash = useMemo(
    () => (input.trim() ? hashChatDraft(input, selectedModel, projectPath) : null),
    [input, selectedModel, projectPath]
  );

  const isPrepareReady = Boolean(
    inputDraftHash &&
    prepareState?.ready &&
    prepareState.draftHash === inputDraftHash
  );

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  useEffect(() => {
    if (!pendingChatDraft) return;
    const draft = pendingChatDraft;
    const autoSend = pendingAutoSend;
    setInput(draft);
    clearPendingChatDraft();
    if (autoSend) {
      useAIStore.setState({ pendingAutoSend: false });
      void sendMessage(draft);
      return;
    }
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, [pendingChatDraft, pendingAutoSend, clearPendingChatDraft, sendMessage]);

  // Zero-Latency Fusion: warm cache + model preload when panel opens
  useEffect(() => {
    if (!projectPath) return;
    const activeTab = tabs.find((t) => t.id === activeTabId);
    void window.caval?.zlPanelOpen?.({
      workspaceRoot: projectPath,
      activeFile: activeTab?.path,
      openFiles: tabs.map((t) => t.path),
    });
  }, [projectPath, tabs, activeTabId]);

  // Zero-Latency: prepare while user types (350ms debounce)
  useEffect(() => {
    if (!input.trim()) {
      clearPrepareState();
      return;
    }
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = setTimeout(() => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      void chatPrepareDraft({
        text: input,
        projectPath,
        activeFile: activeTab?.path,
        openFiles: tabs.map((t) => t.path),
      });
    }, 350);
    return () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    };
  }, [input, projectPath, tabs, activeTabId, chatPrepareDraft, clearPrepareState]);

  // Auto-scroll la ultimul mesaj
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachedFiles.length === 0) || isStreaming) return;
    setInput('');
    await sendMessage(text || 'Analizează fișierele atașate.');
  }, [input, isStreaming, sendMessage, attachedFiles.length]);

  const handleAttachClick = useCallback(async () => {
    const caval = (window as unknown as { caval?: { fs?: { pickFiles?: () => Promise<string[] | null> } } }).caval;
    if (caval?.fs?.pickFiles) {
      const paths = await caval.fs.pickFiles();
      if (paths?.length) await addAttachments(paths);
      return;
    }
    fileInputRef.current?.click();
  }, [addAttachments]);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      const paths: string[] = [];
      for (const file of Array.from(files)) {
        const withPath = file as File & { path?: string };
        if (withPath.path) paths.push(withPath.path);
      }
      if (paths.length) await addAttachments(paths);
      e.target.value = '';
    },
    [addAttachments]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const QUICK_PROMPTS = [
    { label: 'Fashion Match', text: 'AI Product Matching Engine (Fashion) — enterprise matching barcode OCR image NFC' },
    { label: 'Explică', text: 'Explică ce face acest cod' },
    { label: 'Refactor', text: 'Refactorizează pentru claritate' },
    { label: 'Teste', text: 'Scrie teste unitare pentru acest fișier' },
    { label: 'Bug?', text: 'Există bug-uri în acest cod?' },
  ];

  const handleQuickPrompt = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

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
        padding: '8px 14px', borderBottom: `1px solid ${theme.colors.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <CavaloAiMark size={22} />
          <div>
            <span style={{
              fontSize: 11.5, fontWeight: 600, color: 'var(--caval-text)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              Coding Arena
            </span>
            <div style={{ fontSize: 9.5, color: 'var(--caval-text-muted)', lineHeight: 1.2 }}>
              Full SDE · Reasoning · cod în editor
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {/* ── Messages ───────────────────────── */}
      <div className="ai-messages-scroll caval-selectable" style={{
        flex: 1, overflowY: 'auto', padding: messages.length === 0 ? 0 : '10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        {messages.length > 0 && <div ref={messagesEndRef} />}
      </div>

      {/* ── Input ──────────────────────────── */}
      <div style={{
        padding: '10px', borderTop: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <ChatModeSelect
          quickPrompts={QUICK_PROMPTS}
          onQuickPrompt={handleQuickPrompt}
        />
        <div style={{
          background: 'var(--caval-surface)', border: '2px solid var(--caval-border)',
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
            placeholder="Prompt Coding Arena (Enter = trimite, Shift+Enter = linie nouă)"
            disabled={isStreaming}
            rows={ARENA_INPUT_ROWS}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              padding: '10px 12px 4px', fontSize: ARENA_FONT_SIZE, color: 'var(--caval-text)',
              fontFamily: "'Inter', sans-serif", resize: 'none',
              height: ARENA_INPUT_HEIGHT, maxHeight: ARENA_INPUT_HEIGHT,
              lineHeight: ARENA_LINE_HEIGHT, outline: 'none', overflow: 'auto',
            }}
          />
          {attachedFiles.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: '0 10px 6px',
            }}>
              {attachedFiles.map((file) => (
                <span
                  key={file.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999, fontSize: 10.5,
                    border: '1px solid var(--caval-border)',
                    background: 'var(--caval-surface-raised)',
                    color: 'var(--caval-text-muted)',
                    maxWidth: '100%',
                  }}
                  title={file.path}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.path.startsWith('engineering://') ? '📐' : '📎'} {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(file.id)}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      color: 'var(--caval-text-muted)', fontSize: 12, lineHeight: 1, padding: 0,
                    }}
                    title="Elimină atașament"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => void handleFileInputChange(e)}
          />
          <div style={{
            display: 'flex', alignItems: 'center', padding: '4px 8px 8px',
            gap: 6,
          }}>
            {/* Attach + refresh */}
            <IconBtn title="Atașează fișier" onClick={() => void handleAttachClick()}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M12.5 8.5L7 14a4 4 0 01-5.66-5.66l7-7a2.5 2.5 0 013.54 3.54L5.5 11.5a1 1 0 01-1.42-1.42L10 4" strokeLinecap="round" />
              </svg>
            </IconBtn>
            <IconBtn
              title="Refresh modele OpenRouter"
              onClick={() => void refreshCatalog()}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>↻</span>
            </IconBtn>
            {onOpenComposer && (
              <IconBtn title="Deschide Composer (multi-file)" onClick={onOpenComposer}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
                </svg>
              </IconBtn>
            )}

            {(isPrepareReady || (prepareInFlight && input.trim())) && !isStreaming && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 10.5,
                  color: isPrepareReady ? 'var(--caval-success)' : 'var(--caval-text-muted)',
                  marginLeft: 2,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: isPrepareReady ? 'var(--caval-success)' : 'var(--caval-accent)',
                    opacity: isPrepareReady ? 1 : 0.7,
                    animation: isPrepareReady ? 'none' : 'dot-bounce 1.2s ease-in-out infinite',
                  }}
                />
                {isPrepareReady ? 'Pregătit' : 'Pregătesc…'}
              </span>
            )}

            {/* Model + Send */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChatModelSelect catalog={catalog} loading={catalogLoading} />
              <button
                onClick={isStreaming ? stopStreaming : handleSend}
                disabled={!isStreaming && !input.trim() && attachedFiles.length === 0}
                style={{
                  padding: '5px 14px', borderRadius: 6,
                  border: 'none', cursor: input.trim() || isStreaming ? 'pointer' : 'default',
                  background: isStreaming ? 'rgba(239,68,68,0.15)' : 'var(--caval-accent)',
                  color: isStreaming ? 'var(--caval-error)' : '#0E0E0F',
                  fontSize: 12, fontWeight: 700, transition: 'all 0.12s',
                  opacity: !isStreaming && !input.trim() && attachedFiles.length === 0 ? 0.4 : 1,
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
