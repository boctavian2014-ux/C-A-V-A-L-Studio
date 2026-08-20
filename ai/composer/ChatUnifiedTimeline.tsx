import React, { useMemo, useState } from 'react';
import type { TimelineEvent, TimelineEventType } from '../../src/shared/ai-timeline-contract';
import {
  MULTI_AGENT_LABELS,
  type MultiAgentStepRecord,
} from './chat-activity-types';
import { useAiSettingsStore } from '../../src/renderer/store/ai-settings-store';

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
  // WCAG AA-oriented accents on dark surface (~#0D1117)
  if (event.type === 'error' || event.success === false) return '#F87171';
  if (event.type === 'file_write' || event.success === true) return '#34D399';
  if (event.type === 'tool_call') return '#22D3EE';
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

function iconForType(type: TimelineEventType): string {
  switch (type) {
    case 'tool_call':
      return '›';
    case 'tool_result':
      return '·';
    case 'file_write':
      return '✎';
    case 'error':
      return '!';
    default:
      return '·';
  }
}

export function ChatUnifiedTimeline({
  message,
  onToggleExpanded,
}: {
  message: ChatMessageTimelineSource;
  onToggleExpanded?: (expanded: boolean) => void;
}) {
  const rows = useMemo(() => mergeUnifiedTimelineRows(message), [message]);
  const streaming = Boolean(message.isStreaming);
  const timelineDetail = useAiSettingsStore((s) => s.settings.timelineDetail);
  const [localExpanded, setLocalExpanded] = useState(timelineDetail === 'verbose');
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const expanded = streaming
    ? true
    : message.timelineExpanded ?? localExpanded;

  if (!rows.length) return null;

  const setExpanded = (next: boolean) => {
    setLocalExpanded(next);
    onToggleExpanded?.(next);
  };

  const visible = expanded ? rows : rows.slice(-2);
  const showDetail = timelineDetail === 'verbose';

  const toggleDetail = (id: string) => {
    setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="ai-timeline"
      data-testid="ai-unified-timeline"
      role="log"
      aria-live={streaming ? 'polite' : 'off'}
      aria-relevant="additions"
      aria-label="AI activity"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginBottom: 8,
        padding: '6px 8px',
        borderRadius: 6,
        background: 'var(--caval-bg-elevated, transparent)',
        border: '1px solid var(--caval-border)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--caval-text-muted)',
          fontSize: 9.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>
          AI activity · {rows.length} step{rows.length === 1 ? '' : 's'}
          {streaming ? ' · live' : ''}
        </span>
        <span style={{ textTransform: 'none', fontWeight: 500 }}>
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {visible.map((event) => {
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
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 11.5,
              color: event.type === 'error' ? rowTone(event) : 'var(--caval-text)',
              lineHeight: 1.35,
              cursor: hasDetail ? 'pointer' : 'default',
              outline: 'none',
            }}
          >
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: 'var(--caval-text-muted)',
                flexShrink: 0,
                minWidth: 58,
              }}
            >
              {formatTime(event.timestamp)}
            </span>
            <span
              aria-hidden="true"
              title={labelForTimelineType(event.type)}
              style={{
                width: 14,
                height: 14,
                marginTop: 1,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: rowTone(event),
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {iconForType(event.type)}
            </span>
            <span style={{ minWidth: 0 }}>
              <span>{event.label}</span>
              {hasDetail && detailOpen ? (
                <span
                  style={{
                    display: 'block',
                    fontSize: 10.5,
                    color: 'var(--caval-text-muted)',
                  }}
                >
                  {event.detail}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
