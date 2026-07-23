import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAIStore, getModelDisplayLabel, isChatStopIntent, ensurePipelineVerifyListener, type ChatMessage } from './ai-store';
import { ChatModelSelect } from './ChatModelSelect';
import { ChatModeSelect } from './ChatModeSelect';
import { useModelCatalog } from './use-model-catalog';
import { useCavalTheme } from '../../themes/theme-provider';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { getAgentMode, isAgenticPipelineMode } from '../modes/agent-modes';
import { getModelProfileSummary } from '../models/model-profile-ui';
import { ChatActivityTimeline } from './ChatActivityTimeline';
import { CavaloAiMark } from '../../src/renderer/components/brand/CavaloHorseMark';
import { ChatReasoningBlock } from './ChatReasoningBlock';
import { hashChatDraft } from './chat-prepare';
import { summarizeForChatPanel, formatChatPanelSummary, formatArenaReasoning, sanitizeLiveReasoning } from './chat-display';
import { MultiAgentTimeline } from './MultiAgentTimeline';
import { resolveWaitPhase, buildWaitSceneContext } from './arena-wait-copy';
import { DEFAULT_REASONING_LAYER_CONFIG, type ReasoningLayerConfig } from './multi-agent/types';
import { DEFAULT_ZERO_LATENCY_CONFIG } from '../../ai/composer/zero-latency/zl-config-shared';
import { useArenaWaitMessage } from './use-arena-wait-message';
import { checkModelReadiness } from '../models/model-readiness';
import { workspaceFolderTitle } from './workspace-session';
import { formatProjectCompletionWaitMessage } from './project-completion-announce';
import { RoleMapPanel } from './RoleMapPanel';
import { buildRoleMapEntries, hasModelOrchSteps } from './role-map-utils';

const AI_PANEL_WIDTH_KEY = 'caval-ai-panel-width';

function readStoredPanelWidth(): number {
  try {
    const raw = localStorage.getItem(AI_PANEL_WIDTH_KEY);
    const n = raw ? Number(raw) : 340;
    if (!Number.isFinite(n)) return 340;
    return Math.max(260, Math.min(600, n));
  } catch {
    return 340;
  }
}
const ARENA_INPUT_MIN_ROWS = 4;
const ARENA_INPUT_MAX_ROWS = 6;
const ARENA_LINE_HEIGHT = 1.5;
const ARENA_FONT_SIZE = 13;
const ARENA_INPUT_LINE_PX = ARENA_FONT_SIZE * ARENA_LINE_HEIGHT;
const ARENA_INPUT_MIN_HEIGHT = ARENA_INPUT_MIN_ROWS * ARENA_INPUT_LINE_PX + 14;
const ARENA_INPUT_MAX_HEIGHT = ARENA_INPUT_MAX_ROWS * ARENA_INPUT_LINE_PX + 14;
const PANEL_PAD_X = 12;

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
  const { applyDiff, rejectDiff, rollbackDiff } = useAIStore();
  const diff = message.diff!;

  if (diff.applied) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px', borderRadius: 6,
        background: 'rgba(47,191,113,0.08)', border: '1px solid rgba(47,191,113,0.25)',
        fontSize: 11.5, color: 'var(--caval-success)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1 }}>✓ Modificări aplicate în {diff.filePath.split(/[/\\]/).pop()}</span>
        {diff.previousContent != null && (
          <button
            type="button"
            onClick={() => void rollbackDiff(message.id)}
            style={{
              padding: '3px 10px', borderRadius: 5,
              border: '1px solid rgba(47,191,113,0.35)', background: 'transparent',
              color: 'var(--caval-success)', fontSize: 11, cursor: 'pointer',
            }}
          >
            ↩ Anulează
          </button>
        )}
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

function ArenaWorkPanel({ message }: { message: ChatMessage }) {
  const globalStreaming = useAIStore((s) => s.isStreaming);
  const projectPath = useEditorStore((s) => s.projectPath);
  const activeTab = useEditorStore((s) => {
    const id = s.activeTabId;
    return id ? s.tabs.find((t) => t.id === id) ?? null : null;
  });
  const [cfg, setCfg] = useState<ReasoningLayerConfig>(DEFAULT_REASONING_LAYER_CONFIG);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await window.caval?.getReasoningLayerConfig?.(projectPath ?? undefined);
      if (!cancelled && res?.ok && res.config) {
        setCfg(res.config);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const messageStreaming = Boolean(message.isStreaming);
  const pipelineActive = Boolean(
    message.multiAgentSteps?.some((step) => step.status === 'active')
  );
  const wasStopped = message.multiAgentStatus === 'Oprit';
  const isStreaming = messageStreaming || globalStreaming;
  const showWait =
    cfg.showHorseWaitAnimation &&
    !message.recap &&
    !wasStopped &&
    (isStreaming || pipelineActive);
  const projectTitle = workspaceFolderTitle(message.workspacePath ?? projectPath);
  const fileCount = message.writtenFiles?.length ?? 0;
  const needsReview = Boolean(
    message.multiAgentStatus?.includes('NEEDS_REVIEW') ||
      message.content?.includes('[NEEDS_REVIEW]')
  );
  const showCompletionHorse = Boolean(
    cfg.showHorseWaitAnimation &&
    message.recap &&
    !isStreaming &&
    (message.workspacePath == null || message.workspacePath === projectPath)
  );
  const completionMessage = showCompletionHorse
    ? formatProjectCompletionWaitMessage(projectTitle, fileCount, needsReview)
    : undefined;
  const waitPhase = resolveWaitPhase(message.multiAgentSteps, message.multiAgentStatus);
  const waitCtx = useMemo(
    () =>
      buildWaitSceneContext({
        projectTitle,
        activeFile: activeTab?.name ?? activeTab?.path,
        steps: message.multiAgentSteps,
        modules: message.reasoningBrief?.modules,
        model: message.resolvedModel ?? message.model,
        writtenFiles: message.writtenFiles,
      }),
    [
      projectTitle,
      activeTab?.name,
      activeTab?.path,
      message.multiAgentSteps,
      message.reasoningBrief?.modules,
      message.resolvedModel,
      message.model,
      message.writtenFiles,
    ]
  );
  const { message: waitMessage, statusLine: waitStatusLine, visible: waitVisible } =
    useArenaWaitMessage(
      waitPhase,
      showWait,
      cfg.waitMessageRotateMs,
      message.multiAgentStatus,
      waitCtx
    );
  const composePhase =
    isStreaming && Boolean(message.multiAgentStatus?.toLowerCase().includes('compose'));
  const planText = formatArenaReasoning(
    message.reasoningBrief,
    message.recap,
    isStreaming,
    composePhase
  );
  const liveReasoning = message.reasoning
    ? sanitizeLiveReasoning(message.reasoning)
    : '';
  const roleMapEntries = buildRoleMapEntries(
    message.pipelineRecapMeta,
    message.multiAgentSteps,
    message.model
  );
  const showRoleMap =
    Boolean(message.recap || hasModelOrchSteps(message.multiAgentSteps)) &&
    roleMapEntries.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {cfg.showPipelineTimeline && (message.multiAgentSteps?.length ?? 0) > 0 && (
        <MultiAgentTimeline
          steps={message.multiAgentSteps!}
          collapsed={Boolean(message.recap)}
          waitMessage={showWait ? waitMessage : undefined}
          waitStatusLine={showWait ? waitStatusLine : undefined}
          waitVisible={waitVisible}
          completionMessage={completionMessage}
          showCompletionHorse={showCompletionHorse}
          completionNeedsReview={needsReview}
        />
      )}
      {isStreaming && (message.activitySteps?.length ?? 0) > 0 && (
        <ChatActivityTimeline
          steps={message.activitySteps!}
          collapsed={Boolean(message.recap || message.reasoningBrief)}
        />
      )}
      {cfg.showLiveReasoning && liveReasoning && (
        <ChatReasoningBlock
          reasoning={liveReasoning}
          isStreaming={Boolean(isStreaming && !message.recap)}
          defaultExpanded={message.reasoningExpanded ?? true}
        />
      )}
      {message.reasoningBrief && !message.recap && (
        <CompactArenaStatus
          text={planText || formatArenaReasoning(message.reasoningBrief, undefined, isStreaming)}
        />
      )}
      {message.recap && <CompactArenaStatus text={planText} />}
      {showRoleMap && (
        <RoleMapPanel
          entries={roleMapEntries}
          userModel={message.model}
          capabilitySnapshot={message.pipelineRecapMeta?.capabilitySnapshot}
        />
      )}
      {!isStreaming && !message.recap && !message.reasoningBrief && planText && (
        <CompactArenaStatus
          text={
            planText ||
            formatChatPanelSummary(summarizeForChatPanel(message.content)) ||
            (message.writtenFiles?.length
              ? `✓ ${message.writtenFiles.length} fișier(e) — vezi editorul.`
              : '')
          }
        />
      )}
    </div>
  );
}

function ModelProfileChips({ modelId }: { modelId: string }) {
  const summary = getModelProfileSummary(modelId);
  if (!summary.chips.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', marginLeft: 4 }}>
      {summary.chips.slice(0, 4).map((chip) => (
        <span
          key={chip}
          style={{
            fontSize: 8.5,
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid var(--caval-border)',
            color: 'var(--caval-text-muted)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          {chip}
        </span>
      ))}
    </span>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const { modelLabels, agentMode } = useAIStore();
  const arenaMode = isAgenticPipelineMode(agentMode);
  const selectionLabel = message.model ? getModelDisplayLabel(message.model, modelLabels) : null;
  const resolvedLabel = message.resolvedModel
    ? getModelDisplayLabel(message.resolvedModel, modelLabels)
    : null;
  const effectiveModelId = message.resolvedModel ?? message.model ?? '';
  const modelLabel = arenaMode
    ? resolvedLabel
      ? `Agentic · ${resolvedLabel}`
      : 'Agentic · multi-model'
    : resolvedLabel && selectionLabel && resolvedLabel !== selectionLabel && message.model?.startsWith('caval-auto/')
      ? `${selectionLabel} → ${resolvedLabel}`
      : resolvedLabel ?? selectionLabel ?? 'Model';

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
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--caval-accent)', display: 'inline-block', flexShrink: 0 }} />
            <span>{modelLabel}</span>
            {!arenaMode && effectiveModelId ? <ModelProfileChips modelId={effectiveModelId} /> : null}
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
          message.isStreaming ||
          message.reasoningBrief ||
          message.recap ||
          (message.multiAgentSteps?.length ?? 0) > 0 ||
          Boolean(message.reasoning) ? (
            <ArenaWorkPanel message={message} />
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
        ) : arenaMode && !isUser ? (
          <>
            <CompactArenaStatus
              text={
                displayText ||
                (message.writtenFiles?.length
                  ? `✓ ${message.writtenFiles.length} fișier(e) — vezi editorul.`
                  : message.isStreaming
                    ? '⚡ Scriu în editor…'
                    : '')
              }
            />
            {message.writtenFiles && message.writtenFiles.length > 0 && !message.isStreaming ? (
              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--caval-success)' }}>
                {message.writtenFiles.slice(0, 3).join(', ')}
                {message.writtenFiles.length > 3 ? '…' : ''}
              </div>
            ) : null}
          </>
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
        {message.diff && !message.isStreaming && !message.diff.autoApplied && !arenaMode && (
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
      title={text}
      style={{
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--caval-text-muted)',
        maxHeight: '5.8em',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 4,
        WebkitBoxOrient: 'vertical',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </div>
  );
}

function StreamingDots({ rotateMs = DEFAULT_REASONING_LAYER_CONFIG.waitMessageRotateMs }: { rotateMs?: number }) {
  const projectPath = useEditorStore((s) => s.projectPath);
  const activeTab = useEditorStore((s) => {
    const id = s.activeTabId;
    return id ? s.tabs.find((t) => t.id === id) ?? null : null;
  });
  const waitCtx = useMemo(
    () =>
      buildWaitSceneContext({
        projectTitle: workspaceFolderTitle(projectPath),
        activeFile: activeTab?.name ?? activeTab?.path,
      }),
    [projectPath, activeTab?.name, activeTab?.path]
  );
  const { message, visible } = useArenaWaitMessage(undefined, true, rotateMs, undefined, waitCtx);

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
      <span
        style={{
          fontSize: 11.5,
          color: 'var(--caval-text-muted)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
      >
        {message}
      </span>
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
      className="caval-stream-text"
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        lineHeight: 1.6,
      }}
    >
      {content}
      <span className="caval-stream-cursor" aria-hidden="true" />
    </div>
  );
}

function MandatoryReviewBadge() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        borderRadius: 8,
        border: '1px solid var(--caval-accent-ring)',
        background: 'var(--caval-accent-glow)',
        color: 'var(--caval-text)',
        fontSize: 11,
        fontWeight: 500,
        width: '100%',
      }}
      title="Review obligatoriu: Merge + Supervisor + Test + Verify înainte de livrare ready-to-use"
    >
      <span aria-hidden style={{ color: 'var(--caval-accent)' }}>●</span>
      <span>Review obligatoriu (activ)</span>
      <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.75 }}>Ready-to-use gate</span>
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
    newThread,
    attachedFiles, addAttachments, removeAttachment,
    prepareState, prepareInFlight, chatPrepareDraft, clearPrepareState,
    selectedModel, pendingChatDraft, clearPendingChatDraft, pendingAutoSend,
    agentMode, modelLabels, apiKeys,
    modeSwitchNotice, clearModeSwitchNotice,
    verifyInFlight, runWorkspaceVerifyAndReport, runBuildAndReport,
    includeMode, setIncludeMode,
  } = useAIStore();

  const { catalog, loading: catalogLoading, refresh: refreshCatalog } = useModelCatalog();
  const modeDef = getAgentMode(agentMode);
  const isAgentic = isAgenticPipelineMode(agentMode);
  const inputPlaceholder = isStreaming
    ? 'Scrie stop / oprește pentru a opri (contextul rămâne în chat)'
    : isAgentic
    ? 'Descrie proiectul — Agentic livrează end-to-end (Enter = trimite)'
    : agentMode === 'plan'
      ? 'Planificare enterprise — arhitectură, roadmap, KPIs (Enter = trimite)'
      : agentMode === 'code'
        ? 'Implementare cod — descrie ce să construiești (Enter = trimite)'
        : agentMode === 'debug'
          ? 'Lipește eroarea sau codul de analizat (Enter = trimite)'
          : agentMode === 'ask'
            ? 'Întrebare sau explicație (Enter = trimite)'
            : `${modeDef.label} — ${modeDef.description.slice(0, 60)}…`;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  const [preloadHint, setPreloadHint] = useState('');
  const [readinessHint, setReadinessHint] = useState<string | null>(null);

  useEffect(() => {
    ensurePipelineVerifyListener();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await checkModelReadiness(selectedModel, apiKeys);
      if (!cancelled) {
        setReadinessHint(result.ready ? null : result.hint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedModel, apiKeys]);

  // ── Resize drag ──
  const [panelWidth, setPanelWidth] = useState(readStoredPanelWidth);
  const [textareaHeight, setTextareaHeight] = useState(ARENA_INPUT_MIN_HEIGHT);
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
    try {
      localStorage.setItem(AI_PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      /* ignore quota */
    }
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
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectPath = useEditorStore((s) => s.projectPath);
  const editorSelection = useEditorStore((s) => s.editorSelection);
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
    const caval = (window as unknown as { caval?: { preload?: { onEvent?: (cb: (e: { type: string; modelId?: string }) => void) => () => void } } }).caval;
    const unsub = caval?.preload?.onEvent?.((event) => {
      if (event.type === 'preload.start' && event.modelId) {
        setPreloadHint(`Încălzesc ${event.modelId}…`);
      }
      if (event.type === 'preload.cache.hit' && event.modelId) {
        setPreloadHint(`${event.modelId} pregătit`);
      }
    });
    return () => unsub?.();
  }, []);

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
    }, input.length > 500
      ? DEFAULT_ZERO_LATENCY_CONFIG.typingDebounceMs * 2
      : DEFAULT_ZERO_LATENCY_CONFIG.typingDebounceMs);
    return () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    };
  }, [input, projectPath, tabs, activeTabId, chatPrepareDraft, clearPrepareState]);

  // Auto-scroll: instant during stream (smooth scroll on every token causes jitter)
  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    if (isStreaming) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isStreaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (isStreaming) {
      if (isChatStopIntent(text)) {
        stopStreaming();
        setInput('');
        setTextareaHeight(ARENA_INPUT_MIN_HEIGHT);
        if (textareaRef.current) {
          textareaRef.current.style.height = `${ARENA_INPUT_MIN_HEIGHT}px`;
        }
      }
      return;
    }
    if (!text && attachedFiles.length === 0) return;
    setInput('');
    setTextareaHeight(ARENA_INPUT_MIN_HEIGHT);
    if (textareaRef.current) {
      textareaRef.current.style.height = `${ARENA_INPUT_MIN_HEIGHT}px`;
    }
    await sendMessage(text || 'Analizează fișierele atașate.');
  }, [input, isStreaming, sendMessage, stopStreaming, attachedFiles.length]);

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

  const syncTextareaHeight = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const next = Math.min(
      ARENA_INPUT_MAX_HEIGHT,
      Math.max(ARENA_INPUT_MIN_HEIGHT, el.scrollHeight)
    );
    setTextareaHeight(next);
  }, []);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    syncTextareaHeight(e.target);
  };

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
        padding: `8px ${PANEL_PAD_X}px`, borderBottom: `1px solid ${theme.colors.border}`,
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
              {isAgentic ? 'Coding Arena' : modeDef.label}
            </span>
            <div style={{ fontSize: 9.5, color: 'var(--caval-text-muted)', lineHeight: 1.2 }}>
              {isAgentic
                ? 'Full SDE · livrare proiect'
                : agentMode === 'code'
                  ? 'Model direct · patch în editor'
                  : modeDef.description}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Șterge conversația"
            style={{
              width: 24, height: 24, borderRadius: 4, border: 'none',
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
              width: 24, height: 24, borderRadius: 4, border: 'none',
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

      {/* Workspace bar — folder deschis + Chat nou (fără tab-uri vechi) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: `4px ${PANEL_PAD_X}px`,
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <span
          title="Folder activ — istoricul vechi e păstrat local"
          style={{
            fontSize: 10,
            color: 'var(--caval-text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
        >
          {workspaceFolderTitle(projectPath)}
        </span>
        <button
          type="button"
          onClick={() => newThread()}
          title="Chat nou"
          style={{
            padding: '2px 10px',
            fontSize: 10,
            borderRadius: 4,
            border: '1px solid var(--caval-accent-ring)',
            background: 'var(--caval-accent-glow)',
            color: 'var(--caval-accent)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Chat nou
        </button>
      </div>

      {/* ── Messages ───────────────────────── */}
      <div ref={messagesScrollRef} className="ai-messages-scroll caval-selectable" style={{
        flex: 1, overflowY: 'auto', padding: messages.length === 0 ? 0 : '10px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        {messages.length > 0 && <div ref={messagesEndRef} />}
      </div>

      {/* ── Input ──────────────────────────── */}
      <div style={{
        padding: PANEL_PAD_X, borderTop: `1px solid ${theme.colors.border}`,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <ChatModeSelect />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {editorSelection?.text && (
            <button
              type="button"
              onClick={() => setIncludeMode(includeMode === 'selection' ? 'project' : 'selection')}
              title={includeMode === 'selection' ? 'Context: doar selecția' : 'Include selecția în context'}
              style={{
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 999,
                border: `1px solid ${includeMode === 'selection' ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
                background: includeMode === 'selection' ? 'var(--caval-accent-glow)' : 'var(--caval-surface-raised)',
                color: includeMode === 'selection' ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
                cursor: 'pointer',
              }}
            >
              {includeMode === 'selection' ? '◉' : '○'} Selecție ({editorSelection.endLine - editorSelection.startLine + 1}L)
            </button>
          )}
          <button
            type="button"
            onClick={() => void runWorkspaceVerifyAndReport()}
            disabled={verifyInFlight !== 'none' || !projectPath || isStreaming}
            title={projectPath ? 'Rulează npm test / verify workspace' : 'Deschide un folder de proiect'}
            style={{
              fontSize: 10.5,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: verifyInFlight === 'tests' ? 'var(--caval-accent-glow)' : 'var(--caval-surface-raised)',
              color: verifyInFlight === 'tests' ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              cursor: verifyInFlight !== 'none' || !projectPath || isStreaming ? 'default' : 'pointer',
              opacity: verifyInFlight !== 'none' || !projectPath || isStreaming ? 0.55 : 1,
            }}
          >
            {verifyInFlight === 'tests' ? '⏳ Run tests…' : '▶ Run tests'}
          </button>
          <button
            type="button"
            onClick={() => void runBuildAndReport()}
            disabled={verifyInFlight !== 'none' || !projectPath || isStreaming}
            title={projectPath ? 'Rulează npm run build' : 'Deschide un folder de proiect'}
            style={{
              fontSize: 10.5,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: verifyInFlight === 'build' ? 'var(--caval-accent-glow)' : 'var(--caval-surface-raised)',
              color: verifyInFlight === 'build' ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              cursor: verifyInFlight !== 'none' || !projectPath || isStreaming ? 'default' : 'pointer',
              opacity: verifyInFlight !== 'none' || !projectPath || isStreaming ? 0.55 : 1,
            }}
          >
            {verifyInFlight === 'build' ? '⏳ Run build…' : '▶ Run build'}
          </button>
        </div>
        {modeSwitchNotice && !isAgentic && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--caval-accent)',
              lineHeight: 1.35,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>{modeSwitchNotice}</span>
            <button
              type="button"
              onClick={() => clearModeSwitchNotice()}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--caval-text-muted)',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}
        {isAgentic && <MandatoryReviewBadge />}
        {agentMode === 'code' && selectedModel.startsWith('caval-auto/') && (
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', lineHeight: 1.35 }}>
            Auto routează modelul — alege un model explicit pentru a testa puterea lui.
          </div>
        )}
        <div style={{
          background: 'var(--caval-surface)', border: '2px solid var(--caval-border)',
          borderRadius: 10,
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
            placeholder={inputPlaceholder}
            rows={ARENA_INPUT_MIN_ROWS}
            style={{
              width: '100%', border: 'none', background: 'transparent',
              padding: '10px 12px 4px', fontSize: ARENA_FONT_SIZE, color: 'var(--caval-text)',
              fontFamily: "'Inter', sans-serif", resize: 'none',
              height: textareaHeight, minHeight: ARENA_INPUT_MIN_HEIGHT, maxHeight: ARENA_INPUT_MAX_HEIGHT,
              lineHeight: ARENA_LINE_HEIGHT, outline: 'none', overflow: 'auto',
              boxSizing: 'border-box',
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
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '4px 8px 8px',
          }}>
            {/* Row 1: actions + status + preview */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              flexWrap: 'wrap', minWidth: 0,
            }}>
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
                  {preloadHint && (
                    <span style={{ opacity: 0.75, marginLeft: 4 }}>{preloadHint}</span>
                  )}
                </span>
              )}

              {isPrepareReady && prepareState?.partialPlanPreview && !isStreaming && (
                <div
                  title={prepareState.partialPlanPreview}
                  style={{
                    fontSize: 10.5,
                    lineHeight: 1.4,
                    color: 'var(--caval-text-muted)',
                    flex: '1 1 120px',
                    minWidth: 0,
                    maxWidth: '100%',
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    maxHeight: '4.2em',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {prepareState.partialPlanPreview}
                </div>
              )}
            </div>

            {readinessHint && (
              <div style={{
                marginBottom: 6,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.45,
                color: '#F59E0B',
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}>
                {readinessHint}
              </div>
            )}

            {/* Row 2: model + send — always visible */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 6, flexShrink: 0, width: '100%', minWidth: 0,
            }}>
              <ChatModelSelect catalog={catalog} loading={catalogLoading} />
              {(() => {
                const sendDisabled = !isStreaming && !input.trim() && attachedFiles.length === 0;
                return (
                  <button
                    onClick={isStreaming ? stopStreaming : handleSend}
                    disabled={sendDisabled}
                    style={{
                      padding: '5px 14px', borderRadius: 6,
                      border: sendDisabled ? '1px solid var(--caval-border)' : 'none',
                      cursor: input.trim() || isStreaming || attachedFiles.length > 0 ? 'pointer' : 'default',
                      background: isStreaming
                        ? 'rgba(239,68,68,0.15)'
                        : sendDisabled
                          ? 'var(--caval-surface-raised)'
                          : 'var(--caval-accent)',
                      color: isStreaming
                        ? 'var(--caval-error)'
                        : sendDisabled
                          ? 'var(--caval-text-muted)'
                          : '#0E0E0F',
                      fontSize: 12, fontWeight: 700, transition: 'all 0.12s',
                      opacity: sendDisabled ? 0.65 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {isStreaming ? '■ Stop' : 'Trimite ↵'}
                  </button>
                );
              })()}
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
