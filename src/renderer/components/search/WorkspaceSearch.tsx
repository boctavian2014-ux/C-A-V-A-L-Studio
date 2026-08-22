import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../../../ai/i18n/useTranslation';
import { debounce } from '../../lib/debounce';
import { useEditorStore } from '../../store/editor-store';
import type {
  SearchMatch,
  WorkspaceSearchResult,
} from '../../../shared/workspace-search-contract';

function joinProjectPath(projectPath: string, relativePath: string): string {
  const base = projectPath.replace(/[/\\]+$/, '');
  const rel = relativePath.replace(/^[/\\]+/, '');
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base}${sep}${rel.replace(/\//g, sep)}`;
}

function matchLabel(match: SearchMatch): string {
  if (match.type === 'symbol') {
    return match.line != null ? `${match.value} (line ${match.line})` : match.value;
  }
  if (match.type === 'import') return `imports ${match.value}`;
  if (match.type === 'export') return `exports ${match.value}`;
  return match.value;
}

function preferredLine(result: WorkspaceSearchResult): number | undefined {
  return result.matches.find((m) => m.type === 'symbol' && m.line != null)?.line;
}

export function WorkspaceSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { projectPath, openFile } = useEditorStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WorkspaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const runSearch = useMemo(
    () =>
      debounce((text: string) => {
        void (async () => {
          const trimmed = text.trim();
          if (!trimmed) {
            setResults([]);
            setError(null);
            setLoading(false);
            return;
          }

          setLoading(true);
          try {
            const response = await window.caval.workspaceSearch?.query({
              text: trimmed,
              limit: 20,
            });
            if (!response?.ok) {
              setResults([]);
              setError(
                response?.error ?? 'Index not available, please wait for indexing'
              );
              return;
            }
            setError(null);
            setResults(response.results);
          } catch (err) {
            setResults([]);
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setLoading(false);
          }
        })();
      }, 300),
    []
  );

  useEffect(() => () => runSearch.cancel(), [runSearch]);

  useEffect(() => {
    if (!open) {
      runSearch.cancel();
      setQuery('');
      setResults([]);
      setError(null);
      setLoading(false);
      setSelected(0);
      return;
    }
    setQuery('');
    setResults([]);
    setError(null);
    setSelected(0);
  }, [open, runSearch]);

  const pick = useCallback(
    (result: WorkspaceSearchResult) => {
      if (!projectPath) return;
      const fullPath = joinProjectPath(projectPath, result.file.path);
      const line = preferredLine(result);
      onClose();
      setQuery('');
      if (line != null) {
        document.dispatchEvent(
          new CustomEvent('caval:reveal-line', {
            detail: { path: fullPath, line, col: 1 },
          })
        );
        return;
      }
      void openFile(fullPath);
    },
    [onClose, openFile, projectPath]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, Math.max(0, results.length - 1)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && results[selected]) {
        e.preventDefault();
        pick(results[selected]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, selected, pick, onClose]);

  if (!open) return null;

  const emptyHint = !projectPath
    ? t('workspaceSearch.openFolder')
    : !query.trim()
      ? t('workspaceSearch.typeToSearch')
      : error
        ? error
        : t('workspaceSearch.noResults');

  return (
    <div
      className="workspace-search"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxHeight: '60vh',
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
            runSearch(e.target.value);
          }}
          placeholder={
            projectPath
              ? 'Search workspace symbols (Ctrl+T)'
              : 'Deschide un folder mai întâi'
          }
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 14px',
            border: 'none',
            borderBottom: '1px solid var(--caval-border)',
            background: 'transparent',
            color: 'var(--caval-text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <div className="search-results" style={{ maxHeight: 'calc(60vh - 48px)', overflowY: 'auto' }}>
          {loading && query.trim() && (
            <p
              className="search-loading"
              style={{ padding: 12, margin: 0, fontSize: 12, color: 'var(--caval-text-muted)' }}
            >
              Searching...
            </p>
          )}
          {!loading && results.length === 0 && (
            <p style={{ padding: 12, margin: 0, fontSize: 12, color: 'var(--caval-text-muted)' }}>
              {emptyHint}
            </p>
          )}
          {results.map((result, i) => (
            <button
              key={result.file.path}
              type="button"
              className="search-result"
              onClick={() => pick(result)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                border: 'none',
                background: i === selected ? 'var(--caval-surface-raised)' : 'transparent',
                cursor: 'pointer',
                color: 'var(--caval-text)',
              }}
            >
              <div className="result-path" style={{ fontSize: 13 }}>
                {result.file.path.split(/[/\\]/).pop() ?? result.file.path}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--caval-text-muted)',
                  fontFamily: 'monospace',
                }}
              >
                {result.file.path}
              </div>
              <div className="result-matches" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.matches.slice(0, 3).map((match, idx) => (
                  <span
                    key={`${match.type}-${match.value}-${idx}`}
                    className={`match match-${match.type}`}
                    style={{
                      fontSize: 10,
                      color: 'var(--caval-text-muted)',
                      background: 'var(--caval-surface-raised)',
                      border: '1px solid var(--caval-border)',
                      borderRadius: 3,
                      padding: '1px 6px',
                    }}
                  >
                    {matchLabel(match)}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
