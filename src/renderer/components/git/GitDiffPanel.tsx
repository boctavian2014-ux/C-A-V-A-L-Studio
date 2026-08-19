import React from 'react';
import { useGitStore } from '../../store/git-store';

function diffLineStyle(line: string): React.CSSProperties {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { background: 'rgba(47,191,113,0.08)', color: '#2FBF71' };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { background: 'rgba(244,112,103,0.08)', color: '#F47067' };
  }
  if (line.startsWith('@@')) {
    return { color: 'var(--caval-accent)', fontWeight: 600 };
  }
  return { color: 'var(--caval-text-muted)' };
}

export function GitDiffPanel() {
  const { selectedFile, diffContent, diffLoading, diffBinary, isDiffStaged, loadDiff } = useGitStore();

  if (!selectedFile) {
    return (
      <div
        data-testid="git-diff-empty"
        style={{
        padding: '12px 10px', fontSize: 11.5, color: 'var(--caval-text-muted)',
        borderTop: '1px solid var(--caval-border)',
      }}>
        Selectează un fișier pentru diff.
      </div>
    );
  }

  return (
    <div
      data-testid="git-diff"
      style={{
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      maxHeight: 220, minHeight: 120, flexShrink: 0,
    }}>
      <div style={{
        padding: '6px 10px', fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--caval-text-muted)',
        borderBottom: '1px solid var(--caval-border)',
        fontFamily: "'JetBrains Mono', monospace",
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Diff — {selectedFile.path}
        </span>
        <button
          data-testid="git-diff-working"
          type="button"
          onClick={() => void loadDiff(selectedFile, false)}
          style={{
            border: 'none', background: !isDiffStaged ? 'rgba(0,224,255,0.12)' : 'transparent',
            color: !isDiffStaged ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 4, padding: '2px 6px',
          }}
        >
          Working tree
        </button>
        <button
          data-testid="git-diff-staged"
          type="button"
          onClick={() => void loadDiff(selectedFile, true)}
          style={{
            border: 'none', background: isDiffStaged ? 'rgba(0,224,255,0.12)' : 'transparent',
            color: isDiffStaged ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
            fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 4, padding: '2px 6px',
          }}
        >
          Staged
        </button>
      </div>
      <div className="ai-messages-scroll" style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {diffLoading && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Se încarcă diff…
          </div>
        )}
        {!diffLoading && diffBinary && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Fișier binar — diff text indisponibil.
          </div>
        )}
        {!diffLoading && !diffBinary && !diffContent.trim() && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Nicio diferență unified pentru această vedere.
          </div>
        )}
        {!diffLoading && !diffBinary && diffContent.trim() && diffContent.split(/\r?\n/).map((line, i) => (
          <div
            key={`${i}-${line.slice(0, 12)}`}
            style={{
              ...diffLineStyle(line),
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              padding: '0 10px',
              whiteSpace: 'pre',
              lineHeight: 1.45,
            }}
          >
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  );
}
