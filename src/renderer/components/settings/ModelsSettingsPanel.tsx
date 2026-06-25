import React, { useMemo, useState } from 'react';
import { MODELS, type ModelId, type ApiKeys } from '../../../../ai/multi-model/provider';
import { useAIStore } from '../../../../ai/composer/ai-store';

const PROVIDER_GROUPS = [
  { label: 'Anthropic', ids: ['claude-opus-4', 'claude-sonnet-4'] as ModelId[] },
  { label: 'OpenAI', ids: ['gpt-4o', 'gpt-4o-mini'] as ModelId[] },
  { label: 'Google', ids: ['gemini-2.5-pro', 'gemini-2.5-flash'] as ModelId[] },
  { label: 'Local', ids: ['ollama-local'] as ModelId[] },
];

const API_KEY_FIELDS: Array<{ key: keyof ApiKeys; label: string; link: string }> = [
  { key: 'anthropic', label: 'Anthropic', link: 'https://console.anthropic.com/' },
  { key: 'openai', label: 'OpenAI', link: 'https://platform.openai.com/api-keys' },
  { key: 'google', label: 'Google', link: 'https://aistudio.google.com/apikey' },
];

interface ModelsSettingsPanelProps {
  settings: Record<string, string>;
  onSettingChange: (key: string, value: string) => void;
}

function parseEnabledModels(raw: string | undefined): Set<string> {
  if (!raw) return new Set(MODELS.map((m) => m.id));
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function ModelsSettingsPanel({ settings, onSettingChange }: ModelsSettingsPanelProps) {
  const { selectedModel, setModel, apiKeys, setApiKey } = useAIStore();
  const [editingKey, setEditingKey] = useState<keyof ApiKeys | null>(null);

  const enabled = useMemo(
    () => parseEnabledModels(settings['caval.ai.enabledModels']),
    [settings['caval.ai.enabledModels']]
  );

  const toggleModel = (id: ModelId) => {
    const next = new Set(enabled);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSettingChange('caval.ai.enabledModels', [...next].join(','));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--caval-text-muted)' }}>
        Modele BYOK din caval-code — Claude, GPT-4o, Gemini, Ollama. Click pentru a activa/dezactiva în picker.
      </p>

      <section style={cardStyle}>
        <h3 style={sectionTitle}>Enabled models</h3>
        {PROVIDER_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 10 }}>
            <div style={groupLabelStyle}>{group.label}</div>
            {group.ids.map((id) => {
              const meta = MODELS.find((m) => m.id === id)!;
              const isOn = enabled.has(id);
              const isDefault = selectedModel === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleModel(id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    marginBottom: 2,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: isOn ? 'var(--caval-accent-glow)' : 'transparent',
                    color: isOn ? 'var(--caval-text)' : 'var(--caval-text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isDefault ? 700 : 400 }}>{meta.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
                    {meta.contextWindow >= 1_000_000 ? '1M ctx' : `${meta.contextWindow / 1000}k`}
                  </span>
                  <span style={{ fontSize: 10, minWidth: 48, textAlign: 'right', color: isOn ? 'var(--caval-accent)' : 'var(--caval-text-muted)' }}>
                    {isOn ? (isDefault ? 'Default' : 'Added') : 'Off'}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </section>

      <section style={cardStyle}>
        <h3 style={sectionTitle}>Default model</h3>
        <select
          value={selectedModel}
          onChange={(e) => {
            const id = e.target.value as ModelId;
            setModel(id);
            onSettingChange('caval.ai.defaultModel', id);
          }}
          style={selectStyle}
        >
          {MODELS.filter((m) => enabled.has(m.id)).map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </section>

      <section style={cardStyle}>
        <h3 style={sectionTitle}>API Keys</h3>
        <p style={{ margin: '0 0 10px', fontSize: 10, color: 'var(--caval-text-muted)' }}>
          Stocate criptat via Electron safeStorage. Ollama rulează local fără cheie.
        </p>
        {API_KEY_FIELDS.map(({ key, label, link }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--caval-accent)', width: 72, flexShrink: 0 }}>
              {label}
            </a>
            {editingKey === key ? (
              <input
                type="password"
                autoFocus
                defaultValue={apiKeys[key] ?? ''}
                placeholder="sk-..."
                onBlur={(e) => { setApiKey(key, e.target.value); setEditingKey(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setApiKey(key, e.currentTarget.value);
                    setEditingKey(null);
                  }
                  if (e.key === 'Escape') setEditingKey(null);
                }}
                style={inputStyle}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingKey(key)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--caval-border)',
                  background: 'var(--caval-bg)',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: apiKeys[key] ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {apiKeys[key] ? '●●●●●●●●' : 'Click să adaugi'}
              </button>
            )}
          </div>
        ))}
      </section>
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

const groupLabelStyle: React.CSSProperties = {
  fontSize: 9.5,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--caval-text-muted)',
  opacity: 0.7,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--caval-accent)',
  background: 'var(--caval-bg)',
  color: 'var(--caval-text)',
  fontSize: 11,
  fontFamily: 'JetBrains Mono, monospace',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--caval-border)',
  background: 'var(--caval-bg)',
  color: 'var(--caval-text)',
  fontSize: 12,
};
