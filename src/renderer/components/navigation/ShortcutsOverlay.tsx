import React, { useEffect, useMemo } from 'react';

import { useTranslation } from '../../../../ai/i18n/useTranslation';
import type { MessageKey } from '../../../../ai/i18n/locales/en';

export interface ShortcutEntry {
  keys: string;
  label: string;
  category: string;
}

type ShortcutDef = {
  categoryKey: MessageKey;
  keys: string;
  labelKey: MessageKey;
};

const DEFAULT_SHORTCUT_DEFS: ShortcutDef[] = [
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'Ctrl+P', labelKey: 'shortcutsOverlay.goToFile' },
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'Ctrl+T', labelKey: 'shortcutsOverlay.workspaceSymbols' },
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'Ctrl+Shift+P', labelKey: 'shortcutsOverlay.commandPalette' },
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'F12', labelKey: 'shortcutsOverlay.goToDefinition' },
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'Shift+F12', labelKey: 'shortcutsOverlay.findReferences' },
  { categoryKey: 'shortcutsOverlay.cat.view', keys: 'Ctrl+B', labelKey: 'shortcutsOverlay.toggleSidebar' },
  { categoryKey: 'shortcutsOverlay.cat.navigation', keys: 'Ctrl+Shift+E', labelKey: 'shortcutsOverlay.explorerOrExplain' },
  { categoryKey: 'shortcutsOverlay.cat.view', keys: 'Ctrl+Shift+F', labelKey: 'shortcutsOverlay.searchOrSuggest' },
  { categoryKey: 'shortcutsOverlay.cat.ai', keys: 'Ctrl+Shift+E', labelKey: 'shortcutsOverlay.terminalExplain' },
  { categoryKey: 'shortcutsOverlay.cat.ai', keys: 'Ctrl+Shift+F', labelKey: 'shortcutsOverlay.terminalSuggest' },
  { categoryKey: 'shortcutsOverlay.cat.view', keys: 'Ctrl+Shift+G', labelKey: 'shortcutsOverlay.sourceControl' },
  { categoryKey: 'shortcutsOverlay.cat.view', keys: 'Ctrl+Shift+X', labelKey: 'shortcutsOverlay.extensions' },
  { categoryKey: 'shortcutsOverlay.cat.view', keys: 'Ctrl+Shift+/', labelKey: 'shortcutsOverlay.keyboardShortcuts' },
  { categoryKey: 'shortcutsOverlay.cat.ai', keys: 'Ctrl+Shift+A', labelKey: 'shortcutsOverlay.toggleAi' },
  { categoryKey: 'shortcutsOverlay.cat.file', keys: 'Ctrl+S', labelKey: 'shortcutsOverlay.save' },
  { categoryKey: 'shortcutsOverlay.cat.file', keys: 'Ctrl+Shift+O', labelKey: 'shortcutsOverlay.openFolder' },
  { categoryKey: 'shortcutsOverlay.cat.debug', keys: 'F5', labelKey: 'shortcutsOverlay.startDebug' },
  { categoryKey: 'shortcutsOverlay.cat.debug', keys: 'Shift+F5', labelKey: 'shortcutsOverlay.stopDebug' },
];

export function ShortcutsOverlay({
  open,
  shortcuts,
  onClose,
}: {
  open: boolean;
  shortcuts?: ShortcutEntry[];
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const resolved = useMemo(() => {
    if (shortcuts) return shortcuts;
    return DEFAULT_SHORTCUT_DEFS.map((d) => ({
      keys: d.keys,
      label: t(d.labelKey),
      category: t(d.categoryKey),
    }));
  }, [shortcuts, t]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = resolved.reduce<Record<string, ShortcutEntry[]>>((acc, item) => {
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
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--caval-border)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--caval-text)',
          }}
        >
          {t('shortcutsOverlay.title')}
        </div>
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ padding: '10px 16px 14px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--caval-text-muted)',
                marginBottom: 8,
              }}
            >
              {category}
            </div>
            {items.map((item) => (
              <div
                key={`${item.category}-${item.keys}-${item.label}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '5px 0',
                  fontSize: 12,
                  color: 'var(--caval-text)',
                }}
              >
                <span>{item.label}</span>
                <kbd
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    color: 'var(--caval-text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
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
