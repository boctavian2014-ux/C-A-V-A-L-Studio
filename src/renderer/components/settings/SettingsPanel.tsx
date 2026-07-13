import React, { useEffect, useState } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useSettingsStore, type SettingsSection } from '../../store/settings-store';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { ApiKeysForm } from '../../../../ai/composer/ApiKeysForm';
import { normalizeSecretsMap } from '../../../../ai/models/api-secrets';
import { CavaloHorseMark } from '../brand/CavaloHorseMark';

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  {
    id: 'general',
    label: 'General',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polyline points="16 18 22 12 16 6" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="8 6 2 12 8 18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'ai',
    label: 'AI & Chei API',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4z" strokeLinejoin="round" />
        <path d="M6 10h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'arena',
    label: 'Coding Arena',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16M4 12h10M4 18h16" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'cad-cloud',
    label: 'Robotics & CAD',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'shortcuts',
    label: 'Scurtături',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'Despre CAVALLO',
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

  const setTheme = (theme: 'dark' | 'light') => {
    updateApp({ theme });
    setMode(theme);
  };

  useEffect(() => {
    if (app.theme !== mode) setMode(app.theme);
  }, [app.theme, mode, setMode]);

  return (
    <>
      <Section title="Aspect">
        <Row label="Temă" desc="Dark sau light pentru întreaga aplicație">
          <Select
            value={app.theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </Row>
        <Row label="Limbă" desc="Interfață (i18n în curs)">
          <Select
            value={app.language}
            onChange={(v) => updateApp({ language: v })}
            options={[
              { value: 'ro', label: 'Română' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

function SectionEditor() {
  const { app, updateApp } = useSettingsStore();

  return (
    <>
      <Section title="Monaco Editor">
        <Row label="Font size" desc="Dimensiunea fontului în editor">
          <NumberInput value={app.fontSize} onChange={(v) => updateApp({ fontSize: v })} min={8} max={32} />
        </Row>
        <Row label="Tab size">
          <Select
            value={String(app.tabSize) as '2' | '4' | '8'}
            onChange={(v) => updateApp({ tabSize: parseInt(v, 10) })}
            options={[
              { value: '2', label: '2 spații' },
              { value: '4', label: '4 spații' },
              { value: '8', label: '8 spații' },
            ]}
          />
        </Row>
        <Row label="Word wrap" desc="Înfășoară liniile lungi">
          <Toggle value={app.wordWrap} onChange={(v) => updateApp({ wordWrap: v })} />
        </Row>
        <Row label="Minimap" desc="Harta minimă din dreapta editorului">
          <Toggle value={app.minimap} onChange={(v) => updateApp({ minimap: v })} />
        </Row>
      </Section>
    </>
  );
}

function SectionAi() {
  return (
    <Section title="Provideri & chei API">
      <ApiKeysForm showSaveButton />
    </Section>
  );
}

function SectionArena() {
  const { strictReview, setStrictReview } = useAIStore();
  const projectPath = useEditorStore((s) => s.projectPath);

  return (
    <>
      <Section title="Pipeline agentic">
        <Row
          label="Review strict"
          desc="Pipeline complet multi-agent; dezactivat = fast pipeline când e permis în caval.jsonc"
        >
          <Toggle value={strictReview} onChange={setStrictReview} />
        </Row>
      </Section>

      <Section title="Sesiune chat">
        <InfoBox>
          Un singur chat activ per folder deschis. Click „Chat nou” arhivează conversația curentă;
          istoricul rămâne local, dar nu apare ca tab-uri vechi.
        </InfoBox>
      </Section>

      <Section title="Config avansat">
        <InfoBox>
          Modele implicite per mod (Ask, Code, Agentic, Plan, Debug), multi-agent, MCP și zero-latency
          se configurează în <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>caval.jsonc</code>
          {projectPath ? (
            <> din rădăcina proiectului deschis.</>
          ) : (
            <> — deschide un folder de proiect.</>
          )}
        </InfoBox>
      </Section>
    </>
  );
}

function SectionCadCloud() {
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [cloudOnly, setCloudOnly] = useState(true);
  const [meshyOk, setMeshyOk] = useState(false);
  const [openRouterOk, setOpenRouterOk] = useState(false);

  useEffect(() => {
    void (async () => {
      const [settingsRes, secretsRes] = await Promise.all([
        window.caval.settingsLoad?.(),
        window.caval.secretsGet?.(),
      ]);
      const s = settingsRes?.settings ?? {};
      setApiUrl(s['cad.apiUrl'] ?? '');
      setApiKey(s['cad.apiKey'] ?? '');
      const secrets = normalizeSecretsMap(secretsRes?.secrets ?? {});
      setMeshyOk(Boolean(secrets.MESHY_API_KEY?.trim()));
      setOpenRouterOk(Boolean(secrets.OPENROUTER_API_KEY?.trim()));
      const mode = await window.caval.cad?.isCloudOnly?.();
      if (mode?.cloudOnly !== undefined) setCloudOnly(mode.cloudOnly);
    })();
  }, []);

  const saveSettings = async () => {
    const res = await window.caval.settingsLoad?.();
    const prev = res?.settings ?? {};
    await window.caval.settingsSave?.({
      ...prev,
      'cad.apiUrl': apiUrl.trim(),
      'cad.apiKey': apiKey.trim(),
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setHealthMsg(null);
    await saveSettings();
    const health = await window.caval.cad?.health?.();
    setTesting(false);
    if (!health) {
      setHealthMsg('CAD API indisponibil în aplicație.');
      return;
    }
    if (!health.ok) {
      setHealthMsg(health.error ?? `Offline: ${health.url ?? '?'}`);
      return;
    }
    const parts = [
      `Conectat: ${health.url}`,
      health.openscadInstalled ? 'OpenSCAD ✓' : 'OpenSCAD ✗',
      health.openRouterConfigured ? 'OpenRouter ✓' : 'OpenRouter ✗',
      health.meshyConfigured ? 'Meshy ✓' : 'Meshy —',
    ];
    setHealthMsg(parts.join(' · '));
  };

  return (
    <div>
      <Section title="Server CAD cloud">
        <p style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.5, margin: '0 0 10px' }}>
          Generarea STL 3D pentru Robotics rulează pe serverul cloud (OpenSCAD în Docker).
          {cloudOnly ? ' Mod cloud-only activ.' : ''}
        </p>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>URL API CAD</div>
          <Input value={apiUrl} onChange={setApiUrl} placeholder="https://xxx.up.railway.app" mono />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Cheie API CAD (opțional)</div>
          <Input value={apiKey} onChange={setApiKey} placeholder="CAD_API_KEY" type="password" mono />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => void saveSettings()}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid var(--caval-border)',
              background: 'transparent', color: 'var(--caval-text)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Salvează
          </button>
          <button
            type="button"
            onClick={() => void testConnection()}
            disabled={testing || !apiUrl.trim()}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
              background: 'var(--caval-accent)', color: '#0E0E0F',
              fontSize: 12, fontWeight: 600, cursor: testing ? 'wait' : 'pointer',
            }}
          >
            {testing ? 'Testez…' : 'Testează conexiunea'}
          </button>
        </div>
        {healthMsg && (
          <div style={{
            marginTop: 10, fontSize: 11, lineHeight: 1.45,
            color: healthMsg.startsWith('Conectat') ? '#2FBF71' : '#ff7070',
          }}>
            {healthMsg}
          </div>
        )}
      </Section>

      <Section title="Chei conexe">
        <InfoBox>
          Meshy: {meshyOk ? 'configurat ✓' : 'neconfigurat — setează în AI & Chei API'}
          <br />
          OpenRouter: {openRouterOk ? 'configurat ✓' : 'neconfigurat — setează în AI & Chei API'}
        </InfoBox>
      </Section>
    </div>
  );
}

const SHORTCUTS = [
  { action: 'Toggle panou AI', keys: ['Ctrl', 'Shift', 'A'] },
  { action: 'Command Palette', keys: ['Ctrl', 'Shift', 'P'] },
  { action: 'Quick Open fișier', keys: ['Ctrl', 'P'] },
  { action: 'Toggle Explorer', keys: ['Ctrl', 'Shift', 'E'] },
  { action: 'Toggle Git', keys: ['Ctrl', 'Shift', 'G'] },
  { action: 'Setări', keys: ['Ctrl', ','] },
  { action: 'Salvează fișier', keys: ['Ctrl', 'S'] },
  { action: 'Deschide folder', keys: ['Ctrl', 'O'] },
  { action: 'Caută în proiect', keys: ['Ctrl', 'Shift', 'F'] },
  { action: 'Commit rapid (Git)', keys: ['Ctrl', 'Enter'] },
];

function SectionShortcuts() {
  return (
    <Section title="Scurtături tastatură">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SHORTCUTS.map(({ action, keys }) => (
          <div
            key={action}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--caval-text)' }}>{action}</span>
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

function SectionAbout() {
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
            CAVALLO
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
            Version 0.1.0 · Build 2026.07
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.6, maxWidth: 300 }}>
          IDE pentru dezvoltatori — Monaco Editor, Coding Arena cu pipeline agentic,
          OpenRouter multi-model, Robotics CAD și Git integrat.
        </div>
      </div>

      <Section title="Stack">
        {[
          ['Runtime', 'Electron + Node.js'],
          ['UI', 'React + TypeScript'],
          ['Editor', 'Monaco Editor'],
          ['AI', 'OpenRouter · Ollama · BYOK'],
          ['Engineering', 'CAD cloud · OpenSCAD · Meshy'],
          ['Git', 'Integrat în workbench'],
        ].map(([k, v]) => (
          <Row key={k} label={k}>
            <span style={{ fontSize: 11, color: 'var(--caval-text-muted)' }}>{v}</span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const { activeSection, setActiveSection } = useSettingsStore();

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return <SectionGeneral />;
      case 'editor': return <SectionEditor />;
      case 'ai': return <SectionAi />;
      case 'arena': return <SectionArena />;
      case 'cad-cloud': return <SectionCadCloud />;
      case 'shortcuts': return <SectionShortcuts />;
      case 'about': return <SectionAbout />;
      default: return <SectionGeneral />;
    }
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeSection);

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
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)' }}>Setări</span>
          {onClose && (
            <button type="button" onClick={onClose} style={{
              width: 20, height: 20, border: 'none', background: 'none',
              color: 'var(--caval-text-muted)', cursor: 'pointer', fontSize: 15,
            }}>×</button>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 6px' }}>
          {NAV_ITEMS.map((item) => (
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
