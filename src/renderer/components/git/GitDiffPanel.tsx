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
  const { selectedFile, diffContent, diffLoading, filePair } = useGitStore();

  if (!selectedFile) {
    return (
      <div style={{
        padding: '12px 10px', fontSize: 11.5, color: 'var(--caval-text-muted)',
        borderTop: '1px solid var(--caval-border)',
      }}>
        Selectează un fișier pentru diff.
      </div>
    );
  }

  return (
    <div style={{
      borderTop: '1px solid var(--caval-border)',
      display: 'flex', flexDirection: 'column',
      maxHeight: 220, minHeight: 120, flexShrink: 0,
    }}>
      <div style={{
        padding: '6px 10px', fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--caval-text-muted)',
        borderBottom: '1px solid var(--caval-border)',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Diff — {selectedFile.path} {selectedFile.staged ? '(staged)' : ''}
      </div>
      <div className="ai-messages-scroll" style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {diffLoading && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Se încarcă diff…
          </div>
        )}
        {!diffLoading && !diffContent.trim() && filePair && (
          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Fișier nou sau fără patch unified — conținut modificat disponibil.
          </div>
        )}
        {!diffLoading && diffContent.trim() && diffContent.split(/\r?\n/).map((line, i) => (
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
