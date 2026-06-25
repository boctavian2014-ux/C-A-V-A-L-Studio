import React, { useState } from 'react';
import type { ReviewHunk } from '../../../../ai/review/types';
import { buildHunkPatch } from '../../../shared/diff-utils';

export interface GitHunkViewProps {
  hunk: ReviewHunk;
  disabled?: boolean;
  onKeep?: (hunk: ReviewHunk) => void;
  onRevert?: (hunk: ReviewHunk, hunkPatch: string) => void;
  onCancel?: (hunk: ReviewHunk) => void;
}

const lineStyle = (type: string): React.CSSProperties => {
  if (type === 'add') return { background: 'rgba(47, 191, 113, 0.1)', color: '#2FBF71' };
  if (type === 'remove') return { background: 'rgba(244, 112, 103, 0.1)', color: '#F47067' };
  return { color: 'var(--caval-text)', opacity: 0.85 };
};

export function GitHunkView({ hunk, disabled, onKeep, onRevert, onCancel }: GitHunkViewProps) {
  const [dismissed, setDismissed] = useState(false);
  const hasAdds = hunk.lines.some((l) => l.type === 'add');
  const resolved = hunk.decision !== 'pending' || dismissed;

  if (!hasAdds && hunk.lines.every((l) => l.type === 'remove')) {
    return (
      <section style={{ marginBottom: 12, border: '1px solid var(--caval-border)', borderRadius: 8, overflow: 'hidden' }}>
        <header style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#78B9E0' }}>
          {hunk.header}
        </header>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>
          {hunk.lines.map((line) => (
            <div key={line.id} style={{ ...lineStyle(line.type), padding: '0 10px', whiteSpace: 'pre' }}>
              <span style={{ opacity: 0.45, marginRight: 8 }}>{line.oldLineNumber ?? ''}</span>
              {line.type === 'remove' ? '-' : ' '}{line.content || ' '}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section style={{
      marginBottom: 12,
      border: `1px solid ${resolved ? 'rgba(47,191,113,0.25)' : 'var(--caval-border)'}`,
      borderRadius: 8,
      overflow: 'hidden',
      opacity: resolved ? 0.75 : 1,
    }}>
      <header style={{
        padding: '6px 10px',
        background: 'rgba(255,255,255,0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <code style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#78B9E0' }}>
          {hunk.header}
        </code>
        {!resolved && hasAdds && (
          <div style={{ display: 'flex', gap: 6 }}>
            <HunkBtn label="Keep" accent onClick={() => { onKeep?.(hunk); setDismissed(true); }} disabled={disabled} />
            <HunkBtn label="Revert" danger onClick={() => onRevert?.(hunk, buildHunkPatch(hunk))} disabled={disabled} />
            <HunkBtn label="Cancel" onClick={() => { onCancel?.(hunk); setDismissed(true); }} disabled={disabled} />
          </div>
        )}
        {resolved && (
          <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
            {hunk.decision === 'accepted' ? 'kept' : hunk.decision === 'rejected' ? 'reverted' : 'dismissed'}
          </span>
        )}
      </header>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, lineHeight: 1.55 }}>
        {hunk.lines.map((line) => (
          <div key={line.id} style={{ ...lineStyle(line.type), padding: '0 10px', whiteSpace: 'pre', minHeight: '1.55em' }}>
            <span style={{ opacity: 0.45, marginRight: 8, display: 'inline-block', minWidth: 48 }}>
              {line.oldLineNumber ?? ''}{line.newLineNumber ? `/${line.newLineNumber}` : ''}
            </span>
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}{line.content || ' '}
          </div>
        ))}
      </div>
    </section>
  );
}

function HunkBtn({
  label,
  onClick,
  disabled,
  accent,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        border: '1px solid var(--caval-border)',
        background: accent ? 'rgba(0,224,255,0.12)' : danger ? 'rgba(244,112,103,0.12)' : 'transparent',
        color: accent ? 'var(--caval-accent)' : danger ? '#F47067' : 'var(--caval-text-muted)',
        fontSize: 10,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
