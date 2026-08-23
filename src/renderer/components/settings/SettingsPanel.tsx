import React, { useEffect, useState } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useSettingsStore, type SettingsSection } from '../../store/settings-store';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { ApiKeysForm } from '../../../../ai/composer/ApiKeysForm';
import { AiProvidersPanel } from '../../../../ai/composer/AiProvidersPanel';
import { CavaloHorseMark } from '../brand/CavaloHorseMark';
import {
  PUBLISHER_ADDRESS_LINES,
  PUBLISHER_COPYRIGHT_LINE,
  PUBLISHER_EMAIL,
  PUBLISHER_LEGAL_NAME,
  PUBLISHER_LICENSE_SUMMARY,
  PUBLISHER_REGISTER_NOTE,
  PUBLISHER_TRADEMARK_LINE,
  PUBLISHER_UIC,
} from '../../../shared/publisher-legal';
import { formatCadDualHealth } from '../../../../ai/engineering/cad-dual-health';
import { ProjectHealthPanel } from '../health/ProjectHealthPanel';
import { useTranslation } from '../../../../ai/i18n/useTranslation';
import {
  createTranslator,
  LOCALE_NATIVE_LABELS,
  SUPPORTED_LOCALES,
  type AppLocale,
} from '../../../../ai/i18n/index';
import type { MessageKey } from '../../../../ai/i18n/locales/en';
import type { CadConnectionSettingsSnapshot, CadConnectionSource } from '../../../shared/cad-connection-settings-contract';
import { showWorkbenchToast } from '../../commands/workbench-toast';

const NAV_ITEMS: { id: SettingsSection; labelKey: MessageKey; icon: React.ReactNode }[] = [
  {
    id: 'general',
    labelKey: 'settings.nav.general',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'editor',
    labelKey: 'settings.nav.editor',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="16 18 22 12 16 6" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="8 6 2 12 8 18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'ai',
    labelKey: 'settings.nav.ai',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4z" strokeLinejoin="round" />
        <path d="M6 10h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'arena',
    labelKey: 'settings.nav.arena',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16M4 12h10M4 18h16" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'cad-cloud',
    labelKey: 'settings.nav.cad',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'health',
    labelKey: 'settings.nav.health',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'shortcuts',
    labelKey: 'settings.nav.shortcuts',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'about',
    labelKey: 'settings.nav.about',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--caval-text-muted)',
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid var(--caval-border)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16,
      padding: '6px 0',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--caval-text)', fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none',
        background: value ? 'var(--caval-accent)' : 'rgba(255,255,255,0.12)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        opacity: disabled ? 0.4 : 1, flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
        borderRadius: 5, padding: '5px 9px',
        color: 'var(--caval-text)', fontSize: 12,
        fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
        outline: 'none', width: '100%', boxSizing: 'border-box',
      }}
    />
  );
}

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
        borderRadius: 5, padding: '4px 8px',
        color: 'var(--caval-text)', fontSize: 12, cursor: 'pointer',
        outline: 'none', minWidth: 100,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function NumberInput({
  value, onChange, min, max, step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
        borderRadius: 5, padding: '4px 8px',
        color: 'var(--caval-text)', fontSize: 12,
        outline: 'none', width: 70,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    />
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.5,
      padding: '10px 12px', borderRadius: 6,
      background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function SectionGeneral() {
  const { app, updateApp } = useSettingsStore();
  const { mode, setMode } = useCavalTheme();
  const { t, locale, setLocale } = useTranslation();

  const setTheme = (theme: 'dark' | 'light') => {
    updateApp({ theme });
    setMode(theme);
  };

  useEffect(() => {
    if (app.theme !== mode) setMode(app.theme);
  }, [app.theme, mode, setMode]);

  return (
    <>
      <Section title={t('settings.appearance')}>
        <Row label={t('settings.theme')} desc={t('settings.themeDesc')}>
          <Select
            value={app.theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: t('settings.theme.dark') },
              { value: 'light', label: t('settings.theme.light') },
            ]}
          />
        </Row>
        <Row label={t('settings.displayLanguage')} desc={t('settings.displayLanguageHint')}>
          <Select
            value={locale}
            onChange={(v) => {
              const next = v as AppLocale;
              void setLocale(next).then(() => {
                showWorkbenchToast(createTranslator(next)('settings.localeChanged'));
              });
            }}
            options={SUPPORTED_LOCALES.map((id) => ({
              value: id,
              label: LOCALE_NATIVE_LABELS[id],
            }))}
          />
        </Row>
      </Section>
    </>
  );
}

function SectionEditor() {
  const { app, updateApp } = useSettingsStore();
  const { t } = useTranslation();

  return (
    <>
      <Section title={t('settings.editor.title')}>
        <Row label={t('settings.editor.fontSize')} desc={t('settings.editor.fontSizeDesc')}>
          <NumberInput value={app.fontSize} onChange={(v) => updateApp({ fontSize: v })} min={8} max={32} />
        </Row>
        <Row label={t('settings.editor.tabSize')}>
          <Select
            value={String(app.tabSize) as '2' | '4' | '8'}
            onChange={(v) => updateApp({ tabSize: parseInt(v, 10) })}
            options={[
              { value: '2', label: t('settings.editor.spaces', { count: 2 }) },
              { value: '4', label: t('settings.editor.spaces', { count: 4 }) },
              { value: '8', label: t('settings.editor.spaces', { count: 8 }) },
            ]}
          />
        </Row>
        <Row label={t('settings.editor.wordWrap')} desc={t('settings.editor.wordWrapDesc')}>
          <Toggle value={app.wordWrap} onChange={(v) => updateApp({ wordWrap: v })} />
        </Row>
        <Row label={t('settings.editor.minimap')} desc={t('settings.editor.minimapDesc')}>
          <Toggle value={app.minimap} onChange={(v) => updateApp({ minimap: v })} />
        </Row>
      </Section>
    </>
  );
}

function SectionAi() {
  const { t } = useTranslation();
  return (
    <>
      <Section title={t('settings.ai.providersSection')}>
        <AiProvidersPanel />
      </Section>
      <Section title={t('settings.ai.legacySection')}>
        <ApiKeysForm showSaveButton />
      </Section>
    </>
  );
}

function SectionArena() {
  const { strictReview, setStrictReview } = useAIStore();
  const projectPath = useEditorStore((s) => s.projectPath);
  const { t } = useTranslation();

  return (
    <>
      <Section title={t('settings.arena.pipeline')}>
        <Row
          label={t('settings.arena.strictReview')}
          desc={t('settings.arena.strictReviewDesc')}
        >
          <Toggle value={strictReview} onChange={setStrictReview} />
        </Row>
      </Section>

      <Section title={t('settings.arena.chatSession')}>
        <InfoBox>
          {t('settings.arena.chatSessionHint')}
        </InfoBox>
      </Section>

      <Section title={t('settings.arena.advanced')}>
        <InfoBox>
          {projectPath
            ? t('settings.arena.advancedHintOpen')
            : t('settings.arena.advancedHintClosed')}
        </InfoBox>
      </Section>
    </>
  );
}

function cadSourceLabel(source: CadConnectionSource, t: ReturnType<typeof createTranslator>): string {
  switch (source) {
    case 'env':
      return t('settings.cad.sourceEnv');
    case 'user':
      return t('settings.cad.sourceUser');
    case 'default':
      return t('settings.cad.sourceDefault');
    default:
      return t('settings.cad.sourceNone');
  }
}

function SectionCadCloud() {
  const { t } = useTranslation();
  const [cadConnection, setCadConnection] = useState<CadConnectionSettingsSnapshot>({
    configured: false,
    source: 'none',
  });
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [healthTone, setHealthTone] = useState<'ok' | 'warn' | 'err'>('err');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cloudOnly, setCloudOnly] = useState(true);
  const [meshyOk, setMeshyOk] = useState(false);
  const [piapiOk, setPiapiOk] = useState(false);
  const [openRouterOk, setOpenRouterOk] = useState(false);

  const envLocked = cadConnection.source === 'env';

  const refreshCadConnection = async () => {
    const settingsRes = await window.caval.settingsLoad?.();
    if (settingsRes?.cadConnection) {
      setCadConnection(settingsRes.cadConnection);
    }
    return settingsRes;
  };

  useEffect(() => {
    void (async () => {
      const [settingsRes, secretsRes] = await Promise.all([
        refreshCadConnection(),
        window.caval.secretsGet?.(),
      ]);
      const s = settingsRes?.settings ?? {};
      setApiKey('');
      const configured = secretsRes?.configured ?? {};
      setMeshyOk(
        Boolean(configured.MESHY_API_KEY) || s['mesh.configured'] === 'true'
      );
      setPiapiOk(
        Boolean(configured.PIAPI_API_KEY) ||
          Boolean(configured.TRELLIS_API_KEY) ||
          s['trellis.configured'] === 'true'
      );
      setOpenRouterOk(
        Boolean(configured.OPENROUTER_API_KEY) || s['openrouter.configured'] === 'true'
      );
      const mode = await window.caval.cad?.isCloudOnly?.();
      if (mode?.cloudOnly !== undefined) setCloudOnly(mode.cloudOnly);
    })();
  }, []);

  const saveCustomConnection = async (): Promise<boolean> => {
    if (!draftUrl.trim()) return false;
    setSaving(true);
    try {
      const res = await window.caval.settingsSave?.({ 'cad.apiUrl': draftUrl.trim() });
      if (!res?.ok) {
        showWorkbenchToast(res?.error ?? t('settings.cad.saveFailed'));
        return false;
      }
      if (res.cadConnection) setCadConnection(res.cadConnection);
      setDraftUrl('');
      setEditing(false);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const removeCustomConnection = async () => {
    setSaving(true);
    try {
      const res = await window.caval.settingsSave?.({ cadApiUrlAction: 'clear' });
      if (!res?.ok) {
        showWorkbenchToast(res?.error ?? t('settings.cad.saveFailed'));
        return;
      }
      if (res.cadConnection) setCadConnection(res.cadConnection);
      setEditing(false);
      setDraftUrl('');
    } finally {
      setSaving(false);
    }
  };

  const saveApiKey = async () => {
    if (apiKey.trim()) {
      await window.caval.secretsSet?.({ CAD_API_KEY: apiKey.trim() });
      setApiKey('');
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setHealthMsg(null);
    try {
      if (editing && draftUrl.trim()) {
        const saved = await saveCustomConnection();
        if (!saved) return;
      } else {
        await saveApiKey();
      }
      const [secretsRes, health] = await Promise.all([
        window.caval.secretsGet?.(),
        window.caval.cad?.health?.(),
      ]);
      const configured = secretsRes?.configured ?? {};
      const localOpenRouter = Boolean(configured.OPENROUTER_API_KEY) || openRouterOk;
      const localPiapi =
        Boolean(configured.PIAPI_API_KEY) ||
        Boolean(configured.TRELLIS_API_KEY) ||
        piapiOk;

      if (!health) {
        setHealthTone('err');
        setHealthMsg(t('settings.cad.unavailable'));
        return;
      }

      const dual = formatCadDualHealth({
        localOpenRouter,
        localPiapi,
        cloudOk: Boolean(health.ok),
        cloudOpenRouter: health.openRouterConfigured,
        cloudPiapi: health.piapiConfigured,
        openscadInstalled: health.openscadInstalled,
      });
      setHealthTone(dual.tone);
      const extras = [
        health.meshWorkerConfigured ? 'Worker ✓' : null,
        health.meshyConfigured ? 'Meshy ✓' : null,
      ].filter(Boolean);
      setHealthMsg(extras.length ? `${dual.text}\n${extras.join(' · ')}` : dual.text);
    } finally {
      setTesting(false);
    }
  };

  const healthColor =
    healthTone === 'ok' ? '#2FBF71' : healthTone === 'warn' ? '#E6A817' : '#ff7070';

  return (
    <div>
      <Section title={t('settings.cad.server')}>
        <p style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.5, margin: '0 0 10px' }}>
          {t('settings.cad.serverDesc')}
          {cloudOnly ? ` ${t('settings.cad.cloudOnly')}` : ''}
        </p>

        {!editing ? (
          <>
            <div style={{
              marginBottom: 10, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--caval-border)', background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                {cadConnection.configured
                  ? t('settings.cad.connectionConfigured')
                  : t('settings.cad.connectionNotConfigured')}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)' }}>
                {t('settings.cad.connectionSource')}: {cadSourceLabel(cadConnection.source, t)}
              </div>
              {envLocked ? (
                <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 6 }}>
                  {t('settings.cad.envManaged')}
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {!envLocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setDraftUrl('');
                  }}
                  style={{
                    padding: '8px 12px', borderRadius: 6, border: '1px solid var(--caval-border)',
                    background: 'transparent', color: 'var(--caval-text)', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {t('settings.cad.changeConnection')}
                </button>
              ) : null}
              {cadConnection.source === 'user' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void removeCustomConnection()}
                  style={{
                    padding: '8px 12px', borderRadius: 6, border: '1px solid var(--caval-border)',
                    background: 'transparent', color: 'var(--caval-text-muted)', fontSize: 12,
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {t('settings.cad.removeCustom')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void testConnection()}
                disabled={testing}
                style={{
                  padding: '8px 12px', borderRadius: 6, border: 'none',
                  background: 'var(--caval-accent)', color: '#0E0E0F',
                  fontSize: 12, fontWeight: 600, cursor: testing ? 'wait' : 'pointer',
                }}
              >
                {testing ? t('settings.cad.testing') : t('settings.cad.test')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                {t('settings.cad.newUrlLabel')}
              </div>
              <Input
                value={draftUrl}
                onChange={setDraftUrl}
                placeholder={t('settings.cad.newUrlPlaceholder')}
                mono
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                disabled={saving || !draftUrl.trim()}
                onClick={() => void saveCustomConnection()}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                  background: 'var(--caval-accent)', color: '#0E0E0F',
                  fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? t('settings.cad.saving') : t('settings.cad.saveConnection')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftUrl('');
                }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid var(--caval-border)',
                  background: 'transparent', color: 'var(--caval-text)', fontSize: 12, cursor: 'pointer',
                }}
              >
                {t('settings.cad.cancelEdit')}
              </button>
            </div>
          </>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{t('settings.cad.apiKey')}</div>
          <Input value={apiKey} onChange={setApiKey} placeholder="CAD_API_KEY" type="password" mono />
        </div>
        <button
          type="button"
          onClick={() => void saveApiKey()}
          disabled={!apiKey.trim()}
          style={{
            width: '100%', padding: '8px 0', borderRadius: 6, border: '1px solid var(--caval-border)',
            background: 'transparent', color: 'var(--caval-text)', fontSize: 12,
            cursor: apiKey.trim() ? 'pointer' : 'default', marginBottom: 8,
          }}
        >
          {t('settings.cad.saveApiKey')}
        </button>

        {healthMsg && (
          <div style={{
            marginTop: 10, fontSize: 11, lineHeight: 1.45, whiteSpace: 'pre-wrap',
            color: healthColor,
          }}>
            {healthMsg}
          </div>
        )}
      </Section>

      <Section title={t('settings.cad.relatedKeys')}>
        <InfoBox>
          {piapiOk ? t('settings.cad.piapiOk') : t('settings.cad.piapiMissing')}
          {' · '}
          {meshyOk ? t('settings.cad.meshyOk') : t('settings.cad.meshyOptional')}
          <br />
          {openRouterOk ? t('settings.cad.openRouterOk') : t('settings.cad.openRouterMissing')}
          <br />
          {t('settings.cad.cloudHealthHint')}
        </InfoBox>
      </Section>
    </div>
  );
}

const SHORTCUT_DEFS: { actionKey: MessageKey; keys: string[] }[] = [
  { actionKey: 'settings.shortcuts.toggleAi', keys: ['Ctrl', 'Shift', 'A'] },
  { actionKey: 'settings.shortcuts.commandPalette', keys: ['Ctrl', 'Shift', 'P'] },
  { actionKey: 'settings.shortcuts.quickOpen', keys: ['Ctrl', 'P'] },
  { actionKey: 'settings.shortcuts.workspaceSymbols', keys: ['Ctrl', 'T'] },
  { actionKey: 'settings.shortcuts.toggleExplorer', keys: ['Ctrl', 'Shift', 'E'] },
  { actionKey: 'settings.shortcuts.toggleGit', keys: ['Ctrl', 'Shift', 'G'] },
  { actionKey: 'settings.shortcuts.settings', keys: ['Ctrl', ','] },
  { actionKey: 'settings.shortcuts.saveFile', keys: ['Ctrl', 'S'] },
  { actionKey: 'settings.shortcuts.openFolder', keys: ['Ctrl', 'O'] },
  { actionKey: 'settings.shortcuts.searchProject', keys: ['Ctrl', 'Shift', 'F'] },
  { actionKey: 'settings.shortcuts.quickCommit', keys: ['Ctrl', 'Enter'] },
];

function SectionShortcuts() {
  const { t } = useTranslation();
  return (
    <Section title={t('settings.shortcuts.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SHORTCUT_DEFS.map(({ actionKey, keys }) => (
          <div
            key={actionKey}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--caval-text)' }}>{t(actionKey)}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {keys.map((k) => (
                <kbd key={k} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--caval-border)',
                  color: 'var(--caval-text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SectionHealth() {
  return <ProjectHealthPanel />;
}

function SectionAbout() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        padding: '24px 20px', borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(0,224,255,0.05), rgba(124,58,237,0.05))',
        border: '1px solid rgba(0,224,255,0.1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        textAlign: 'center',
      }}>
        <CavaloHorseMark size={52} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--caval-text)', letterSpacing: '0.06em' }}>
            {t('settings.about.brand')}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
            {t('settings.about.version', { version: '0.1.0', build: '2026.07' })}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.6, maxWidth: 300 }}>
          {t('settings.about.tagline')}
        </div>
      </div>

      <Section title={t('settings.about.copyright')}>
        <div style={{
          fontSize: 12, color: 'var(--caval-text)', lineHeight: 1.55,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div>{PUBLISHER_COPYRIGHT_LINE}</div>
          <div style={{ color: 'var(--caval-text-muted)' }}>{PUBLISHER_TRADEMARK_LINE}</div>
          <div style={{ color: 'var(--caval-text-muted)' }}>{PUBLISHER_LICENSE_SUMMARY}</div>
        </div>
      </Section>

      <Section title={t('settings.about.publisher')}>
        <div style={{
          fontSize: 12, color: 'var(--caval-text)', lineHeight: 1.55,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontWeight: 600 }}>{PUBLISHER_LEGAL_NAME}</div>
          <div style={{ color: 'var(--caval-text-muted)' }}>UIC {PUBLISHER_UIC}</div>
          <div style={{ color: 'var(--caval-text-muted)', marginTop: 4 }}>{PUBLISHER_REGISTER_NOTE}</div>
          {PUBLISHER_ADDRESS_LINES.map((line) => (
            <div key={line} style={{ color: 'var(--caval-text-muted)' }}>{line}</div>
          ))}
          <a
            href={`mailto:${PUBLISHER_EMAIL}`}
            style={{ color: 'var(--caval-accent)', marginTop: 6, textDecoration: 'none' }}
          >
            {PUBLISHER_EMAIL}
          </a>
        </div>
      </Section>

      <Section title={t('settings.about.stack')}>
        {([
          ['settings.about.stack.runtime', 'Electron + Node.js'],
          ['settings.about.stack.ui', 'React + TypeScript'],
          ['settings.about.stack.editor', 'Monaco Editor'],
          ['settings.about.stack.ai', 'OpenRouter · Ollama · BYOK'],
          ['settings.about.stack.engineering', 'CAD cloud · OpenSCAD · TRELLIS / Meshy'],
          ['settings.about.stack.git', t('settings.about.stack.gitValue')],
        ] as const).map(([k, v]) => (
          <Row key={k} label={t(k)}>
            <span style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>{v}</span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const { activeSection, setActiveSection } = useSettingsStore();
  const { t } = useTranslation();

  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }));

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return <SectionGeneral />;
      case 'editor': return <SectionEditor />;
      case 'ai': return <SectionAi />;
      case 'arena': return <SectionArena />;
      case 'cad-cloud': return <SectionCadCloud />;
      case 'health': return <SectionHealth />;
      case 'shortcuts': return <SectionShortcuts />;
      case 'about': return <SectionAbout />;
      default: return <SectionGeneral />;
    }
  };

  const currentNav = navItems.find((n) => n.id === activeSection);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--caval-bg)' }}>
      <div style={{
        width: 190, flexShrink: 0,
        borderRight: '1px solid var(--caval-border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', background: 'var(--caval-surface)',
      }}>
        <div style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--caval-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)' }}>{t('nav.settings')}</span>
          {onClose && (
            <button type="button" onClick={onClose} title={t('common.close')} aria-label={t('common.close')} style={{
              width: 20, height: 20, border: 'none', background: 'none',
              color: 'var(--caval-text-muted)', cursor: 'pointer', fontSize: 15,
            }}>×</button>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 6px' }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              style={{
                width: '100%', padding: '7px 8px', borderRadius: 5,
                border: 'none', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                background: activeSection === item.id ? 'rgba(0,224,255,0.08)' : 'transparent',
                color: activeSection === item.id ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
              }}
            >
              {item.icon}
              <span style={{ fontSize: 12, fontWeight: activeSection === item.id ? 600 : 400 }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px' }} className="ai-messages-scroll">
        {currentNav && (
          <h2 style={{
            fontSize: 16, fontWeight: 700, color: 'var(--caval-text)',
            margin: '0 0 18px', letterSpacing: '-0.01em',
          }}>
            {currentNav.label}
          </h2>
        )}
        {renderContent()}
      </div>
    </div>
  );
}
