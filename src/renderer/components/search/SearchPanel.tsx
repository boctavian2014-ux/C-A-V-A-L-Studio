import React, { useCallback, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';

interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  preview: string;
  score: number;
}

function joinProjectPath(projectPath: string, relativePath: string): string {
  const base = projectPath.replace(/[/\\]+$/, '');
  const rel = relativePath.replace(/^[/\\]+/, '');
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base}${sep}${rel.replace(/\//g, sep)}`;
}

export function SearchPanel() {
  const { projectPath, openFile } = useEditorStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(null);
      return;
    }
    if (!projectPath) {
      setError('Deschide un folder de proiect pentru căutare.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await window.caval?.contextIndex?.();
      const res = await window.caval?.contextSearch?.({ query: q, limit: 40 });
      if (!res?.ok) {
        setError(res && 'error' in res && typeof res.error === 'string' ? res.error : 'Căutarea a eșuat.');
        setResults([]);
        return;
      }
      const hits: SearchHit[] = (res.results ?? []).map((item: unknown) => {
        const row = item as { chunk?: { path?: string; text?: string; startLine?: number; endLine?: number }; score?: number };
        const chunk = row.chunk ?? {};
        const text = (chunk.text ?? '').trim();
        return {
          path: chunk.path ?? 'unknown',
          startLine: chunk.startLine ?? 1,
          endLine: chunk.endLine ?? 1,
          preview: text.length > 120 ? `${text.slice(0, 120)}…` : text,
          score: row.score ?? 0,
        };
      });
      setResults(hits);
      if (hits.length === 0) setError('Niciun rezultat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, projectPath]);

  const openHit = (hit: SearchHit) => {
    if (!projectPath) return;
    void openFile(joinProjectPath(projectPath, hit.path));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text-muted)', letterSpacing: '0.06em', marginBottom: 8 }}>
          SEARCH
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
            placeholder="Find in Files"
            style={{
              flex: 1,
              padding: '6px 8px',
              borderRadius: 4,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)',
              color: 'var(--caval-text)',
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={loading}
            style={{
              padding: '6px 10px',
              borderRadius: 4,
              border: 'none',
              background: 'var(--caval-accent)',
              color: '#0E0E0F',
              fontSize: 11,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? '…' : 'Go'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }} className="ai-messages-scroll">
        {!projectPath && (
          <p style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--caval-text-muted)', margin: 0 }}>
            Deschide un folder (File → Open Folder) pentru Find in Files.
          </p>
        )}
        {error && results.length === 0 && (
          <p style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--caval-text-muted)', margin: 0 }}>
            {error}
          </p>
        )}
        {results.map((hit, i) => (
          <button
            key={`${hit.path}-${hit.startLine}-${i}`}
            type="button"
            onClick={() => openHit(hit)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--caval-surface-raised)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--caval-accent)',
              marginBottom: 4,
            }}>
              {hit.path}:{hit.startLine}
            </div>
            <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.4 }}>
              {hit.preview || '(fără preview)'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
