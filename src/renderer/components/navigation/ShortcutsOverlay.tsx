import React, { useEffect } from 'react';

export interface ShortcutEntry {
  keys: string;
  label: string;
  category: string;
}

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { category: 'Navigation', keys: 'Ctrl+P', label: 'Go to File (Quick Open)' },
  { category: 'Navigation', keys: 'Ctrl+Shift+P', label: 'Command Palette' },
  { category: 'Navigation', keys: 'F12', label: 'Go to Definition' },
  { category: 'Navigation', keys: 'Shift+F12', label: 'Find References' },
  { category: 'View', keys: 'Ctrl+B', label: 'Toggle Sidebar' },
  { category: 'View', keys: 'Ctrl+Shift+E', label: 'Explorer' },
  { category: 'View', keys: 'Ctrl+Shift+F', label: 'Search' },
  { category: 'View', keys: 'Ctrl+Shift+G', label: 'Source Control' },
  { category: 'View', keys: 'Ctrl+Shift+X', label: 'Extensions' },
  { category: 'View', keys: 'Ctrl+Shift+/', label: 'Keyboard Shortcuts' },
  { category: 'AI', keys: 'Ctrl+Shift+A', label: 'Toggle AI Panel' },
  { category: 'File', keys: 'Ctrl+S', label: 'Save' },
  { category: 'File', keys: 'Ctrl+Shift+O', label: 'Open Folder' },
  { category: 'Debug', keys: 'F5', label: 'Start Debugging' },
  { category: 'Debug', keys: 'Shift+F5', label: 'Stop Debugging' },
];

export function ShortcutsOverlay({
  open,
  shortcuts = DEFAULT_SHORTCUTS,
  onClose,
}: {
  open: boolean;
  shortcuts?: ShortcutEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, item) => {
    acc[item.category] = acc[item.category] ?? [];
    acc[item.category].push(item);
    return acc;
  }, {});

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
        paddingTop: '10vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxHeight: '70vh',
          overflowY: 'auto',
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--caval-border)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--caval-text)',
        }}>
          Keyboard Shortcuts
        </div>
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ padding: '10px 16px' }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--caval-text-muted)',
              marginBottom: 6,
            }}>
              {category}
            </div>
            {items.map((item) => (
              <div
                key={`${category}-${item.keys}-${item.label}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '5px 0',
                  fontSize: 12.5,
                  color: 'var(--caval-text)',
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                <kbd style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10.5,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--caval-border)',
                  background: 'var(--caval-surface-raised)',
                  color: 'var(--caval-text-muted)',
                }}>
                  {item.keys}
                </kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
