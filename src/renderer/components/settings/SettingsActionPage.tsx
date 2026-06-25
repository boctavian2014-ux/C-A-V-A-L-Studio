import React from 'react';
import type { SettingsActionItem, SettingsCategoryId } from './settings-config';

interface SettingsActionPageProps {
  items: SettingsActionItem[];
  onAction: (action: string, navigateTo?: SettingsCategoryId) => void;
}

export function SettingsActionPage({ items, onAction }: SettingsActionPageProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item) => (
        <article
          key={item.action}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--caval-border)',
            background: 'var(--caval-surface)',
          }}
        >
          <div>
            <strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{item.title}</strong>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--caval-text-muted)' }}>{item.description}</p>
          </div>
          <button
            type="button"
            onClick={() => onAction(item.action, item.navigateTo)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-bg)',
              color: 'var(--caval-text)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {item.cta}
          </button>
        </article>
      ))}
    </div>
  );
}
