import React, { useEffect, useState } from 'react';
import { zIndex } from '../../themes/tokens/z-index';
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

const PROVIDER_SECRET_FIELDS: Array<{
  secretKey: string;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    secretKey: 'POOLSIDE_API_KEY',
    label: 'Poolside',
    placeholder: 'ps-...',
    hint: 'Poolside Laguna M.1 — poolside.ai',
  },
  {
    secretKey: 'NVIDIA_API_KEY',
    label: 'NVIDIA NIM',
    placeholder: 'nvapi-...',
    hint: 'Nemotron-3 Ultra — build.nvidia.com',
  },
  {
    secretKey: 'NORTH_API_KEY',
    label: 'North',
    placeholder: 'north-...',
    hint: 'North Mini Code + autocomplete — north.ai',
  },
];

const OPENROUTER_SETTING = 'openrouter.apiKey';
const OLLAMA_URL_SETTING = 'ollama.url';

export function ApiKeysModal({ onClose }: ApiKeysModalProps) {
  const { apiKeys, setApiKey } = useAIStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [providerDraft, setProviderDraft] = useState<Record<string, string>>({});
  const [providerSaved, setProviderSaved] = useState<Record<string, boolean>>({});
  const [openRouterDraft, setOpenRouterDraft] = useState('');
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState('http://localhost:11434');
  const [openRouterSaved, setOpenRouterSaved] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthSummary, setHealthSummary] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const { key } of KEY_FIELDS) {
      initial[key] = apiKeys[key] ?? '';
    }
    setDraft(initial);
    void Promise.all([
      window.caval.settingsLoad?.(),
      window.caval.secretsGet?.(),
    ]).then(([settingsRes, secretsRes]) => {
      const orKey = settingsRes?.settings?.[OPENROUTER_SETTING] ?? '';
      setOpenRouterDraft(orKey);
      setOpenRouterSaved(Boolean(orKey.trim()));
      setOllamaUrlDraft(settingsRes?.settings?.[OLLAMA_URL_SETTING] ?? 'http://localhost:11434');
      const secrets = secretsRes?.secrets ?? {};
      const providerInitial: Record<string, string> = {};
      const saved: Record<string, boolean> = {};
      for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
        providerInitial[secretKey] = secrets[secretKey] ?? '';
        saved[secretKey] = Boolean(secrets[secretKey]?.trim());
      }
      setProviderDraft(providerInitial);
      setProviderSaved(saved);
    });
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

  const saveOpenRouter = async (value: string) => {
    const trimmed = value.trim();
    const settingsRes = await window.caval.settingsLoad?.();
    const settings = { ...(settingsRes?.settings ?? {}), [OPENROUTER_SETTING]: trimmed };
    await window.caval.settingsSave?.(settings);
    if (trimmed) {
      await window.caval.secretsSet?.({ OPENROUTER_API_KEY: trimmed });
    }
    setOpenRouterSaved(Boolean(trimmed));
  };

  const saveOllamaUrl = async (value: string) => {
    const trimmed = value.trim() || 'http://localhost:11434';
    const settingsRes = await window.caval.settingsLoad?.();
    const settings = { ...(settingsRes?.settings ?? {}), [OLLAMA_URL_SETTING]: trimmed };
    await window.caval.settingsSave?.(settings);
    setOllamaUrlDraft(trimmed);
  };

  const saveProviderSecret = async (secretKey: string, value: string) => {
    const trimmed = value.trim();
    await window.caval.secretsSet?.({ [secretKey]: trimmed });
    setProviderSaved((s) => ({ ...s, [secretKey]: Boolean(trimmed) }));
  };

  const runHealthCheck = async () => {
    setHealthChecking(true);
    setHealthSummary(null);
    try {
      const res = await (window.caval as {
        modelsHealth?: () => Promise<{
          ok: boolean;
          summary?: string;
        }>;
      })?.modelsHealth?.();
      setHealthSummary(res?.summary ?? (res?.ok ? 'Toate providerii configurați par OK.' : 'Verificare eșuată.'));
    } catch {
      setHealthSummary('Verificare indisponibilă — repornește aplicația.');
    } finally {
      setHealthChecking(false);
    }
  };

  const handleSaveAll = async () => {
    for (const { key } of KEY_FIELDS) {
      setApiKey(key, draft[key] ?? '');
    }
    await saveOpenRouter(openRouterDraft);
    await saveOllamaUrl(ollamaUrlDraft);
    for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
      await saveProviderSecret(secretKey, providerDraft[secretKey] ?? '');
    }
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--caval-border)',
    background: 'var(--caval-bg)',
    color: 'var(--caval-text)',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zIndex.modalOverlay,
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
          maxWidth: 420,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
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
              API Keys
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)' }}>OpenRouter</label>
              {openRouterSaved && (
                <span style={{ fontSize: 10, color: 'var(--caval-success)', fontWeight: 600 }}>salvat</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4 }}>
              StepFun, Nex N2 Pro, catalog OpenRouter (sk-or-…)
            </div>
            <input
              type="password"
              value={openRouterDraft}
              placeholder="sk-or-..."
              onChange={(e) => setOpenRouterDraft(e.target.value)}
              onBlur={() => void saveOpenRouter(openRouterDraft)}
              style={inputStyle}
            />
          </div>

          {PROVIDER_SECRET_FIELDS.map(({ secretKey, label, placeholder, hint }) => (
            <div key={secretKey}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)' }}>{label}</label>
                {providerSaved[secretKey] && (
                  <span style={{ fontSize: 10, color: 'var(--caval-success)', fontWeight: 600 }}>salvat</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4 }}>{hint}</div>
              <input
                type="password"
                value={providerDraft[secretKey] ?? ''}
                placeholder={placeholder}
                onChange={(e) => setProviderDraft((d) => ({ ...d, [secretKey]: e.target.value }))}
                onBlur={() => void saveProviderSecret(secretKey, providerDraft[secretKey] ?? '')}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)', display: 'block', marginBottom: 6 }}>
              Ollama URL
            </label>
            <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4 }}>
              Modele locale: qwen2.5-coder:7b, llama3.1:8b, etc.
            </div>
            <input
              type="text"
              value={ollamaUrlDraft}
              placeholder="http://localhost:11434"
              onChange={(e) => setOllamaUrlDraft(e.target.value)}
              onBlur={() => void saveOllamaUrl(ollamaUrlDraft)}
              style={inputStyle}
            />
          </div>

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
                  style={inputStyle}
                />
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => void runHealthCheck()}
            disabled={healthChecking}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-bg)',
              color: 'var(--caval-text)',
              fontSize: 11,
              cursor: healthChecking ? 'wait' : 'pointer',
              textAlign: 'left',
            }}
          >
            {healthChecking ? 'Verific modelele…' : 'Verifică toate modelele'}
          </button>
          {healthSummary && (
            <div style={{
              fontSize: 11,
              color: 'var(--caval-text-muted)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              padding: '8px 10px',
              borderRadius: 6,
              background: 'var(--caval-bg)',
              border: '1px solid var(--caval-border)',
            }}>
              {healthSummary}
            </div>
          )}
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
            onClick={() => void handleSaveAll()}
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
