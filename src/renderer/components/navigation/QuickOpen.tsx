import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';

interface QuickOpenItem {
  path: string;
  name: string;
  score: number;
}

function flattenTree(
  nodes: Array<{ name: string; path: string; type: string; children?: unknown[] }>,
  out: Array<{ path: string; name: string }> = []
): Array<{ path: string; name: string }> {
  for (const node of nodes) {
    if (node.type === 'file') out.push({ path: node.path, name: node.name });
    if (node.children?.length) flattenTree(node.children as typeof nodes, out);
  }
  return out;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.includes(q)) return 80 - t.indexOf(q);
  let qi = 0;
  let score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 5;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export function QuickOpen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { fileTree, projectPath, openFile, tabs } = useEditorStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const items = useMemo(() => {
    const q = query.trim();
    const files = flattenTree(fileTree as Array<{ name: string; path: string; type: string; children?: unknown[] }>);
    const recent = tabs.map((t) => ({ path: t.path, name: t.name }));

    const merged = new Map<string, QuickOpenItem>();
    for (const f of [...recent, ...files]) {
      const score = q ? fuzzyScore(q, f.name) + fuzzyScore(q, f.path) * 0.5 : 1;
      if (!q || score > 0) {
        merged.set(f.path, { path: f.path, name: f.name, score: score + (recent.some((r) => r.path === f.path) ? 10 : 0) });
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 30);
  }, [fileTree, query, tabs]);

  const pick = useCallback(
    (item: QuickOpenItem) => {
      void openFile(item.path);
      setQuery('');
      onClose();
    },
    [onClose, openFile]
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, items.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && items[selected]) {
        e.preventDefault();
        pick(items[selected]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, items, selected, pick, onClose]);

  if (!open) return null;

  return (
    <div
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
          }}
          placeholder={projectPath ? 'Go to file (Ctrl+P)' : 'Deschide un folder mai întâi'}
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
        <div style={{ maxHeight: 'calc(60vh - 48px)', overflowY: 'auto' }}>
          {items.length === 0 && (
            <p style={{ padding: 12, margin: 0, fontSize: 12, color: 'var(--caval-text-muted)' }}>
              Niciun fișier
            </p>
          )}
          {items.map((item, i) => (
            <button
              key={item.path}
              type="button"
              onClick={() => pick(item)}
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
              <div style={{ fontSize: 13 }}>{item.name}</div>
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', fontFamily: 'monospace' }}>
                {item.path}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
