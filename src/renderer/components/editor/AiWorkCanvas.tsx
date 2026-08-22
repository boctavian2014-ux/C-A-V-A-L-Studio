import React, { useMemo } from 'react';

import { useTranslation } from '../../../../ai/i18n/useTranslation';
import { useLiveAiEditsStore } from '../../../../ai/composer/live-ai-edits-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { useEditorStore } from '../../store/editor-store';
import { usePreviewStore } from '../../store/preview-store';
import {
  deriveWorkCanvasSteps,
  type WorkCanvasStep,
  type WorkCanvasStepId,
} from '../../ai/work-canvas-steps';

function StepIcon({ status }: { status: WorkCanvasStep['status'] }) {
  if (status === 'done') {
    return (
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'rgba(0,224,255,0.18)',
          color: '#00E0FF',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
    );
  }
  if (status === 'active') {
    return <span className="caval-ai-work-canvas-dot" aria-hidden />;
  }
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.14)',
        flexShrink: 0,
      }}
    />
  );
}

function stepLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  step: WorkCanvasStep
): string {
  const keys: Record<WorkCanvasStepId, string> = {
    preparing: 'workCanvas.step.preparing',
    creating: 'workCanvas.step.creating',
    writing: step.detailPath
      ? 'workCanvas.step.writingPath'
      : 'workCanvas.step.writing',
    preview: 'workCanvas.step.preview',
  };
  const key = keys[step.id];
  if (step.id === 'writing' && step.detailPath) {
    return t(key, { path: step.detailPath });
  }
  return t(key);
}

export function AiWorkCanvas() {
  const { t } = useTranslation();
  const isStreaming = useAIStore((s) => s.isStreaming);
  const projectPath = useEditorStore((s) => s.projectPath);
  const order = useLiveAiEditsStore((s) => s.order);
  const edits = useLiveAiEditsStore((s) => s.edits);
  const previewStatus = usePreviewStore((s) => s.previewStatus.web);

  const previewStarting = previewStatus === 'starting';

  const steps = useMemo(
    () =>
      deriveWorkCanvasSteps({
        hasProject: Boolean(projectPath),
        isStreaming,
        order,
        edits,
        previewStarting,
      }),
    [projectPath, isStreaming, order, edits, previewStarting]
  );

  const liveAnnouncement = useMemo(() => {
    const active = steps.find((s) => s.status === 'active');
    if (!active) return '';
    return stepLabel(t, active);
  }, [steps, t]);

  return (
    <div
      data-testid="ai-work-canvas"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0D1117',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          padding: '20px 22px',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="caval-ai-work-canvas-pulse" aria-hidden>
            ✦
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--caval-text)',
              letterSpacing: '-0.01em',
            }}
          >
            {t('workCanvas.title')}
          </h2>
        </div>

        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {steps.map((step) => (
            <li
              key={step.id}
              data-testid={`work-canvas-step-${step.id}`}
              data-status={step.status}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12.5,
                color:
                  step.status === 'active'
                    ? 'var(--caval-text)'
                    : step.status === 'done'
                      ? 'var(--caval-text-muted)'
                      : 'rgba(138,149,166,0.75)',
              }}
            >
              <StepIcon status={step.status} />
              <span
                style={{
                  fontFamily:
                    step.id === 'writing' && step.detailPath
                      ? "'JetBrains Mono', monospace"
                      : 'inherit',
                  fontSize: step.id === 'writing' && step.detailPath ? 11.5 : 12.5,
                }}
              >
                {stepLabel(t, step)}
              </span>
            </li>
          ))}
        </ul>

        <p
          style={{
            margin: '16px 0 0',
            fontSize: 11,
            color: 'var(--caval-text-muted)',
            lineHeight: 1.45,
          }}
        >
          {t('workCanvas.hint')}
        </p>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </div>
      </div>
    </div>
  );
}
