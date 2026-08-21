import React, { useEffect, useState } from 'react';
import { useAIStore } from './ai-store';
import type { ApiKeys } from '../multi-model/provider';
import {
  buildSecretsPatch,
  apiKeysToSecrets,
  filterNonEmptySecretsPatch,
} from '../models/api-secrets';
import { formatCadDualHealthOneLine } from '../engineering/cad-dual-health';
import { OLLAMA_LOOPBACK_URL } from '../../src/shared/local-ai-contract';

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
    secretKey: 'PIAPI_API_KEY',
    label: 'PiAPI Trellis (text-to-3D)',
    placeholder: 'piapi-...',
    hint: 'Robotics text-to-3D — api.piapi.ai (Qubico/trellis)',
  },
  {
    secretKey: 'MESHY_API_KEY',
    label: 'Meshy (fallback)',
    placeholder: 'meshy-...',
    hint: 'Fallback mesh organic — Robotics CAD',
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

const SECRET_LABELS: Record<string, string> = {
  OPENROUTER_API_KEY: 'OpenRouter',
  POOLSIDE_API_KEY: 'Poolside',
  NVIDIA_API_KEY: 'NVIDIA NIM',
  NORTH_API_KEY: 'North',
  PIAPI_API_KEY: 'PiAPI Trellis',
  MESHY_API_KEY: 'Meshy',
  GITHUB_PERSONAL_ACCESS_TOKEN: 'GitHub PAT',
  SEMGREP_APP_TOKEN: 'Semgrep',
  ANTHROPIC_API_KEY: 'Anthropic',
  OPENAI_API_KEY: 'OpenAI',
  GOOGLE_API_KEY: 'Google',
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

export interface ApiKeysFormProps {
  /** Show footer with Salvează button (Settings embed). Modal uses its own footer. */
  showSaveButton?: boolean;
  onSaved?: () => void;
}

type PersistResult = {
  ok: boolean;
  savedKeys: string[];
  error?: 'empty' | 'unavailable' | 'failed';
  message?: string;
};

type LocalAiStatus = {
  supported: boolean;
  platform: string;
  installed: boolean;
  running: boolean;
  configuredUrl: string;
  runtimePath?: string;
  models: string[];
  defaultModel: string;
  defaultModelReady: boolean;
  managedByCaval: boolean;
  inProgress: boolean;
  policy: string;
};

export function ApiKeysForm({ showSaveButton = false, onSaved }: ApiKeysFormProps) {
  const { apiKeys, setApiKey } = useAIStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [providerDraft, setProviderDraft] = useState<Record<string, string>>({});
  const [providerSaved, setProviderSaved] = useState<Record<string, boolean>>({});
  const [openRouterDraft, setOpenRouterDraft] = useState('');
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState<string>(OLLAMA_LOOPBACK_URL);
  const [openRouterSaved, setOpenRouterSaved] = useState(false);
  const [byokSaved, setByokSaved] = useState<Record<string, boolean>>({});
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthSummary, setHealthSummary] = useState<string | null>(null);
  const [cadChecking, setCadChecking] = useState(false);
  const [cadSummary, setCadSummary] = useState<string | null>(null);
  const [cadTone, setCadTone] = useState<'ok' | 'warn' | 'err'>('ok');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(
    null
  );
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus | null>(null);
  const [localAiBusy, setLocalAiBusy] = useState(false);
  const [localAiMessage, setLocalAiMessage] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null
  );

  const refreshLocalAiStatus = async () => {
    const res = await window.caval.localAiStatus?.();
    if (res?.ok && res.status) {
      setLocalAiStatus(res.status);
    }
  };

  const refreshConfiguredBadges = async (): Promise<Record<string, boolean>> => {
    const res = await window.caval.secretsGet?.();
    const configured = res?.configured ?? {};
    setOpenRouterSaved(Boolean(configured.OPENROUTER_API_KEY));
    const saved: Record<string, boolean> = {};
    for (const { secretKey } of PROVIDER_SECRET_FIELDS) {
      saved[secretKey] = Boolean(configured[secretKey]);
    }
    setProviderSaved(saved);
    setByokSaved({
      anthropic: Boolean(configured.ANTHROPIC_API_KEY),
      openai: Boolean(configured.OPENAI_API_KEY),
      google: Boolean(configured.GOOGLE_API_KEY),
    });
    return configured;
  };

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const { key } of KEY_FIELDS) {
      initial[key] = '';
    }
    setDraft(initial);
    void Promise.all([
      window.caval.settingsLoad?.(),
      window.caval.secretsGet?.(),
    ]).then(([_settingsRes, secretsRes]) => {
      const configured = secretsRes?.configured ?? {};
      setOpenRouterDraft('');
      setOpenRouterSaved(Boolean(configured.OPENROUTER_API_KEY));
      setByokSaved({
        anthropic: Boolean(configured.ANTHROPIC_API_KEY),
        openai: Boolean(configured.OPENAI_API_KEY),
        google: Boolean(configured.GOOGLE_API_KEY),
      });
      setOllamaUrlDraft(OLLAMA_LOOPBACK_URL);
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
    void refreshLocalAiStatus();
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

  const persistSecretsPatch = async (patch: Record<string, string>): Promise<PersistResult> => {
    const { filtered, savedKeys } = filterNonEmptySecretsPatch(patch);
    if (savedKeys.length === 0) {
      return { ok: false, savedKeys: [], error: 'empty' };
    }
    if (!window.caval.secretsSet) {
      return {
        ok: false,
        savedKeys: [],
        error: 'unavailable',
        message: 'Salvarea cheilor nu e disponibilă — repornește aplicația.',
      };
    }
    try {
      const result = await window.caval.secretsSet(filtered);
      if (result && result.ok === false) {
        return {
          ok: false,
          savedKeys: [],
          error: 'failed',
          message: 'Salvarea a eșuat pe disc.',
        };
      }
      await refreshConfiguredBadges();
      return { ok: true, savedKeys };
    } catch (err) {
      return {
        ok: false,
        savedKeys: [],
        error: 'failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const handleSave = (key: keyof ApiKeys) => {
    const value = draft[key] ?? '';
    if (!value.trim()) return;
    setApiKey(key, value);
    void persistSecretsPatch(apiKeysToSecrets({ [key]: value } as ApiKeys)).then((result) => {
      if (result.ok) {
        void refreshConfiguredBadges();
        setDraft((d) => ({ ...d, [key]: '' }));
      }
    });
  };

  const saveOpenRouter = async (value: string) => {
    if (!value.trim()) return;
    const result = await persistSecretsPatch({ OPENROUTER_API_KEY: value });
    if (result.ok) {
      setOpenRouterDraft('');
      await refreshConfiguredBadges();
    }
  };

  const saveOllamaUrl = async (_value?: string) => {
    const trimmed = OLLAMA_LOOPBACK_URL;
    const settingsRes = await window.caval.settingsLoad?.();
    const settings = { ...(settingsRes?.settings ?? {}), [OLLAMA_URL_SETTING]: trimmed };
    await window.caval.settingsSave?.(settings);
    setOllamaUrlDraft(trimmed);
  };

  const saveProviderSecret = async (secretKey: string, value: string) => {
    if (!value.trim()) return;
    const result = await persistSecretsPatch({ [secretKey]: value });
    if (result.ok) {
      setProviderDraft((d) => ({ ...d, [secretKey]: '' }));
      await refreshConfiguredBadges();
    }
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

  const runCadHealthCheck = async () => {
    setCadChecking(true);
    setCadSummary(null);
    try {
      const [secretsRes, health] = await Promise.all([
        window.caval.secretsGet?.(),
        window.caval.cad?.health?.(),
      ]);
      const configured = secretsRes?.configured ?? {};
      const dual = formatCadDualHealthOneLine({
        localOpenRouter: Boolean(configured.OPENROUTER_API_KEY),
        localPiapi: Boolean(configured.PIAPI_API_KEY) || Boolean(configured.TRELLIS_API_KEY),
        cloudOk: Boolean(health?.ok),
        cloudUrl: health?.url,
        cloudOpenRouter: health?.openRouterConfigured,
        cloudPiapi: health?.piapiConfigured,
        openscadInstalled: health?.openscadInstalled,
        cloudError: health?.error ?? (!health ? 'CAD API indisponibil în aplicație.' : undefined),
      });
      setCadTone(dual.tone);
      setCadSummary(dual.text);
    } catch {
      setCadTone('err');
      setCadSummary('Verificare CAD indisponibilă — repornește aplicația.');
    } finally {
      setCadChecking(false);
    }
  };

  const enableLocalAi = async () => {
    setLocalAiBusy(true);
    setLocalAiMessage({ kind: 'warn', text: 'Se configurează runtime-ul local și modelul gratuit…' });
    try {
      const result = await window.caval.localAiSetup?.({
        installRuntime: true,
        pullModel: true,
        modelName: 'qwen2.5-coder:7b',
      });
      if (!result?.ok) {
        setLocalAiMessage({
          kind: 'err',
          text: result?.error ?? 'Nu am putut configura Local AI pe acest sistem.',
        });
        return;
      }
      if (result.status?.configuredUrl) {
        setOllamaUrlDraft(result.status.configuredUrl);
      }
      setLocalAiStatus(result.status ?? null);
      // Switch active model to the local-first free route.
      useAIStore.getState().setModel('caval-auto/free');
      setLocalAiMessage({
        kind: 'ok',
        text: result.summary ?? 'Local AI este gata. Modelul activ a fost setat pe Auto Free (local).',
      });
    } catch (error) {
      setLocalAiMessage({
        kind: 'err',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLocalAiBusy(false);
      await refreshLocalAiStatus();
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await persistSecretsPatch(buildFullSecretsPatch());
      if (!result.ok) {
        if (result.error === 'empty') {
          setSaveMessage({
            kind: 'info',
            text: 'Introdu cel puțin o cheie nouă în câmpuri, apoi apasă Salvează. Cheile deja salvate apar ca „salvat”.',
          });
        } else {
          setSaveMessage({
            kind: 'err',
            text: result.message ?? 'Salvarea a eșuat.',
          });
        }
        return;
      }

      const configured = await refreshConfiguredBadges();
      useAIStore.setState({
        apiKeys: {
          anthropic: configured.ANTHROPIC_API_KEY ? '__configured__' : undefined,
          openai: configured.OPENAI_API_KEY ? '__configured__' : undefined,
          google: configured.GOOGLE_API_KEY ? '__configured__' : undefined,
        },
      });

      const savedSet = new Set(result.savedKeys);
      if (savedSet.has('OPENROUTER_API_KEY')) setOpenRouterDraft('');
      setDraft((prev) => ({
        anthropic: savedSet.has('ANTHROPIC_API_KEY') ? '' : (prev.anthropic ?? ''),
        openai: savedSet.has('OPENAI_API_KEY') ? '' : (prev.openai ?? ''),
        google: savedSet.has('GOOGLE_API_KEY') ? '' : (prev.google ?? ''),
      }));
      setProviderDraft((prev) => {
        const next = { ...prev };
        for (const key of result.savedKeys) {
          if (key in next) next[key] = '';
        }
        return next;
      });

      const labels = result.savedKeys.map((k) => SECRET_LABELS[k] ?? k).join(', ');
      setSaveMessage({ kind: 'ok', text: `Salvat: ${labels}` });
      await saveOllamaUrl(ollamaUrlDraft);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 11, color: 'var(--caval-text-muted)', margin: 0, lineHeight: 1.5 }}>
        Cheile rămân local pe dispozitivul tău. Setezi o dată — persistă după repornire.
        Câmpurile goale sunt normale după salvare: badge-ul <strong>salvat</strong> înseamnă că
        cheia e pe disc (nu a dispărut).
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
          placeholder={openRouterSaved ? '•••••••• (salvat — lipește alta ca să înlocuiești)' : 'sk-or-...'}
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
          placeholder={OLLAMA_LOOPBACK_URL}
          readOnly
          title="Ollama is loopback-only (127.0.0.1)"
          onChange={(e) => setOllamaUrlDraft(e.target.value)}
          onBlur={() => void saveOllamaUrl(ollamaUrlDraft)}
          style={inputStyle}
        />
      </div>

      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: 'var(--caval-bg)',
          border: '1px solid var(--caval-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--caval-text)' }}>Local AI gratuit</div>
            <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 2, lineHeight: 1.45 }}>
              Instalăm doar runtime-ul local. Modelul gratuit se descarcă la cerere după confirmare.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void enableLocalAi()}
            disabled={localAiBusy || localAiStatus?.inProgress}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--caval-accent)',
              color: '#0E0E0F',
              fontSize: 11,
              fontWeight: 700,
              cursor: localAiBusy ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {localAiBusy ? 'Configurare…' : 'Activează Local AI'}
          </button>
        </div>
        {localAiStatus && (
          <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', lineHeight: 1.5 }}>
            Runtime: {localAiStatus.installed ? 'instalat' : 'lipsește'}
            {' · '}
            Serviciu: {localAiStatus.running ? 'rulează' : 'oprit'}
            {' · '}
            Model implicit: {localAiStatus.defaultModelReady ? 'gata' : 'nedescărcat'}
            {localAiStatus.models.length ? (
              <>
                <br />
                Modele locale: {localAiStatus.models.join(', ')}
              </>
            ) : null}
            <br />
            {localAiStatus.policy}
          </div>
        )}
        {localAiMessage && (
          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.5,
              color:
                localAiMessage.kind === 'ok'
                  ? 'var(--caval-success)'
                  : localAiMessage.kind === 'warn'
                    ? '#E6A817'
                    : 'var(--caval-error, #f87171)',
            }}
          >
            {localAiMessage.text}
          </div>
        )}
      </div>

      {KEY_FIELDS.map(({ key, label, placeholder, hint }) => {
        const value = draft[key] ?? '';
        const isSet = Boolean(byokSaved[key]) || Boolean(apiKeys[key]?.trim());
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
              placeholder={isSet ? '•••••••• (salvat — lipește alta ca să înlocuiești)' : placeholder}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              onBlur={() => handleSave(key)}
              style={inputStyle}
            />
          </div>
        );
      })}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
        <button
          type="button"
          onClick={() => void runCadHealthCheck()}
          disabled={cadChecking}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--caval-border)',
            background: 'var(--caval-bg)',
            color: 'var(--caval-text)',
            fontSize: 11,
            cursor: cadChecking ? 'wait' : 'pointer',
            textAlign: 'left',
          }}
        >
          {cadChecking ? 'Verific CAD…' : 'Verifică CAD'}
        </button>
      </div>
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
      {cadSummary && (
        <div style={{
          fontSize: 11,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          padding: '8px 10px',
          borderRadius: 6,
          background: 'var(--caval-bg)',
          border: '1px solid var(--caval-border)',
          color:
            cadTone === 'ok'
              ? 'var(--caval-success, #2FBF71)'
              : cadTone === 'warn'
                ? '#E6A817'
                : 'var(--caval-error, #f87171)',
        }}>
          {cadSummary}
        </div>
      )}
      {saveMessage && (
        <div
          role="status"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid var(--caval-border)',
            color:
              saveMessage.kind === 'ok'
                ? 'var(--caval-success)'
                : saveMessage.kind === 'err'
                  ? 'var(--caval-error, #f87171)'
                  : 'var(--caval-text-muted)',
            background: 'var(--caval-bg)',
          }}
        >
          {saveMessage.text}
        </div>
      )}

      {showSaveButton && (
        <button
          type="button"
          onClick={() => void handleSaveAll()}
          disabled={saving}
          style={{
            alignSelf: 'flex-start',
            padding: '7px 16px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--caval-accent)',
            color: '#0E0E0F',
            fontSize: 12,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Se salvează…' : 'Salvează toate cheile'}
        </button>
      )}
    </div>
  );
}
