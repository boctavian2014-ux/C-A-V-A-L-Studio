import React, { useState } from 'react';
import { useEditorStore } from '../../src/renderer/store/editor-store';
import type { CavalComposerResult } from '../../src/main/preload';
import { SuggestionsPanel } from '../suggestions/suggestions-panel';
import { CodeReviewPanel } from '../review/code-review-panel';
import type { SuggestionsBundle } from '../suggestions/types';
import type { CodeReviewSession } from '../review/types';

export function ComposerPanel({ onClose }: { onClose?: () => void }) {
  const [objective, setObjective] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CavalComposerResult | null>(null);
  const projectPath = useEditorStore((s) => s.projectPath);

  const caval = () =>
    (window as unknown as {
      caval?: {
        composerRun?: (r: {
          objective: string;
          mode: string;
          skipSuggestions?: boolean;
          skipReview?: boolean;
          suggestionSessionId?: string;
          reviewSessionId?: string;
          approvedAlternativeId?: string;
        }) => Promise<CavalComposerResult>;
        suggestionsProceed?: (input: {
          sessionId: string;
          objective: string;
          alternativeId?: string;
        }) => Promise<CavalComposerResult>;
        reviewAction?: (input: {
          action: 'acceptAll' | 'rejectAll' | 'acceptFile' | 'rejectFile' | 'acceptHunk' | 'rejectHunk' | 'acceptLine' | 'rejectLine' | 'askAIToRevise';
          targetId?: string;
        }) => Promise<unknown>;
        reviewApply?: (input: { sessionId: string; objective: string }) => Promise<CavalComposerResult>;
      };
    }).caval;

  const runComposer = async (opts?: { skipSuggestions?: boolean; skipReview?: boolean }) => {
    if (!objective.trim() || running) return;
    setRunning(true);
    try {
      const res = await caval()?.composerRun?.({
        objective,
        mode: 'plan',
        skipSuggestions: opts?.skipSuggestions,
        skipReview: opts?.skipReview,
      });
      if (res) setResult(res);
    } finally {
      setRunning(false);
    }
  };

  const suggestions = result?.suggestions as SuggestionsBundle | undefined;
  const review = result?.review as CodeReviewSession | undefined;

  return (
    <div style={{
      width: 360, background: 'var(--caval-surface-raised)',
      borderLeft: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--caval-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13, flex: 1 }}>Composer</strong>
        {onClose && (
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--caval-text-muted)' }}>✕</button>
        )}
      </div>
      <div style={{ padding: 12, flex: 1, overflow: 'auto' }}>
        <p style={{ fontSize: 12, color: 'var(--caval-text-muted)', marginBottom: 8 }}>
          Multi-file edits: plan → patch → validate → apply
        </p>
        {!projectPath && (
          <p style={{ fontSize: 11, color: 'var(--caval-warning, #F59E0B)' }}>Deschide un folder de proiect mai întâi.</p>
        )}
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Descrie ce vrei să schimbi în proiect..."
          style={{
            width: '100%', minHeight: 100, boxSizing: 'border-box',
            padding: 10, fontSize: 13, borderRadius: 8,
            border: '1px solid var(--caval-border)', background: 'var(--caval-bg)',
            color: 'var(--caval-text)', resize: 'vertical',
          }}
        />
        <button
          type="button"
          onClick={() => void runComposer()}
          disabled={running || !objective.trim()}
          style={{
            marginTop: 10, width: '100%', padding: '8px 12px',
            borderRadius: 6, border: 'none', cursor: running ? 'wait' : 'pointer',
            background: 'var(--caval-accent)', color: '#0E0E0F', fontWeight: 600,
            opacity: running || !objective.trim() ? 0.6 : 1,
          }}
        >
          {running ? 'Rulează...' : 'Run Composer'}
        </button>

        {result && result.phase !== 'awaiting_suggestions' && result.phase !== 'awaiting_review' && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <div style={{ color: result.ok ? 'var(--caval-success)' : 'var(--caval-error)' }}>
              Phase: {result.phase} {result.ok ? '✓' : '✗'}
            </div>
            {result.changedFiles?.length > 0 && (
              <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                {result.changedFiles.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
            {result.diagnostics?.map((d, i) => (
              <div key={i} style={{ color: d.level === 'error' ? 'var(--caval-error)' : 'var(--caval-text-muted)' }}>
                {d.message}
              </div>
            ))}
          </div>
        )}

        {suggestions && (
          <div style={{ marginTop: 12 }}>
            <SuggestionsPanel
              bundle={suggestions}
              onProceed={() => {
                void (async () => {
                  setRunning(true);
                  try {
                    const res = await caval()?.suggestionsProceed?.({
                      sessionId: suggestions.id,
                      objective,
                      alternativeId: suggestions.selectedAlternativeId,
                    });
                    if (res) setResult(res);
                  } finally {
                    setRunning(false);
                  }
                })();
              }}
            />
          </div>
        )}

        {review && (
          <div style={{ marginTop: 12 }}>
            <CodeReviewPanel
              session={review}
              onAcceptAll={() => void caval()?.reviewAction?.({ action: 'acceptAll' })}
              onRejectAll={() => void caval()?.reviewAction?.({ action: 'rejectAll' })}
              onAskAIToRevise={() => void caval()?.reviewAction?.({ action: 'askAIToRevise' })}
              onAcceptFile={(fileId) => void caval()?.reviewAction?.({ action: 'acceptFile', targetId: fileId })}
              onRejectFile={(fileId) => void caval()?.reviewAction?.({ action: 'rejectFile', targetId: fileId })}
              onAcceptHunk={(hunkId) => void caval()?.reviewAction?.({ action: 'acceptHunk', targetId: hunkId })}
              onRejectHunk={(hunkId) => void caval()?.reviewAction?.({ action: 'rejectHunk', targetId: hunkId })}
              onAcceptLine={(lineId) => void caval()?.reviewAction?.({ action: 'acceptLine', targetId: lineId })}
              onRejectLine={(lineId) => void caval()?.reviewAction?.({ action: 'rejectLine', targetId: lineId })}
              onApplySelected={() => {
                void (async () => {
                  setRunning(true);
                  try {
                    const res = await caval()?.reviewApply?.({ sessionId: review.id, objective });
                    if (res) setResult(res);
                  } finally {
                    setRunning(false);
                  }
                })();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
