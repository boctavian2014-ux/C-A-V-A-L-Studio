import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fuzzyCommandScore,
  type WorkbenchCommand,
} from '../commands/command-registry';

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: WorkbenchCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  const items = useMemo(() => {
    const q = query.trim();
    const scored = commands
      .map((cmd) => ({ cmd, score: q ? fuzzyCommandScore(q, cmd) : 1 }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    return scored.map((row) => row.cmd);
  }, [commands, query]);

  const run = useCallback(
    async (cmd: WorkbenchCommand) => {
      setQuery('');
      onClose();
      await cmd.run();
    },
    [onClose]
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
        setSelected((s) => Math.min(s + 1, Math.max(0, items.length - 1)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === 'Enter' && items[selected]) {
        e.preventDefault();
        void run(items[selected]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, items, selected, onClose, run]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        className="palette-box"
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
          placeholder="Command Palette (Ctrl+Shift+P)"
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
              Niciun rezultat
            </p>
          )}
          {items.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => void run(cmd)}
              style={{
                display: 'flex',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                border: 'none',
                background: i === selected ? 'var(--caval-surface-raised)' : 'transparent',
                cursor: 'pointer',
                color: 'var(--caval-text)',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ flex: 1, fontSize: 13 }}>{cmd.label}</span>
              {cmd.shortcut && (
                <span style={{ fontSize: 10, color: 'var(--caval-text-muted)', fontFamily: 'monospace' }}>
                  {cmd.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
