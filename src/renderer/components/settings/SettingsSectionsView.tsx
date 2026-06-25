import React from 'react';
import type { SettingDefinition } from './settings-config';

interface SettingsSectionsViewProps {
  definitions: SettingDefinition[];
  settings: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function SettingsSectionsView({ definitions, settings, onChange }: SettingsSectionsViewProps) {
  const sections = [...new Set(definitions.map((d) => d.section))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.map((section) => {
        const items = definitions.filter((d) => d.section === section);
        return (
          <section key={section} style={cardStyle}>
            <h3 style={sectionTitle}>{section}</h3>
            {items.map((item) => (
              <SettingRow
                key={item.key}
                item={item}
                value={settings[item.key] ?? item.defaultValue}
                onChange={onChange}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function SettingRow({
  item,
  value,
  onChange,
}: {
  item: SettingDefinition;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2, fontSize: 12 }}>{item.label}</div>
        <div style={{ color: 'var(--caval-text-muted)', fontSize: 11 }}>{item.description}</div>
        <code style={{ fontSize: 9, color: 'var(--caval-text-muted)', opacity: 0.7 }}>{item.key}</code>
      </div>
      <div style={{ minWidth: 160 }}>
        {item.control === 'toggle' ? (
          <button
            type="button"
            onClick={() => onChange(item.key, value === 'true' ? 'false' : 'true')}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: 'none',
              cursor: 'pointer',
              background: value === 'true' ? 'var(--caval-accent)' : 'var(--caval-border)',
              position: 'relative',
            }}
            aria-pressed={value === 'true'}
          >
            <span style={{
              position: 'absolute',
              top: 3,
              left: value === 'true' ? 21 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
            }} />
          </button>
        ) : item.control === 'select' ? (
          <select
            value={value}
            onChange={(e) => onChange(item.key, e.target.value)}
            style={controlStyle}
          >
            {(item.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={item.control === 'password' ? 'password' : item.control === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(item.key, e.target.value)}
            style={controlStyle}
          />
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--caval-border)',
  background: 'var(--caval-surface)',
};

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: 12,
  fontWeight: 700,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '10px 0',
  borderBottom: '1px solid var(--caval-border)',
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--caval-border)',
  background: 'var(--caval-bg)',
  color: 'var(--caval-text)',
  fontSize: 12,
  boxSizing: 'border-box',
};
