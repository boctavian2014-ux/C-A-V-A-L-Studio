import React, { useEffect, useState } from 'react';
import { useAIStore } from './ai-store';
import type { ApiKeys } from '../multi-model/provider';
import { buildSecretsPatch, apiKeysToSecrets } from '../models/api-secrets';

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
  {
    secretKey: 'MESHY_API_KEY',
    label: 'Meshy',
    placeholder: 'meshy-...',
    hint: 'Generare mesh organic — Robotics CAD',
  },
  {
    secretKey: 'GITHUB_PERSONAL_ACCESS_TOKEN',
    label: 'GitHub PAT (MCP read-only)',
    placeholder: 'github_pat_... sau ghp_...',
    hint: 'Fine-grained sau classic — read contents, metadata, PRs/issues (fără write)',
  },
  {
    secretKey: 'SEMGREP_APP_TOKEN',
    label: 'Semgrep App Token (opțional)',
    placeholder: 'sgp_...',
    hint: 'Opțional — Semgrep AppSec Platform; local scan funcționează fără token',
  },
];

const OLLAMA_URL_SETTING = 'ollama.url';

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

export interface ApiKeysFormProps {
  /** Show footer with Salvează button (Settings embed). Modal uses its own footer. */
  showSaveButton?: boolean;
  onSaved?: () => void;
}

export function ApiKeysForm({ showSaveButton = false, onSaved }: ApiKeysFormProps) {
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
      initial[key] = '';
    }
    setDraft(initial);
    void Promise.all([
      window.caval.settingsLoad?.(),
      window.caval.secretsGet?.(),
    ]).then(([settingsRes, secretsRes]) => {
      const configured = secretsRes?.configured ?? {};
      setOpenRouterDraft('');
      setOpenRouterSaved(Boolean(configured.OPENROUTER_API_KEY));
      setOllamaUrlDraft(settingsRes?.settings?.[OLLAMA_URL_SETTING] ?? 'http://localhost:11434');
      const providerInitial: Record<string, string> = {};
      const saved: Record<string, boolean> = {};
      for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
        providerInitial[secretKey] = '';
        saved[secretKey] = Boolean(configured[secretKey]);
      }
      setProviderDraft(providerInitial);
      setProviderSaved(saved);
      useAIStore.setState({
        apiKeys: {
          ...useAIStore.getState().apiKeys,
          anthropic: configured.ANTHROPIC_API_KEY ? '__configured__' : undefined,
          openai: configured.OPENAI_API_KEY ? '__configured__' : undefined,
          google: configured.GOOGLE_API_KEY ? '__configured__' : undefined,
        },
      });
    });
  }, []);

  const buildFullSecretsPatch = (): Record<string, string> => {
    const providerSecrets: Record<string, string> = {};
    for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
      providerSecrets[secretKey] = providerDraft[secretKey] ?? '';
    }
    return buildSecretsPatch({
      openRouter: openRouterDraft,
      providerSecrets,
      apiKeys: {
        anthropic: draft.anthropic,
        openai: draft.openai,
        google: draft.google,
      },
    });
  };

  const persistSecretsPatch = async (patch: Record<string, string>) => {
    // Skip empty-string clears for keys the user didn't touch this session (preserve main-side secrets).
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value.trim() || value === '') {
        // Only send explicit empty if user cleared a field they edited — for blur-save of empty on
        // already-configured providers, omit the key so mergeSecrets won't delete.
        if (!value.trim()) continue;
        filtered[key] = value;
      }
    }
    if (Object.keys(filtered).length === 0) return;
    await window.caval.secretsSet?.(filtered);
    const res = await window.caval.secretsGet?.();
    const configured = res?.configured ?? {};
    setOpenRouterSaved(Boolean(configured.OPENROUTER_API_KEY));
    const saved: Record<string, boolean> = {};
    for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
      saved[secretKey] = Boolean(configured[secretKey]);
    }
    setProviderSaved(saved);
  };

  const handleSave = (key: keyof ApiKeys) => {
    const value = draft[key] ?? '';
    if (!value.trim()) return; // don't wipe main-side secret on empty blur
    setApiKey(key, value);
    void persistSecretsPatch(apiKeysToSecrets({ [key]: value } as ApiKeys));
  };

  const saveOpenRouter = async (value: string) => {
    if (!value.trim()) return;
    await persistSecretsPatch({ OPENROUTER_API_KEY: value });
    setOpenRouterDraft('');
  };

  const saveOllamaUrl = async (value: string) => {
    const trimmed = value.trim() || 'http://localhost:11434';
    const settingsRes = await window.caval.settingsLoad?.();
    const settings = { ...(settingsRes?.settings ?? {}), [OLLAMA_URL_SETTING]: trimmed };
    await window.caval.settingsSave?.(settings);
    setOllamaUrlDraft(trimmed);
  };

  const saveProviderSecret = async (secretKey: string, value: string) => {
    if (!value.trim()) return;
    await persistSecretsPatch({ [secretKey]: value });
    setProviderDraft((d) => ({ ...d, [secretKey]: '' }));
  };

  const runHealthCheck = async () => {
    setHealthChecking(true);
    setHealthSummary(null);
    try {
      const res = await (window.caval as {
        modelsHealth?: () => Promise<{ ok: boolean; summary?: string }>;
      })?.modelsHealth?.();
      setHealthSummary(res?.summary ?? (res?.ok ? 'Toate providerii configurați par OK.' : 'Verificare eșuată.'));
    } catch {
      setHealthSummary('Verificare indisponibilă — repornește aplicația.');
    } finally {
      setHealthChecking(false);
    }
  };

  const handleSaveAll = async () => {
    await persistSecretsPatch(buildFullSecretsPatch());
    const res = await window.caval.secretsGet?.();
    const configured = res?.configured ?? {};
    useAIStore.setState({
      apiKeys: {
        anthropic: draft.anthropic.trim() || (configured.ANTHROPIC_API_KEY ? '__configured__' : undefined),
        openai: draft.openai.trim() || (configured.OPENAI_API_KEY ? '__configured__' : undefined),
        google: draft.google.trim() || (configured.GOOGLE_API_KEY ? '__configured__' : undefined),
      },
    });
    setDraft({ anthropic: '', openai: '', google: '' });
    setOpenRouterDraft('');
    setProviderDraft((prev) => {
      const cleared: Record<string, string> = {};
      for (const k of Object.keys(prev)) cleared[k] = '';
      return cleared;
    });
    await saveOllamaUrl(ollamaUrlDraft);
    onSaved?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 11, color: 'var(--caval-text-muted)', margin: 0, lineHeight: 1.5 }}>
        Cheile rămân local pe dispozitivul tău. Setezi o dată — persistă după repornire.
      </p>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)' }}>OpenRouter</label>
          {openRouterSaved && (
            <span style={{ fontSize: 10, color: 'var(--caval-success)', fontWeight: 600 }}>salvat</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', marginBottom: 4 }}>
          Catalog OpenRouter, Auto Balanced/Frontier (sk-or-…)
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
        const isSet = Boolean(apiKeys[key]?.trim());
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

      {showSaveButton && (
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          style={{
            alignSelf: 'flex-start',
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
          Salvează toate cheile
        </button>
      )}
    </div>
  );
}
