import React from 'react';
import type { ChatActivityStep } from './chat-activity-types';

interface ChatActivityTimelineProps {
  steps: ChatActivityStep[];
  collapsed?: boolean;
}

function StepIcon({ status }: { status: ChatActivityStep['status'] }) {
  if (status === 'done') {
    return (
      <span style={{ color: 'var(--caval-success)', fontSize: 11, width: 14, textAlign: 'center' }}>
        ✓
      </span>
    );
  }
  if (status === 'active') {
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
  return (
    <span style={{ color: 'var(--caval-text-muted)', fontSize: 11, width: 14, textAlign: 'center', opacity: 0.5 }}>
      ○
    </span>
  );
}

export function ChatActivityTimeline({ steps, collapsed }: ChatActivityTimelineProps) {
  const visible = collapsed
    ? steps.filter((s) => s.status === 'active').slice(-1)
    : steps.filter((s) => s.status !== 'pending' || steps.findIndex((x) => x.status === 'active') >= steps.indexOf(s));

  const displaySteps = collapsed && visible.length === 0
    ? steps.filter((s) => s.status === 'done').slice(-1)
    : visible.length > 0 ? visible : steps.slice(0, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '2px 0' }}>
      {displaySteps.map((step) => (
        <div
          key={step.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11.5,
            color: step.status === 'active' ? 'var(--caval-text)' : 'var(--caval-text-muted)',
            opacity: step.status === 'pending' ? 0.55 : 1,
          }}
        >
          <StepIcon status={step.status} />
          <span>{step.label}</span>
          {step.detail && (
            <span style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', opacity: 0.85 }}>
              {step.detail}
            </span>
          )}
        </div>
      ))}
      <style>{`
        @keyframes zl-step-pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
