import React, { useMemo, useState } from 'react';
import type { TimelineEvent, TimelineEventType } from '../../src/shared/ai-timeline-contract';
import {
  MULTI_AGENT_LABELS,
  type MultiAgentStepRecord,
} from './chat-activity-types';
import { useAiSettingsStore } from '../../src/renderer/store/ai-settings-store';
import { useTranslation } from '../i18n/useTranslation';

export interface ChatMessageTimelineSource {
  timelineEvents?: TimelineEvent[];
  multiAgentSteps?: MultiAgentStepRecord[];
  isStreaming?: boolean;
  timelineExpanded?: boolean;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

function maStepLabel(step: MultiAgentStepRecord): string {
  if (step.stepId?.startsWith('modelOrch-')) {
    return step.detail ?? MULTI_AGENT_LABELS.modelOrch;
  }
  if (step.stepId?.startsWith('subagent-')) {
    return `Implementer · ${step.detail ?? step.stepId.replace('subagent-', '')}`;
  }
  return MULTI_AGENT_LABELS[step.phase] ?? step.phase;
}

/** Merge stream timeline events with multi-agent steps into one chronological list. */
export function mergeUnifiedTimelineRows(
  message: ChatMessageTimelineSource
): TimelineEvent[] {
  const fromStream = (message.timelineEvents ?? []).map((e) => ({ ...e }));
  const seen = new Set(fromStream.map((e) => e.id));

  for (const step of message.multiAgentSteps ?? []) {
    const id = `ma-${step.stepId ?? step.phase}-${step.at}`;
    if (seen.has(id)) continue;
    seen.add(id);
    fromStream.push({
      id,
      type: 'reasoning',
      timestamp: step.at,
      label: maStepLabel(step),
      detail: step.modelId ? `model ${step.modelId}` : undefined,
      success: step.status === 'done' ? true : undefined,
    });
  }

  return fromStream.sort((a, b) => a.timestamp - b.timestamp);
}

function rowTone(event: TimelineEvent): string {
  if (event.type === 'error' || event.success === false) return 'var(--caval-error)';
  if (event.type === 'file_write' || event.success === true) return 'var(--caval-success)';
  if (event.type === 'tool_call') return 'var(--caval-accent)';
  return 'var(--caval-text-muted)';
}

export function labelForTimelineType(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    reasoning: 'Reasoning',
    tool_call: 'Tool call',
    tool_result: 'Tool result',
    file_write: 'File written',
    error: 'Error',
  };
  return labels[type] ?? type;
}

export function ChatUnifiedTimeline({
  message,
  onToggleExpanded,
}: {
  message: ChatMessageTimelineSource;
  onToggleExpanded?: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => mergeUnifiedTimelineRows(message), [message]);
  const streaming = Boolean(message.isStreaming);
  const timelineDetail = useAiSettingsStore((s) => s.settings.timelineDetail);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const expanded = streaming
    ? true
    : message.timelineExpanded ?? localExpanded;

  if (!rows.length) return null;

  const setExpanded = (next: boolean) => {
    setLocalExpanded(next);
    onToggleExpanded?.(next);
  };

  const showDetail = timelineDetail === 'verbose';

  const toggleDetail = (id: string) => {
    setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLabel = t('ai.timeline.activitySteps', { count: rows.length });

  return (
    <div
      className="ai-timeline ai-timeline-compact"
      data-testid="ai-unified-timeline"
      role="log"
      aria-live={streaming ? 'polite' : 'off'}
      aria-relevant="additions"
      aria-label={t('ai.timeline.activityAria')}
    >
      <button
        type="button"
        className="ai-timeline-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="ai-timeline-chevron" aria-hidden="true">
          {expanded ? '▾' : '›'}
        </span>
        <span>{toggleLabel}</span>
        {streaming ? (
          <span className="ai-timeline-live">{t('ai.timeline.live')}</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="ai-timeline-steps" role="list">
          {rows.map((event) => {
            const detailOpen = Boolean(openDetails[event.id]) || showDetail;
            const hasDetail = Boolean(event.detail);
            return (
              <div
                key={event.id}
                role="listitem"
                tabIndex={0}
                data-testid="ai-timeline-event"
                className={`timeline-event timeline-${event.type}`}
                aria-label={`${labelForTimelineType(event.type)}: ${event.label}`}
                aria-expanded={hasDetail ? detailOpen : undefined}
                onKeyDown={(e) => {
                  if (!hasDetail) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleDetail(event.id);
                  }
                }}
                onClick={() => {
                  if (hasDetail) toggleDetail(event.id);
                }}
              >
                <span className="ai-timeline-time">{formatTime(event.timestamp)}</span>
                <span
                  className="ai-timeline-dot"
                  aria-hidden="true"
                  style={{ color: rowTone(event) }}
                />
                <span className="ai-timeline-label">
                  <span>{event.label}</span>
                  {hasDetail && detailOpen ? (
                    <span className="ai-timeline-detail">{event.detail}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
