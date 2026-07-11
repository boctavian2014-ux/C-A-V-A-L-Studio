import React, { useCallback, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';

interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  preview: string;
  score: number;
}

interface TextHit {
  path: string;
  line: number;
  column: number;
  preview: string;
}

type SearchMode = 'semantic' | 'text';

function joinProjectPath(projectPath: string, relativePath: string): string {
  const base = projectPath.replace(/[/\\]+$/, '');
  const rel = relativePath.replace(/^[/\\]+/, '');
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base}${sep}${rel.replace(/\//g, sep)}`;
}

export function SearchPanel() {
  const { projectPath, openFile } = useEditorStore();
  const [mode, setMode] = useState<SearchMode>('text');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [textResults, setTextResults] = useState<TextHit[]>([]);

  const runSemanticSearch = useCallback(async () => {
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

  const runTextSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setTextResults([]);
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
      const res = await (window.caval as { search?: { text?: (input: { query: string }) => Promise<{ ok: boolean; hits?: TextHit[]; error?: string }> } })?.search?.text?.({ query: q });
      if (!res?.ok) {
        setError(res?.error ?? 'Text search failed');
        setTextResults([]);
        return;
      }
      setTextResults(res.hits ?? []);
      if ((res.hits ?? []).length === 0) setError('Niciun rezultat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTextResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, projectPath]);

  const runSearch = useCallback(async () => {
    if (mode === 'text') await runTextSearch();
    else await runSemanticSearch();
  }, [mode, runTextSearch, runSemanticSearch]);

  const openHit = (relativePath: string) => {
    if (!projectPath) return;
    void openFile(joinProjectPath(projectPath, relativePath));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['text', 'semantic'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid var(--caval-border)',
                background: mode === m ? 'var(--caval-surface-raised)' : 'transparent',
                color: mode === m ? 'var(--caval-text)' : 'var(--caval-text-muted)',
                cursor: 'pointer',
              }}
            >
              {m === 'text' ? 'Text (ripgrep)' : 'Semantic'}
            </button>
          ))}
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
        {error && (mode === 'text' ? textResults.length === 0 : results.length === 0) && (
          <p style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--caval-text-muted)', margin: 0 }}>
            {error}
          </p>
        )}
        {mode === 'text' && textResults.map((hit, i) => (
          <button
            key={`${hit.path}-${hit.line}-${i}`}
            type="button"
            onClick={() => openHit(hit.path)}
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
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--caval-accent)', marginBottom: 4 }}>
              {hit.path}:{hit.line}
            </div>
            <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.4 }}>
              {hit.preview || '(fără preview)'}
            </div>
          </button>
        ))}
        {mode === 'semantic' && results.map((hit, i) => (
          <button
            key={`${hit.path}-${hit.startLine}-${i}`}
            type="button"
            onClick={() => openHit(hit.path)}
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
