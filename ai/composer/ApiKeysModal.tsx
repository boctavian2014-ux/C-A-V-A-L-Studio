import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAIStore } from './ai-store';
import type { ApiKeys } from '../multi-model/provider';

interface ApiKeysModalProps {
  onClose: () => void;
}

const KEY_FIELDS: Array<{ key: keyof ApiKeys; label: string; placeholder: string; hint?: string }> = [
  { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', hint: 'Claude Opus, Claude Sonnet' },
  { key: 'openai', label: 'OpenAI', placeholder: 'sk-...', hint: 'GPT-4o, GPT-4o mini' },
  { key: 'google', label: 'Google', placeholder: 'AIza...', hint: 'Gemini 2.5 Pro, Gemini Flash' },
];

export function ApiKeysModal({ onClose }: ApiKeysModalProps) {
  const { apiKeys, setApiKey } = useAIStore();
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const { key } of KEY_FIELDS) {
      initial[key] = apiKeys[key] ?? '';
    }
    setDraft(initial);
  }, [apiKeys]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = (key: keyof ApiKeys) => {
    setApiKey(key, draft[key] ?? '');
  };

  const handleSaveAll = () => {
    for (const { key } of KEY_FIELDS) {
      setApiKey(key, draft[key] ?? '');
    }
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="api-keys-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--caval-border)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div id="api-keys-title" style={{ fontSize: 14, fontWeight: 700, color: 'var(--caval-text)' }}>
              API Keys (BYOK)
            </div>
            <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 2 }}>
              Cheile tale rămân local, în aplicație
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'none',
              color: 'var(--caval-text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {KEY_FIELDS.map(({ key, label, placeholder, hint }) => {
            const value = draft[key] ?? '';
            const isSet = Boolean(apiKeys[key]);
            return (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)' }}>{label}</label>
                  {isSet && (
                    <span style={{ fontSize: 10, color: 'var(--caval-success)', fontWeight: 600 }}>salvat</span>
                  )}
                </div>
                {hint && (
                  <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4 }}>{hint}</div>
                )}
                <input
                  type="password"
                  value={value}
                  placeholder={placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  onBlur={() => handleSave(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave(key);
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--caval-border)',
                    background: 'var(--caval-bg)',
                    color: 'var(--caval-text)',
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--caval-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'none',
              color: 'var(--caval-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Anulează
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--caval-accent)',
              color: '#0E0E0F',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Salvează
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
