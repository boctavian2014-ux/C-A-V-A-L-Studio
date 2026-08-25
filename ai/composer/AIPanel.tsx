import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAIStore, getModelDisplayLabel, isChatStopIntent, ensurePipelineVerifyListener, type ChatMessage } from './ai-store';
import { ChatModelSelect } from './ChatModelSelect';
import { useModelCatalog } from './use-model-catalog';
import { useCavalTheme } from '../../themes/theme-provider';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import { getAgentMode, isAgenticPipelineMode } from '../modes/agent-modes';
import { getModelProfileSummary } from '../models/model-profile-ui';
import { ChatActivityTimeline } from './ChatActivityTimeline';
import { ChatUnifiedTimeline } from './ChatUnifiedTimeline';
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
import { WrittenFilesCard } from './WrittenFilesCard';
import { LiveAiFileCards, writtenFilesToEdits } from './LiveAiFileCards';
import { AiMessageDetails } from './AiMessageDetails';
import { AIOnboarding } from './AIOnboarding';
import { AiPanelToolbar } from './AiPanelToolbar';
import { MessageFeedbackButtons } from './MessageFeedback';
import { AiSettingsPanel } from './AiSettingsPanel';
import { HistoryList } from './HistoryList';
import { useAiHistoryStore } from '../../src/renderer/store/ai-history-store';
import { useAiSettingsStore } from '../../src/renderer/store/ai-settings-store';
import { extractShellCommandsFromAssistantText } from '../../src/shared/ai-terminal-contract';
import { SuggestedCommandsCard } from '../../src/renderer/components/terminal/SuggestedCommandsCard';
import { useTranslation } from '../i18n/useTranslation';
import { useLiveAiEdits } from './use-live-ai-edits';
import { joinWorkspaceRelativePath } from './written-files';
import { dispatchOpenExplorerSidebar } from '../../src/renderer/components/engineering/bootstrap-robotics-project';
import { usePreviewStore } from '../../src/renderer/store/preview-store';

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
  const { t } = useTranslation();
  const { applyDiff, rejectDiff, rollbackDiff } = useAIStore();
  const diff = message.diff!;
  const fileName = diff.filePath.split(/[/\\]/).pop() ?? diff.filePath;

  if (diff.applied) {
    return (
      <div style={{
        marginTop: 10, padding: '8px 12px', borderRadius: 6,
        background: 'rgba(47,191,113,0.08)', border: '1px solid rgba(47,191,113,0.25)',
        fontSize: 11.5, color: 'var(--caval-success)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1 }}>{t('ai.diff.applied', { file: fileName })}</span>
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
            {t('ai.diff.undo')}
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
          ✓ {t('ai.diff.apply')}
        </button>
        <button
          onClick={() => rejectDiff(message.id)}
          style={{
            padding: '4px 12px', borderRadius: 5,
            border: '1px solid var(--caval-border)', background: 'none',
            color: 'var(--caval-text-muted)', fontSize: 11.5, cursor: 'pointer',
          }}
        >
          {t('ai.diff.reject')}
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
  const activeFileLabel = useEditorStore((s) => {
    const id = s.activeTabId;
    if (!id) return null;
    const tab = s.tabs.find((t) => t.id === id);
    return tab?.name ?? tab?.path ?? null;
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
        activeFile: activeFileLabel ?? undefined,
        steps: message.multiAgentSteps,
        modules: message.reasoningBrief?.modules,
        model: message.resolvedModel ?? message.model,
        writtenFiles: message.writtenFiles,
      }),
    [
      projectTitle,
      activeFileLabel,
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

  const hasTimeline = (message.timelineEvents?.length ?? 0) > 0 ||
    (message.multiAgentSteps?.length ?? 0) > 0;

  const hasDetails = Boolean(
    (message.activitySteps?.length ?? 0) > 0 ||
      liveReasoning ||
      message.reasoningBrief ||
      message.recap ||
      showRoleMap ||
      needsReview ||
      planText
  );

  const { t } = useTranslation();

  return (
    <>
      {isStreaming && !(message.writtenFiles?.length) ? <StreamingDots /> : null}
      {!isStreaming && (message.writtenFiles?.length ?? 0) > 0 ? (
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', marginBottom: 4 }}>
          {t('ai.files.createdCount', { count: message.writtenFiles!.length })}
        </div>
      ) : null}
      {hasTimeline ? <ChatUnifiedTimeline message={message} /> : null}
      <AiMessageDetails hasContent={hasDetails}>
        {needsReview ? <MandatoryReviewBadge /> : null}
        {cfg.showPipelineTimeline && (message.multiAgentSteps?.length ?? 0) > 0 && (
          <MultiAgentTimeline
            steps={message.multiAgentSteps!}
            showSteps={false}
            collapsed={Boolean(message.recap)}
            waitMessage={showWait ? waitMessage : undefined}
            waitStatusLine={showWait ? waitStatusLine : undefined}
            waitVisible={waitVisible}
            completionMessage={completionMessage}
            showCompletionHorse={showCompletionHorse}
            completionNeedsReview={needsReview}
          />
        )}
        {isStreaming &&
          (message.activitySteps?.length ?? 0) > 0 &&
          !(message.timelineEvents?.length) && (
          <ChatActivityTimeline
            steps={message.activitySteps!}
            collapsed={Boolean(message.recap || message.reasoningBrief)}
          />
        )}
        {cfg.showLiveReasoning && liveReasoning && (
          <ChatReasoningBlock
            reasoning={liveReasoning}
            isStreaming={Boolean(isStreaming && !message.recap)}
            defaultExpanded={message.reasoningExpanded ?? false}
          />
        )}
        {message.reasoningBrief && !message.recap && (
          <CompactArenaStatus
            live={isStreaming}
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
                ? t('ai.files.createdCount', { count: message.writtenFiles.length })
                : '')
            }
          />
        )}
      </AiMessageDetails>
    </>
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
  const { t } = useTranslation();
  const projectPath = useEditorStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);
  const activeEditorPath = useEditorStore((s) => {
    const id = s.activeTabId;
    if (!id) return null;
    return s.tabs.find((tab) => tab.id === id)?.path ?? null;
  });
  const isUser = message.role === 'user';
  const shellCommands = useMemo(() => {
    if (isUser || message.isStreaming || !message.content) return [];
    return extractShellCommandsFromAssistantText(message.content);
  }, [isUser, message.content, message.isStreaming]);
  const { modelLabels, agentMode } = useAIStore();
  const arenaMode = isAgenticPipelineMode(agentMode);
  const selectionLabel = message.model ? getModelDisplayLabel(message.model, modelLabels) : null;
  const resolvedLabel = message.resolvedModel
    ? getModelDisplayLabel(message.resolvedModel, modelLabels)
    : null;
  const effectiveModelId = message.resolvedModel ?? message.model ?? '';
  const modelLabel = arenaMode
    ? resolvedLabel ?? t('ai.chat.multiModelShort')
    : resolvedLabel && selectionLabel && resolvedLabel !== selectionLabel && message.model?.startsWith('caval-auto/')
      ? `${selectionLabel} → ${resolvedLabel}`
      : resolvedLabel ?? selectionLabel ?? t('ai.chat.modelFallback');

  const senderLabel = isUser ? t('ai.chat.userLabel') : t('ai.chat.agenticSender');

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

  const nonAgenticDetails = Boolean(
    !isUser &&
      !arenaMode &&
      ((message.activitySteps?.length ?? 0) > 0 ||
        Boolean(message.reasoning) ||
        Boolean(effectiveModelId))
  );

  const nonAgenticTimeline = !isUser && !arenaMode && (
    (message.timelineEvents?.length ?? 0) > 0 ||
    (message.multiAgentSteps?.length ?? 0) > 0
  );

  const completedFilePaths = useMemo(() => {
    if (message.historicalWrittenFiles?.length) {
      return message.historicalWrittenFiles.map((row) => row.filePath);
    }
    return message.writtenFiles ?? [];
  }, [message.historicalWrittenFiles, message.writtenFiles]);

  const openRelFile = useCallback(
    (rel: string) => {
      if (!projectPath) return;
      void openFile(joinWorkspaceRelativePath(projectPath, rel));
    },
    [openFile, projectPath]
  );

  return (
    <article
      className={`chat-message${isUser ? ' chat-message-user' : ' chat-message-assistant'}`}
      data-testid={`chat-message-${message.role}`}
    >
      <header className="chat-message-header">
        <span
          className={`chat-message-avatar${isUser ? ' chat-message-avatar-user' : ' chat-message-avatar-assistant'}`}
          aria-hidden="true"
        />
        <span className="chat-message-sender">{senderLabel}</span>
        {!isUser && modelLabel ? (
          <>
            <span className="chat-message-meta-sep" aria-hidden="true">·</span>
            <span className="chat-message-model">{modelLabel}</span>
          </>
        ) : null}
      </header>

      <div className="chat-message-body">
        {!isUser && arenaMode ? (
          message.isStreaming ||
          message.reasoningBrief ||
          message.recap ||
          (message.multiAgentSteps?.length ?? 0) > 0 ||
          (message.timelineEvents?.length ?? 0) > 0 ||
          Boolean(message.reasoning) ? (
            <ArenaWorkPanel message={message} />
          ) : (
            <CompactArenaStatus
              text={
                arenaStatusText ||
                (message.writtenFiles?.length
                  ? t('ai.files.createdCount', { count: message.writtenFiles.length })
                  : '')
              }
            />
          )
        ) : message.isStreaming && message.activitySteps?.length && !(message.timelineEvents?.length) ? (
          <>
            {message.content ? (
              <StreamingText content={message.content} />
            ) : (
              <StreamingDots />
            )}
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

        {!isUser && !arenaMode ? (
          <>
            {nonAgenticTimeline ? <ChatUnifiedTimeline message={message} /> : null}
            <AiMessageDetails hasContent={nonAgenticDetails}>
              {message.reasoning ? (
                <ChatReasoningBlock
                  reasoning={message.reasoning}
                  isStreaming={Boolean(message.isStreaming && !message.content)}
                  defaultExpanded={false}
                />
              ) : null}
              {(message.activitySteps?.length ?? 0) > 0 && !(message.timelineEvents?.length) ? (
                <ChatActivityTimeline
                  steps={message.activitySteps!}
                  collapsed={Boolean(message.content)}
                />
              ) : null}
              {effectiveModelId ? <ModelProfileChips modelId={effectiveModelId} /> : null}
            </AiMessageDetails>
          </>
        ) : null}

        {/* Diff block dacă există */}
        {message.diff && !message.isStreaming && !message.diff.autoApplied && !arenaMode && (
          <DiffBlock message={message} />
        )}

        {!isUser && message.proposedWrites && message.proposedWrites.length > 0 && (
          <WrittenFilesCard
            proposedWrites={message.proposedWrites}
            messageId={message.id}
          />
        )}

        {!isUser &&
          !message.isStreaming &&
          completedFilePaths.length > 0 &&
          !(message.proposedWrites && message.proposedWrites.length > 0) && (
          <LiveAiFileCards
            mode="completed"
            edits={writtenFilesToEdits(completedFilePaths)}
            onOpen={openRelFile}
            activeEditorPath={activeEditorPath}
            projectPath={projectPath}
            onOpenWebPreview={() => {
              dispatchOpenExplorerSidebar();
              usePreviewStore.getState().activatePreview('web', null);
              void window.caval?.preview?.start('web');
            }}
            onOpenMobilePreview={() => {
              dispatchOpenExplorerSidebar();
              usePreviewStore.getState().activatePreview('mobile', null);
              void window.caval?.preview?.start('mobile');
            }}
          />
        )}

        {!isUser && !message.isStreaming && shellCommands.length > 0 && (
          <SuggestedCommandsCard commands={shellCommands} />
        )}

        {!isUser && !message.isStreaming && !message.error && (
          <MessageFeedbackButtons messageId={message.id} streamId={message.streamId} />
        )}

        {message.error && (
          <div className="chat-message-error" role="alert">
            {message.error}
          </div>
        )}
      </div>
    </article>
  );
}

function CompactArenaStatus({ text, live }: { text: string; live?: boolean }) {
  return (
    <div
      title={text}
      className={live ? 'caval-stream-text' : undefined}
      style={{
        fontSize: live ? 10 : 12,
        lineHeight: live ? 1.45 : 1.45,
        letterSpacing: live ? '0.05em' : undefined,
        fontFamily: live ? "'JetBrains Mono', ui-monospace, monospace" : undefined,
        color: live ? 'rgba(186, 230, 253, 0.62)' : 'var(--caval-text-muted)',
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
  const activeFileLabel = useEditorStore((s) => {
    const id = s.activeTabId;
    if (!id) return null;
    const tab = s.tabs.find((t) => t.id === id);
    return tab?.name ?? tab?.path ?? null;
  });
  const waitCtx = useMemo(
    () =>
      buildWaitSceneContext({
        projectTitle: workspaceFolderTitle(projectPath),
        activeFile: activeFileLabel ?? undefined,
      }),
    [projectPath, activeFileLabel]
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
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10,
        lineHeight: 1.42,
        letterSpacing: '0.055em',
        fontWeight: 400,
        color: 'rgba(186, 230, 253, 0.58)',
      }}
    >
      {content}
      <span className="caval-stream-cursor" aria-hidden="true" />
    </div>
  );
}

function MandatoryReviewBadge() {
  const { t } = useTranslation();
  return (
    <div className="chat-review-badge" title={t('ai.panel.readyToUseGateTitle')}>
      <span className="chat-review-badge-dot" aria-hidden="true" />
      <span>{t('ai.panel.mandatoryReviewActive')}</span>
      <span className="chat-review-badge-hint">{t('ai.panel.readyToUseGate')}</span>
    </div>
  );
}

// ──────────────────────────────────────────────
//  AIPanel — componenta principală
// ──────────────────────────────────────────────

function StickyLiveAiFiles() {
  const liveEdits = useLiveAiEdits();
  const projectPath = useEditorStore((s) => s.projectPath);
  const openFile = useEditorStore((s) => s.openFile);
  const activeEditorPath = useEditorStore((s) => {
    const id = s.activeTabId;
    if (!id) return null;
    return s.tabs.find((tab) => tab.id === id)?.path ?? null;
  });
  const isStreaming = useAIStore((s) => s.isStreaming);

  useEffect(() => {
    if (liveEdits.length > 0) {
      void import('./live-ai-edit-styles.js').then((m) => m.ensureLiveAiEditStyles());
    }
  }, [liveEdits.length]);

  if (!liveEdits.length) return null;

  return (
    <div
      data-testid="sticky-live-ai-files"
      style={{ flexShrink: 0, padding: '0 10px 8px' }}
    >
      <LiveAiFileCards
        mode="streaming"
        edits={liveEdits}
        isStreaming={isStreaming}
        onOpen={(rel) => {
          if (!projectPath) return;
          void openFile(joinWorkspaceRelativePath(projectPath, rel));
        }}
        activeEditorPath={activeEditorPath}
        projectPath={projectPath}
      />
    </div>
  );
}

export function AIPanel({ onClose, onOpenComposer }: { onClose?: () => void; onOpenComposer?: () => void }) {
  const { theme } = useCavalTheme();
  const { t } = useTranslation();
  const {
    messages, isStreaming,
    sendMessage, stopStreaming, clearChat, loadModelLabels,
    newThread,
    attachedFiles, addAttachments, removeAttachment,
    prepareState, prepareInFlight, chatPrepareDraft, clearPrepareState,
    selectedModel, pendingChatDraft, clearPendingChatDraft, pendingAutoSend,
    agentMode, apiKeys,
    modeSwitchNotice, clearModeSwitchNotice,
  } = useAIStore();

  const { catalog, loading: catalogLoading, refresh: refreshCatalog } = useModelCatalog();
  const modeDef = getAgentMode(agentMode);
  const isAgentic = isAgenticPipelineMode(agentMode);
  const inputPlaceholder = isStreaming
    ? t('ai.panel.placeholder.stop')
    : t('chat.inputPlaceholder');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  const [preloadHint, setPreloadHint] = useState('');
  const [readinessHint, setReadinessHint] = useState<string | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);

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
  /** Paths only — do not subscribe to tab `content` (live AI edits would re-render the whole chat). */
  const openFilePathsKey = useEditorStore((s) => s.tabs.map((t) => t.path).join('\0'));
  const activeTabPath = useEditorStore((s) => {
    const id = s.activeTabId;
    return id ? (s.tabs.find((t) => t.id === id)?.path ?? null) : null;
  });
  const openFilePaths = useMemo(
    () => (openFilePathsKey ? openFilePathsKey.split('\0') : []),
    [openFilePathsKey]
  );
  const historyConversations = useAiHistoryStore((s) => s.conversations);
  const historyLoading = useAiHistoryStore((s) => s.loading);
  const activeHistoryId = useAiHistoryStore((s) => s.activeHistoryId);
  const historyExportBusy = useAiHistoryStore((s) => s.exportBusy);
  const refreshHistory = useAiHistoryStore((s) => s.refresh);
  const openHistoryConversation = useAiHistoryStore((s) => s.openConversation);
  const deleteHistoryConversation = useAiHistoryStore((s) => s.deleteConversation);
  const exportHistoryConversation = useAiHistoryStore((s) => s.exportConversation);
  const loadMoreHistory = useAiHistoryStore((s) => s.loadMore);
  const historyHasMore = useAiHistoryStore((s) => s.hasMore);
  const historyLoadingMore = useAiHistoryStore((s) => s.loadingMore);
  const activeThreadId = useAIStore((s) => s.activeThreadId);
  const exportConversationId = activeHistoryId ?? activeThreadId;
  const [showAiSettings, setShowAiSettings] = useState(false);
  const refreshAiSettings = useAiSettingsStore((s) => s.refresh);

  useEffect(() => {
    void refreshHistory();
  }, [projectPath, refreshHistory]);

  useEffect(() => {
    void refreshAiSettings();
  }, [projectPath, refreshAiSettings]);

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

  // Zero-Latency Fusion: warm once when workspace / open-file set changes (not on tab content).
  useEffect(() => {
    if (!projectPath) return;
    void window.caval?.zlPanelOpen?.({
      workspaceRoot: projectPath,
      activeFile: activeTabPath ?? undefined,
      openFiles: openFilePaths,
    });
  }, [projectPath, openFilePathsKey, activeTabPath, openFilePaths]);

  // Zero-Latency: prepare while user types (350ms debounce)
  useEffect(() => {
    if (!input.trim()) {
      clearPrepareState();
      return;
    }
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = setTimeout(() => {
      void chatPrepareDraft({
        text: input,
        projectPath,
        activeFile: activeTabPath ?? undefined,
        openFiles: openFilePaths,
      });
    }, input.length > 500
      ? DEFAULT_ZERO_LATENCY_CONFIG.typingDebounceMs * 2
      : DEFAULT_ZERO_LATENCY_CONFIG.typingDebounceMs);
    return () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    };
  }, [input, projectPath, activeTabPath, openFilePaths, chatPrepareDraft, clearPrepareState]);

  // Auto-scroll: stick to bottom without smooth scroll (smooth + token updates = jitter)
  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const stick = isStreaming || distanceFromBottom < 96;
    if (!stick) return;

    container.scrollTop = container.scrollHeight;
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

  const composerStatusPrefix = Boolean(
    isStreaming ||
      projectPath ||
      ((isPrepareReady || (prepareInFlight && input.trim())) && !isStreaming)
  );

  return (
    <div style={{
      width: panelWidth,
      height: '100%',
      minHeight: 0,
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
      <header className="chat-panel-header">
        <div className="chat-panel-header-row">
          <div className="chat-panel-title">
            <span className="chat-panel-brand">{t('ai.panel.headerBrand')}</span>
            <span className="chat-panel-title-sep" aria-hidden="true">/</span>
            <span className="chat-panel-context">
              {isAgentic ? t('ai.panel.headerContext') : modeDef.label}
            </span>
          </div>
          <div className="chat-panel-header-actions">
        <button
          type="button"
          data-testid="ai-settings-open"
          className={`chat-panel-icon-btn${showAiSettings ? ' chat-panel-icon-btn-active' : ''}`}
          onClick={() => setShowAiSettings((v) => !v)}
          title={t('ai.panel.settings')}
          aria-label={t('ai.panel.settings')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" strokeLinecap="round" />
          </svg>
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            className="chat-panel-icon-btn"
            onClick={clearChat}
            title={t('ai.panel.clearChat')}
            aria-label={t('ai.panel.clearChat')}
          >
            ↺
          </button>
        )}

        {onClose && (
          <button
            type="button"
            className="chat-panel-icon-btn"
            onClick={onClose}
            title={t('ai.panel.close')}
            aria-label={t('ai.panel.close')}
          >
            ✕
          </button>
        )}
          </div>
        </div>
        <AiPanelToolbar
          isStreaming={isStreaming}
          onStartChat={(prompt) => {
            if (prompt.trim()) void sendMessage(prompt.trim());
          }}
        />
      </header>

      {showAiSettings ? (
        <AiSettingsPanel onClose={() => setShowAiSettings(false)} />
      ) : (
      <>
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
          title={t('ai.panel.activeFolderHint')}
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
          className="chat-panel-new-chat-btn"
          onClick={() => {
            newThread();
            useAiHistoryStore.setState({ activeHistoryId: null });
            void refreshHistory();
          }}
          title={t('ai.panel.newChat')}
        >
          {t('ai.panel.newChat')}
        </button>
      </div>

      {projectPath && (
        <div
          data-testid="ai-history-list"
          style={{
            maxHeight: historyExpanded ? 132 : undefined,
            overflowY: historyExpanded ? 'auto' : 'hidden',
            borderBottom: `1px solid ${theme.colors.border}`,
            flexShrink: 0,
            padding: `4px ${PANEL_PAD_X}px 6px`,
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--caval-text-muted)',
              marginBottom: historyExpanded ? 4 : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <button
              type="button"
              data-testid="ai-history-toggle"
              aria-expanded={historyExpanded}
              title={historyExpanded ? t('ai.history.collapse') : t('ai.history.expand')}
              onClick={() => setHistoryExpanded((open) => !open)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                letterSpacing: 'inherit',
                textTransform: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>
                {historyExpanded
                  ? `${t('ai.history.title')}${historyLoading ? ' …' : ''}`
                  : t('ai.history.count', { count: historyConversations.length })}
              </span>
              <span aria-hidden="true" style={{ fontSize: 8 }}>{historyExpanded ? '▴' : '▾'}</span>
            </button>
            {historyExpanded && exportConversationId ? (
              <span data-testid="ai-history-export-actions" style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  data-testid="ai-history-export-md"
                  disabled={historyExportBusy}
                  title={t('ai.history.exportMd')}
                  onClick={() => void exportHistoryConversation(exportConversationId, 'markdown')}
                  style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    borderRadius: 3,
                    border: '1px solid var(--caval-accent-ring)',
                    background: 'transparent',
                    color: 'var(--caval-accent)',
                    cursor: historyExportBusy ? 'wait' : 'pointer',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  MD
                </button>
                <button
                  type="button"
                  data-testid="ai-history-export-json"
                  disabled={historyExportBusy}
                  title={t('ai.history.exportJson')}
                  onClick={() => void exportHistoryConversation(exportConversationId, 'json')}
                  style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    borderRadius: 3,
                    border: '1px solid var(--caval-accent-ring)',
                    background: 'transparent',
                    color: 'var(--caval-accent)',
                    cursor: historyExportBusy ? 'wait' : 'pointer',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  JSON
                </button>
              </span>
            ) : null}
          </div>
          {historyExpanded && (
            historyConversations.length === 0 && !historyLoading ? (
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
                {t('ai.history.empty')}
              </div>
            ) : (
              <HistoryList
                conversations={historyConversations}
                activeId={activeHistoryId}
                hasMore={historyHasMore}
                loadingMore={historyLoadingMore}
                onSelect={(id) => void openHistoryConversation(id)}
                onDelete={(id) => {
                  void deleteHistoryConversation(id).then(() => refreshHistory());
                }}
                onLoadMore={() => void loadMoreHistory()}
              />
            )
          )}
        </div>
      )}

      {/* ── Messages ───────────────────────── */}
      <div ref={messagesScrollRef} className="ai-messages-scroll caval-selectable chat-messages-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: messages.length === 0 ? 0 : `${PANEL_PAD_X}px`,
        display: 'flex', flexDirection: 'column', gap: 12,
        overscrollBehavior: 'contain',
      }}>
        {messages.length === 0 ? (
          <AIOnboarding />
        ) : (
          <>
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <StickyLiveAiFiles />

      {/* ── Input ──────────────────────────── */}
      <footer className="chat-composer-footer">
        {(modeSwitchNotice && !isAgentic) || (agentMode === 'code' && selectedModel.startsWith('caval-auto/')) || readinessHint ? (
          <div className="chat-composer-notices">
            {modeSwitchNotice && !isAgentic ? (
              <div className="chat-composer-notice">
                <span>{modeSwitchNotice}</span>
                <button type="button" onClick={() => clearModeSwitchNotice()} aria-label={t('ai.panel.dismissNotice')}>✕</button>
              </div>
            ) : null}
            {agentMode === 'code' && selectedModel.startsWith('caval-auto/') ? (
              <div className="chat-composer-notice chat-composer-notice-muted" title={t('ai.panel.autoRouteHint')}>
                {t('ai.panel.autoRouteHint')}
              </div>
            ) : null}
            {readinessHint ? (
              <div className="chat-composer-notice chat-composer-notice-warning" role="status">
                {readinessHint}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="chat-composer-card">
          <textarea
            ref={textareaRef}
            className="chat-composer-input"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            rows={ARENA_INPUT_MIN_ROWS}
            style={{
              height: textareaHeight,
              minHeight: ARENA_INPUT_MIN_HEIGHT,
              maxHeight: ARENA_INPUT_MAX_HEIGHT,
            }}
          />
          {attachedFiles.length > 0 && (
            <div className="chat-composer-attachments">
              {attachedFiles.map((file) => (
                <span key={file.id} className="chat-composer-attachment-chip" title={file.path}>
                  <span className="chat-composer-attachment-name">
                    {file.path.startsWith('engineering://') ? 'CAD' : 'File'} {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(file.id)}
                    title={t('ai.panel.removeAttachment')}
                    aria-label={t('ai.panel.removeAttachment')}
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

          <div className="chat-composer-toolbar">
            <div className="chat-composer-toolbar-left">
              <IconBtn title={t('ai.panel.attachFile')} onClick={() => void handleAttachClick()} ariaLabel={t('ai.panel.attachFile')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <path d="M12.5 8.5L7 14a4 4 0 01-5.66-5.66l7-7a2.5 2.5 0 013.54 3.54L5.5 11.5a1 1 0 01-1.42-1.42L10 4" strokeLinecap="round" />
                </svg>
              </IconBtn>
              <IconBtn
                title={t('ai.panel.refreshModels')}
                onClick={() => void refreshCatalog()}
                ariaLabel={t('ai.panel.refreshModels')}
              >
                <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">↻</span>
              </IconBtn>
              {onOpenComposer && (
                <IconBtn title={t('ai.panel.openComposer')} onClick={onOpenComposer} ariaLabel={t('ai.panel.openComposer')}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                    <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
                  </svg>
                </IconBtn>
              )}
            </div>

            <div
              className="chat-composer-status"
              title={[
                isStreaming ? t('ai.panel.statusActive') : null,
                projectPath ? t('ai.panel.workspaceContext') : null,
                isPrepareReady ? t('ai.panel.prepareReady') : prepareInFlight && input.trim() ? t('ai.panel.prepareBusy') : null,
                prepareState?.partialPlanPreview ?? null,
                preloadHint ?? null,
              ].filter(Boolean).join(' · ')}
            >
              {isStreaming ? (
                <span className="chat-composer-status-item">{t('ai.panel.statusActive')}</span>
              ) : null}
              {isStreaming && projectPath ? (
                <span className="chat-composer-status-sep" aria-hidden="true">·</span>
              ) : null}
              {projectPath ? (
                <span className="chat-composer-status-item chat-composer-status-muted">
                  {t('ai.panel.workspaceContext')}
                </span>
              ) : null}
              {(isStreaming || projectPath) && (isPrepareReady || (prepareInFlight && input.trim())) ? (
                <span className="chat-composer-status-sep" aria-hidden="true">·</span>
              ) : null}
              {(isPrepareReady || (prepareInFlight && input.trim())) && !isStreaming ? (
                <span className={`chat-composer-status-item${isPrepareReady ? ' chat-composer-status-ready' : ''}`}>
                  <span className="chat-composer-status-dot" aria-hidden="true" />
                  {isPrepareReady ? t('ai.panel.prepareReady') : t('ai.panel.prepareBusy')}
                </span>
              ) : null}
              {composerStatusPrefix ? (
                <span className="chat-composer-status-sep" aria-hidden="true">·</span>
              ) : null}
              <ChatModelSelect catalog={catalog} loading={catalogLoading} variant="compact" />
            </div>

            <div className="chat-composer-toolbar-right">
              {(() => {
                const sendDisabled = !isStreaming && !input.trim() && attachedFiles.length === 0;
                return (
                  <button
                    type="button"
                    className={`chat-composer-send${isStreaming ? ' chat-composer-send-stop' : ''}${sendDisabled ? ' chat-composer-send-disabled' : ''}`}
                    onClick={isStreaming ? stopStreaming : handleSend}
                    disabled={sendDisabled}
                    title={isStreaming ? t('ai.panel.stop') : t('ai.panel.send')}
                  >
                    <span>{isStreaming ? t('ai.panel.stop') : t('ai.panel.sendLabel')}</span>
                    {!isStreaming ? (
                      <kbd className="chat-composer-send-hint" aria-hidden="true">{t('ai.panel.sendHint')}</kbd>
                    ) : null}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </footer>
      </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
//  Icon button helper
// ──────────────────────────────────────────────

function IconBtn({ title, onClick, children, ariaLabel }: { title: string; onClick?: () => void; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <button
      type="button"
      className="chat-composer-icon-btn"
      title={title}
      aria-label={ariaLabel ?? title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
