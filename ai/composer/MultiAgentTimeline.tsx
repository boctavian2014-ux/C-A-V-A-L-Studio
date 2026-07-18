import React from 'react';
import {
  MULTI_AGENT_LABELS,
  shortModelLabel,
  type MultiAgentStepRecord,
} from './chat-activity-types';
import { CavaloHorseMark } from '../../src/renderer/components/brand/CavaloHorseMark';
import { getWaitGlowFilter, getWaitGlowBoxShadow, getCompletionGlowFilter, getCompletionGlowBoxShadow, activePhaseFromSteps } from './arena-wait-copy';

interface MultiAgentTimelineProps {
  steps: MultiAgentStepRecord[];
  collapsed?: boolean;
  waitMessage?: string;
  waitStatusLine?: string;
  waitVisible?: boolean;
  completionMessage?: string;
  showCompletionHorse?: boolean;
  completionNeedsReview?: boolean;
}

function StepIcon({ status }: { status: MultiAgentStepRecord['status'] }) {
  if (status === 'done') {
    return (
      <span style={{ color: 'var(--caval-success)', fontSize: 11, width: 14, textAlign: 'center' }}>
        ✓
      </span>
    );
  }
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: 'var(--caval-accent)',
        display: 'inline-block',
        animation: 'zl-step-pulse 1s ease-in-out infinite',
      }}
    />
  );
}

function ModelBadge({ modelId }: { modelId: string }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontFamily: 'JetBrains Mono, monospace',
        padding: '1px 6px',
        borderRadius: 4,
        background: 'var(--caval-bg-elevated)',
        border: '1px solid var(--caval-border)',
        color: 'var(--caval-accent)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      title={modelId}
    >
      {shortModelLabel(modelId)}
    </span>
  );
}

function AuditBadge({ badge }: { badge: string }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontFamily: 'JetBrains Mono, monospace',
        padding: '1px 6px',
        borderRadius: 4,
        background: 'rgba(99, 102, 241, 0.12)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        color: 'var(--caval-text-muted)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      title="Self-audit scores"
    >
      {badge}
    </span>
  );
}

function stepLabel(step: MultiAgentStepRecord): string {
  if (step.stepId?.startsWith('modelOrch-')) {
    return step.detail ?? MULTI_AGENT_LABELS.modelOrch;
  }
  if (step.stepId?.startsWith('subagent-')) {
    return `Implementer · ${step.detail ?? step.stepId.replace('subagent-', '')}`;
  }
  return MULTI_AGENT_LABELS[step.phase] ?? step.phase;
}

export function MultiAgentTimeline({
  steps,
  collapsed,
  waitMessage,
  waitStatusLine,
  waitVisible = true,
  completionMessage,
  showCompletionHorse = false,
  completionNeedsReview = false,
}: MultiAgentTimelineProps) {
  if (!steps.length) return null;

  const activeIdx = steps.findIndex((s) => s.status === 'active');
  const displaySteps = collapsed
    ? steps.filter((s) => s.status === 'active').slice(-1)
    : steps;

  const visible =
    displaySteps.length > 0
      ? displaySteps
      : activeIdx >= 0
        ? steps.slice(0, activeIdx + 1)
        : steps.slice(-8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--caval-text-muted)',
        }}
      >
        Pipeline · multi-model
      </div>
      {visible.map((step) => (
        <div
          key={`${step.stepId ?? step.phase}-${step.at}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            color: step.status === 'active' ? 'var(--caval-text)' : 'var(--caval-text-muted)',
            flexWrap: 'wrap',
          }}
        >
          <StepIcon status={step.status} />
          <span>{stepLabel(step)}</span>
          {step.modelId ? <ModelBadge modelId={step.modelId} /> : null}
          {step.auditBadge ? <AuditBadge badge={step.auditBadge} /> : null}
          {step.detail &&
          !step.stepId?.startsWith('modelOrch-') &&
          !step.stepId?.startsWith('subagent-') ? (
            <span style={{ fontSize: 10.5, opacity: 0.85 }}>{step.detail}</span>
          ) : null}
        </div>
      ))}
      {waitMessage ? (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <div
            className="arena-horse-wait-mark"
            style={{
              flexShrink: 0,
              lineHeight: 0,
              borderRadius: 8,
              boxShadow: getWaitGlowBoxShadow(activePhaseFromSteps(steps)),
              transition: 'box-shadow 0.45s ease',
            }}
          >
            <CavaloHorseMark
              size={28}
              glowFilter={getWaitGlowFilter(activePhaseFromSteps(steps))}
            />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: 'var(--caval-text)',
                opacity: waitVisible ? 1 : 0,
                transition: 'opacity 0.28s ease',
              }}
            >
              {waitMessage}
            </div>
            {waitStatusLine ? (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10.5,
                  color: 'var(--caval-text-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {waitStatusLine}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {showCompletionHorse && completionMessage ? (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <div
            className="arena-horse-completion-mark"
            style={{
              flexShrink: 0,
              lineHeight: 0,
              borderRadius: 8,
              boxShadow: getCompletionGlowBoxShadow(completionNeedsReview),
            }}
          >
            <CavaloHorseMark
              size={28}
              glowFilter={getCompletionGlowFilter(completionNeedsReview)}
            />
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              color: 'var(--caval-text)',
              fontWeight: 600,
            }}
          >
            {completionMessage}
          </div>
        </div>
      ) : null}
      <style>{`
        .arena-horse-wait-mark img {
          animation: cavalo-gallop 1.4s ease-in-out infinite;
        }
        @keyframes cavalo-gallop {
          0%, 100% { transform: scale(0.92) translateY(0); }
          50% { transform: scale(1) translateY(-3px); }
        }
      `}</style>
      <style>{`
        @keyframes zl-step-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
