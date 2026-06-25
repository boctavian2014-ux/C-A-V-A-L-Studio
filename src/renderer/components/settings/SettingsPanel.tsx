import React, { useState, useCallback, useEffect } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import {
  useSettingsStore,
  type SettingsSection,
  type ImagePreset,
  DEFAULT_PRESETS,
} from '../../store/settings-store';
import { PromptLibraryPanel } from './PromptLibraryPanel';
import { useEditorStore } from '../../store/editor-store';

// ──────────────────────────────────────────────
//  SettingsPanel — Caval IDE
//  Secțiuni: Image Generator · Asset Manager ·
//            Context Bridge · Safety & Credits ·
//            Editor · App · Shortcuts · About
// ──────────────────────────────────────────────

// ── Navigare ──────────────────────────────────

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ReactNode; badge?: string }[] = [
  {
    id: 'image-generator',
    label: 'Image Generator',
    badge: 'DALL-E 3',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
        <path d="M21 15l-5-5L5 21" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'asset-manager',
    label: 'Asset Manager',
    badge: 'Presets',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="17" strokeLinecap="round" />
        <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'context-bridge',
    label: 'AI Context Bridge',
    badge: 'SMART',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'export',
    label: 'Export & Paths',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
        <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'safety',
    label: 'Safety & Credits',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
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
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'prompt-library' as SettingsSection,
    label: 'Prompt Library',
    badge: 'NEW',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'Despre Caval',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ──────────────────────────────────────────────
//  Componente UI reutilizabile
// ──────────────────────────────────────────────

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

function Row({
  label, desc, children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
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

function Toggle({
  value, onChange, disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
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
      onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
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
      onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
      onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
    />
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Image Generator
// ──────────────────────────────────────────────

function SectionImageGenerator() {
  const { app, updateApp } = useSettingsStore();

  return (
    <>
      <Section title="Provider AI">
        <Row label="Provider implicit" desc="Folosit în AI Panel și Image Generator">
          <Select
            value={app.aiProvider}
            onChange={(v) => updateApp({ aiProvider: v })}
            options={[
              { value: 'openai',    label: 'OpenAI (GPT-4o + DALL-E 3)' },
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'google',    label: 'Google (Gemini)' },
              { value: 'ollama',    label: 'Ollama (Local)' },
            ]}
          />
        </Row>
      </Section>

      <Section title="DALL-E 3 — Defaults">
        <InfoBox>
          Setările implicite sunt aplicate la fiecare generare nouă. Poți schimba
          parametrii individual din panoul de generare.
        </InfoBox>
        <Row
          label="Calitate implicită"
          desc="Standard = $0.04/img · HD = $0.08/img"
        >
          <Select
            value={'standard'}
            onChange={() => {}}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'hd',       label: 'HD' },
            ]}
          />
        </Row>
        <Row label="Stil implicit" desc="Vivid = dramatic · Natural = realist">
          <Select
            value={'vivid'}
            onChange={() => {}}
            options={[
              { value: 'vivid',   label: 'Vivid' },
              { value: 'natural', label: 'Natural' },
            ]}
          />
        </Row>
        <Row label="Dimensiune implicită">
          <Select
            value={'1024x1024'}
            onChange={() => {}}
            options={[
              { value: '1024x1024', label: '1024×1024 (1:1)' },
              { value: '1792x1024', label: '1792×1024 (16:9)' },
              { value: '1024x1792', label: '1024×1792 (9:16)' },
            ]}
          />
        </Row>
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Asset Manager & Format Presets
// ──────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  app: 'App Assets',
  marketing: 'Marketing',
  social: 'Social Media',
  custom: 'Custom',
};

function PresetCard({
  preset, onToggle, onRemove,
}: {
  preset: ImagePreset;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const isCustom = preset.category === 'custom';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '7px 10px', borderRadius: 6,
      background: preset.enabled ? 'rgba(0,224,255,0.04)' : 'var(--caval-bg)',
      border: `1px solid ${preset.enabled ? 'rgba(0,224,255,0.2)' : 'var(--caval-border)'}`,
      gap: 10, transition: 'all 0.15s',
    }}>
      {/* Toggle */}
      <Toggle value={preset.enabled} onChange={onToggle} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--caval-text)' }}>
            {preset.label}
          </span>
          <span style={{
            fontSize: 9.5, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(255,255,255,0.05)', color: 'var(--caval-text-muted)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {preset.width}×{preset.height}
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 1 }}>
          {preset.description}
        </div>
      </div>

      {/* Remove (custom only) */}
      {isCustom && onRemove && (
        <button
          onClick={onRemove}
          style={{
            width: 20, height: 20, borderRadius: 3, border: 'none',
            background: 'none', color: '#EF4444', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function SectionAssetManager() {
  const { presets, togglePreset, addCustomPreset, removePreset } = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newW, setNewW] = useState('');
  const [newH, setNewH] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const categories = ['app', 'marketing', 'social', 'custom'] as const;

  const handleAdd = () => {
    if (!newLabel || !newW || !newH) return;
    addCustomPreset({
      label: newLabel,
      width: parseInt(newW),
      height: parseInt(newH),
      description: newDesc || `${newW}×${newH}px`,
    });
    setNewLabel(''); setNewW(''); setNewH(''); setNewDesc('');
    setShowAddForm(false);
  };

  return (
    <>
      <InfoBox accent>
        Bifează rezoluțiile pe care vrei să le exporți automat. La fiecare generare,
        Caval creează versiuni pentru toate formatele active.
      </InfoBox>

      {categories.map((cat) => {
        const items = presets.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <Section key={cat} title={CATEGORY_LABELS[cat]}>
            {items.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                onToggle={() => togglePreset(p.id)}
                onRemove={cat === 'custom' ? () => removePreset(p.id) : undefined}
              />
            ))}
          </Section>
        );
      })}

      {/* Adaugă preset custom */}
      <div style={{ marginTop: 8 }}>
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              width: '100%', padding: '7px', borderRadius: 6,
              border: '1px dashed rgba(0,224,255,0.25)',
              background: 'transparent', color: 'var(--caval-accent)',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            Adaugă rezoluție custom
          </button>
        ) : (
          <div style={{
            padding: 12, borderRadius: 6,
            border: '1px solid var(--caval-border)',
            background: 'var(--caval-bg)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Preset nou
            </div>
            <Input value={newLabel} onChange={setNewLabel} placeholder="Nume (ex: Notification Icon)" />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={newW} onChange={setNewW} placeholder="Lățime (px)" mono />
              <Input value={newH} onChange={setNewH} placeholder="Înălțime (px)" mono />
            </div>
            <Input value={newDesc} onChange={setNewDesc} placeholder="Descriere (opțional)" />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleAdd}
                disabled={!newLabel || !newW || !newH}
                style={{
                  flex: 1, padding: '6px', borderRadius: 5, border: 'none',
                  background: newLabel && newW && newH ? 'var(--caval-accent)' : 'rgba(255,255,255,0.07)',
                  color: newLabel && newW && newH ? '#0E0E0F' : 'var(--caval-text-muted)',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                Adaugă
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '6px 12px', borderRadius: 5,
                  border: '1px solid var(--caval-border)',
                  background: 'transparent', color: 'var(--caval-text-muted)',
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                Anulează
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: AI Context Bridge
// ──────────────────────────────────────────────

function SectionContextBridge() {
  const { contextBridge, updateContextBridge } = useSettingsStore();
  const projectPath = useEditorStore((s) => s.projectPath);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  // Scanează fișierele de tema din proiect pentru a extrage culori
  const scanProject = useCallback(async () => {
    if (!projectPath) {
      setScanResult('Deschide un proiect mai întâi.');
      return;
    }
    setScanning(true);
    setScanResult(null);

    try {
      // Citim fișierele comune de teme
      const themeFiles = [
        'src/theme.ts', 'src/themes/colors.ts', 'src/tokens/colors.ts',
        'tailwind.config.js', 'tailwind.config.ts',
        'src/styles/theme.ts', 'theme.ts', 'colors.ts',
      ];

      const colors: string[] = [];
      const fonts: string[] = [];
      let scannedCount = 0;

      for (const file of themeFiles) {
        const result = await window.caval.fs.readFile(`${projectPath}/${file}`);
        if (!result.ok) continue;
        scannedCount++;

        const content = result.content;

        // Extrage hex colors
        const hexMatches = content.match(/#[0-9A-Fa-f]{3,8}\b/g) || [];
        const rgbMatches = (content.match(/rgba?\([^)]+\)/g) || []);

        colors.push(...hexMatches, ...rgbMatches);

        // Extrage font names
        const fontMatches = content.match(/['"]([A-Z][a-zA-Z\s]+(?:Mono|Sans|Serif)?)['"]/g) || [];
        fonts.push(...fontMatches.map((f) => f.replace(/['"]/g, '')));
      }

      // Deduplică și limitează
      const uniqueColors = [...new Set(colors)].slice(0, 20);
      const uniqueFonts  = [...new Set(fonts)].slice(0, 10);

      updateContextBridge({
        detectedColors: uniqueColors,
        detectedFonts: uniqueFonts,
        lastScanPath: projectPath,
      });

      setScanResult(
        scannedCount === 0
          ? 'Nu s-au găsit fișiere de temă în proiect.'
          : `Scanat ${scannedCount} fișier${scannedCount > 1 ? 'e' : ''} · ${uniqueColors.length} culori · ${uniqueFonts.length} fonturi`
      );
    } catch {
      setScanResult('Eroare la scanare proiect.');
    } finally {
      setScanning(false);
    }
  }, [projectPath, updateContextBridge]);

  return (
    <>
      <InfoBox accent>
        <strong>Diferențiatorul Caval față de VS Code.</strong> Când e activat, AI-ul
        primește automat paleta de culori și stilul proiectului tău — fără să trebuiască
        să explici manual ce culori folosești.
      </InfoBox>

      <Section title="Activare">
        <Row
          label="AI Context Bridge"
          desc="Injectează contextul proiectului în fiecare generare AI"
        >
          <Toggle
            value={contextBridge.enabled}
            onChange={(v) => updateContextBridge({ enabled: v })}
          />
        </Row>
      </Section>

      <Section title="Ce să analizeze">
        <Row
          label="Culori proiect"
          desc="Citește theme.ts, colors.ts, tailwind.config — extrage paleta"
        >
          <Toggle
            value={contextBridge.analyzeColors}
            onChange={(v) => updateContextBridge({ analyzeColors: v })}
            disabled={!contextBridge.enabled}
          />
        </Row>
        <Row
          label="Fonturi proiect"
          desc="Detectează fonturile folosite în proiect"
        >
          <Toggle
            value={contextBridge.analyzeFonts}
            onChange={(v) => updateContextBridge({ analyzeFonts: v })}
            disabled={!contextBridge.enabled}
          />
        </Row>
        <Row
          label="Numele proiectului"
          desc="Include numele și contextul proiectului în prompt"
        >
          <Toggle
            value={contextBridge.analyzeProjectName}
            onChange={(v) => updateContextBridge({ analyzeProjectName: v })}
            disabled={!contextBridge.enabled}
          />
        </Row>
      </Section>

      {/* Scan proiect */}
      <Section title="Scanează proiect acum">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.5 }}>
            Caval va citi fișierele de temă din proiectul deschis și va extrage
            culorile automat. Rulează după ce deschizi un proiect nou.
          </div>
          <button
            onClick={scanProject}
            disabled={scanning || !projectPath}
            style={{
              padding: '7px 14px', borderRadius: 6,
              background: scanning ? 'rgba(0,224,255,0.1)' : 'rgba(0,224,255,0.12)',
              border: '1px solid rgba(0,224,255,0.2)',
              color: 'var(--caval-accent)', fontWeight: 600, fontSize: 12,
              cursor: scanning || !projectPath ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: !projectPath ? 0.5 : 1,
              transition: 'all 0.15s',
            } as any}
          >
            {scanning ? (
              <>
                <span style={{ animation: 'caval-spin 1s linear infinite', display: 'inline-block' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 8A6 6 0 112 8" strokeLinecap="round" />
                  </svg>
                </span>
                Scanez…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="4" /><path d="M2 2l5 5" strokeLinecap="round" />
                </svg>
                Scanează proiect
              </>
            )}
          </button>

          {scanResult && (
            <div style={{
              fontSize: 11, padding: '6px 9px', borderRadius: 5,
              background: 'rgba(47,191,113,0.07)',
              border: '1px solid rgba(47,191,113,0.15)',
              color: '#2FBF71',
            }}>
              {scanResult}
            </div>
          )}
        </div>
      </Section>

      {/* Culori detectate */}
      {contextBridge.detectedColors.length > 0 && (
        <Section title={`Culori detectate (${contextBridge.detectedColors.length})`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {contextBridge.detectedColors.map((color, i) => (
              <div
                key={i}
                title={color}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '2px 7px 2px 4px', borderRadius: 4,
                  background: 'var(--caval-bg)',
                  border: '1px solid var(--caval-border)',
                  fontSize: 10.5,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--caval-text-muted)',
                }}
              >
                <span style={{
                  width: 12, height: 12, borderRadius: 3,
                  background: color,
                  border: '1px solid rgba(255,255,255,0.1)',
                  flexShrink: 0,
                }} />
                {color.length > 14 ? color.substring(0, 14) + '…' : color}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Instrucțiuni custom */}
      <Section title="Instrucțiuni custom">
        <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
          Text adăugat automat la fiecare prompt de generare imagini.
          Exemplu: <em style={{ color: 'var(--caval-text)' }}>"Always use the brand colors. No text in images."</em>
        </div>
        <textarea
          value={contextBridge.customInstructions}
          onChange={(e) => updateContextBridge({ customInstructions: e.target.value })}
          placeholder="Instrucțiuni adăugate automat la fiecare prompt…"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
            borderRadius: 6, padding: '7px 9px',
            color: 'var(--caval-text)', fontSize: 12,
            fontFamily: "'Inter', sans-serif", resize: 'vertical', outline: 'none',
            lineHeight: 1.5,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
        />
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Export & Paths
// ──────────────────────────────────────────────

function SectionExport() {
  const { exportSettings, updateExport } = useSettingsStore();
  const projectPath = useEditorStore((s) => s.projectPath);

  const resolvedPath = projectPath
    ? `${projectPath}/${exportSettings.autoExportPath.replace('./', '')}`
    : exportSettings.autoExportPath;

  return (
    <>
      <Section title="Auto-Export">
        <Row
          label="Export automat activat"
          desc="Fiecare imagine generată se salvează automat"
        >
          <Toggle
            value={exportSettings.autoExportEnabled}
            onChange={(v) => updateExport({ autoExportEnabled: v })}
          />
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Folder export
          </div>
          <Input
            value={exportSettings.autoExportPath}
            onChange={(v) => updateExport({ autoExportPath: v })}
            placeholder="./assets/generated/"
            mono
          />
          {projectPath && (
            <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
              → {resolvedPath}
            </div>
          )}
        </div>

        <Row label="Format fișier">
          <Select
            value={exportSettings.exportFormat}
            onChange={(v) => updateExport({ exportFormat: v })}
            options={[
              { value: 'png',  label: 'PNG (lossless)' },
              { value: 'webp', label: 'WebP (mic, web)' },
              { value: 'jpg',  label: 'JPEG (fotografii)' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Organizare fișiere">
        <Row
          label="Subfoldere per categorie"
          desc="icons/ · banners/ · social/ în folderul de export"
        >
          <Toggle
            value={exportSettings.createSubfolders}
            onChange={(v) => updateExport({ createSubfolders: v })}
          />
        </Row>
        <Row
          label="Adaugă timestamp"
          desc="Exemplu: splash_2732x2732_1719241200.png"
        >
          <Toggle
            value={exportSettings.addTimestamp}
            onChange={(v) => updateExport({ addTimestamp: v })}
          />
        </Row>
        <Row
          label="Sufix rezoluție"
          desc="Exemplu: app_icon_1024x1024.png"
        >
          <Toggle
            value={exportSettings.addPresetSuffix}
            onChange={(v) => updateExport({ addPresetSuffix: v })}
          />
        </Row>
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Safety & Credits
// ──────────────────────────────────────────────

function SectionSafety() {
  const {
    safety, updateSafety,
    sessionGenerations, resetSessionGenerations,
  } = useSettingsStore();

  const maxGen = safety.maxGenerationsPerSession;
  const pct = maxGen > 0 ? Math.min(100, (sessionGenerations / maxGen) * 100) : 0;
  const isOver = maxGen > 0 && sessionGenerations >= maxGen;

  return (
    <>
      {/* Usage Meter */}
      <Section title="Credit & Usage Meter">
        <Row label="Arată usage meter" desc="Contor generări în sesiunea curentă">
          <Toggle
            value={safety.showUsageMeter}
            onChange={(v) => updateSafety({ showUsageMeter: v })}
          />
        </Row>

        {safety.showUsageMeter && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--caval-bg)', border: '1px solid var(--caval-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--caval-text-muted)' }}>Sesiunea curentă</span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: isOver ? '#EF4444' : 'var(--caval-accent)',
              }}>
                {sessionGenerations}{maxGen > 0 ? ` / ${maxGen}` : ''} generări
              </span>
            </div>

            {maxGen > 0 && (
              <div style={{
                height: 6, borderRadius: 3,
                background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${pct}%`,
                  background: isOver
                    ? '#EF4444'
                    : pct > 80 ? '#F59E0B' : 'var(--caval-accent)',
                  transition: 'width 0.3s',
                }} />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: 'var(--caval-text-muted)' }}>
                {maxGen === 0 ? 'Fără limită' : isOver ? 'Limită atinsă' : `${maxGen - sessionGenerations} rămase`}
              </span>
              <button
                onClick={resetSessionGenerations}
                style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--caval-border)',
                  color: 'var(--caval-text-muted)', cursor: 'pointer',
                }}
              >
                Reset
              </button>
            </div>
          </div>
        )}

        <Row
          label="Limită generări / sesiune"
          desc="0 = nelimitat · DALL-E 3 = ~$0.04-0.08 / imagine"
        >
          <NumberInput
            value={safety.maxGenerationsPerSession}
            onChange={(v) => updateSafety({ maxGenerationsPerSession: v })}
            min={0}
            max={100}
          />
        </Row>
      </Section>

      <Section title="Dark Mode & Transparență">
        <InfoBox>
          Opțiunile de mai jos modifică automat promptul de generare.
          Util pentru imagini care trebuie să funcționeze pe fundal dark și light.
        </InfoBox>

        <Row
          label="Fundal transparent"
          desc='Adaugă "transparent background, PNG format" la prompt'
        >
          <Toggle
            value={safety.requireTransparentBg}
            onChange={(v) => updateSafety({ requireTransparentBg: v })}
          />
        </Row>
        <Row
          label="Preview dark + light mode"
          desc='Adaugă "works well on both dark and light backgrounds" la prompt'
        >
          <Toggle
            value={safety.addDarkModeNote}
            onChange={(v) => updateSafety({ addDarkModeNote: v })}
          />
        </Row>
        <Row
          label="Safe mode"
          desc='Adaugă prefix de siguranță la fiecare prompt (evită conținut NSFW)'
        >
          <Toggle
            value={safety.safeMode}
            onChange={(v) => updateSafety({ safeMode: v })}
          />
        </Row>
      </Section>

      {/* Preview prompt modificat */}
      {(safety.requireTransparentBg || safety.addDarkModeNote || safety.safeMode) && (
        <Section title="Prefix prompt adăugat automat">
          <div style={{
            padding: '8px 10px', borderRadius: 6,
            background: 'rgba(0,224,255,0.04)',
            border: '1px solid rgba(0,224,255,0.12)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--caval-text-muted)',
            lineHeight: 1.6,
          }}>
            {safety.safeMode && <div style={{ color: '#2FBF71' }}>[SAFE] </div>}
            <span style={{ opacity: 0.6 }}>{"<promptul tău>"}</span>
            {safety.requireTransparentBg && (
              <div style={{ color: 'var(--caval-accent)' }}>. Transparent background, PNG format.</div>
            )}
            {safety.addDarkModeNote && (
              <div style={{ color: 'var(--caval-accent)' }}>Works well on both dark and light backgrounds.</div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Editor
// ──────────────────────────────────────────────

function SectionEditor() {
  const { app, updateApp } = useSettingsStore();

  return (
    <>
      <Section title="Aspect">
        <Row label="Font size editor" desc="Dimensiunea fontului în Monaco Editor">
          <NumberInput value={app.fontSize} onChange={(v) => updateApp({ fontSize: v })} min={8} max={32} />
        </Row>
        <Row label="Tab size">
          <Select
            value={String(app.tabSize) as any}
            onChange={(v) => updateApp({ tabSize: parseInt(v) })}
            options={[
              { value: '2', label: '2 spații' },
              { value: '4', label: '4 spații' },
              { value: '8', label: '8 spații' },
            ]}
          />
        </Row>
        <Row label="Word wrap" desc="Înfășoară liniile lungi automat">
          <Toggle value={app.wordWrap} onChange={(v) => updateApp({ wordWrap: v })} />
        </Row>
        <Row label="Minimap" desc="Harta minimă din dreapta editorului">
          <Toggle value={app.minimap} onChange={(v) => updateApp({ minimap: v })} />
        </Row>
      </Section>

      <Section title="Salvare">
        <Row label="Auto-save" desc="Salvează automat la inactivitate">
          <Toggle value={app.autoSave} onChange={(v) => updateApp({ autoSave: v })} />
        </Row>
        <Row label="Delay auto-save" desc="Milisecunde de inactivitate înainte de salvare">
          <NumberInput
            value={app.autoSaveDelay}
            onChange={(v) => updateApp({ autoSaveDelay: v })}
            min={500} max={10000} step={500}
          />
        </Row>
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────
//  Secțiune: Shortcuts
// ──────────────────────────────────────────────

const SHORTCUTS = [
  { action: 'Toggle AI Panel',         keys: ['Ctrl', 'Shift', 'A'] },
  { action: 'Toggle Git Panel',        keys: ['Ctrl', 'Shift', 'G'] },
  { action: 'Toggle Explorer',         keys: ['Ctrl', 'Shift', 'E'] },
  { action: 'Image Generator',         keys: ['Ctrl', 'Shift', 'I'] },
  { action: 'Settings',                keys: ['Ctrl', ','] },
  { action: 'Salvează fișier',         keys: ['Ctrl', 'S'] },
  { action: 'Commit rapid (Git box)',  keys: ['Ctrl', 'Enter'] },
  { action: 'Generează imagine',       keys: ['Ctrl', 'Enter'] },
  { action: 'Nou fișier',              keys: ['Ctrl', 'N'] },
  { action: 'Deschide folder',         keys: ['Ctrl', 'O'] },
  { action: 'Caută în proiect',        keys: ['Ctrl', 'Shift', 'F'] },
  { action: 'Închide tab',             keys: ['Ctrl', 'W'] },
  { action: 'Command Palette',         keys: ['Ctrl', 'Shift', 'P'] },
];

function SectionShortcuts() {
  return (
    <Section title="Keyboard shortcuts">
      <InfoBox>Shortcut-urile nu sunt configurabile în această versiune. Coming soon.</InfoBox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SHORTCUTS.map((s) => (
          <div
            key={s.action}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--caval-text)' }}>{s.action}</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {s.keys.map((k, i) => (
                <kbd key={i} style={{
                  fontSize: 10.5, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--caval-text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                  boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
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

// ──────────────────────────────────────────────
//  Secțiune: Despre Caval
// ──────────────────────────────────────────────

function SectionAbout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Logo + versiune */}
      <div style={{
        padding: '24px 20px', borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(0,224,255,0.05), rgba(124,58,237,0.05))',
        border: '1px solid rgba(0,224,255,0.1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,224,255,0.2), rgba(212,168,87,0.15))',
          border: '1px solid rgba(0,224,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, color: 'var(--caval-accent)',
          fontFamily: "'Sora', sans-serif",
        }}>
          C
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--caval-text)', fontFamily: "'Sora', sans-serif" }}>
            Caval Studio
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
            Version 0.1.0 · Build 2026.06
          </div>
        </div>
        <div style={{
          fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.6,
          maxWidth: 280,
        }}>
          IDE pentru dezvoltatori moderni — Monaco Editor, AI multi-model, Git integrat,
          generare imagini cu context din proiect.
        </div>
      </div>

      <Section title="Stack tehnic">
        {[
          ['Runtime',    'Electron + Node.js'],
          ['UI',         'React + TypeScript'],
          ['Editor',     'Monaco Editor (VS Code engine)'],
          ['AI Chat',    'Claude / GPT-4o / Gemini / Ollama'],
          ['Imagini',    'OpenAI DALL-E 3'],
          ['Terminal',   'node-pty + xterm.js'],
          ['State',      'Zustand + persist'],
          ['Build',      'Webpack 5'],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
            <span style={{ fontSize: 11.5, color: 'var(--caval-text-muted)' }}>{label}</span>
            <span style={{ fontSize: 11.5, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ──────────────────────────────────────────────
//  Helper: InfoBox
// ──────────────────────────────────────────────

function InfoBox({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 6, fontSize: 11.5, lineHeight: 1.5,
      background: accent ? 'rgba(0,224,255,0.04)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(0,224,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
      color: 'var(--caval-text-muted)',
      marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
//  SettingsPanel — componenta principală
// ──────────────────────────────────────────────

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const { activeSection, setActiveSection } = useSettingsStore();

  const renderContent = () => {
    switch (activeSection) {
      case 'image-generator': return <SectionImageGenerator />;
      case 'asset-manager':   return <SectionAssetManager />;
      case 'context-bridge':  return <SectionContextBridge />;
      case 'export':          return <SectionExport />;
      case 'safety':          return <SectionSafety />;
      case 'editor':          return <SectionEditor />;
      case 'shortcuts':       return <SectionShortcuts />;
      case 'about':           return <SectionAbout />;
      case 'prompt-library':  return <PromptLibraryPanel />;
      default:                return null;
    }
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeSection);

  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>
      {/* ── Sidebar nav ────────────────────── */}
      <div style={{
        width: 190, flexShrink: 0,
        borderRight: '1px solid var(--caval-border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--caval-surface)',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--caval-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)' }}>
            Setări
          </span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                width: 20, height: 20, borderRadius: 3, border: 'none',
                background: 'none', color: 'var(--caval-text-muted)',
                cursor: 'pointer', fontSize: 15, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Nav items */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 6px' }}
          className="ai-messages-scroll"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                width: '100%', padding: '7px 8px', borderRadius: 5,
                border: 'none', textAlign: 'left', cursor: 'pointer',
                background: activeSection === item.id
                  ? 'rgba(0,224,255,0.08)'
                  : 'transparent',
                color: activeSection === item.id
                  ? 'var(--caval-accent)'
                  : 'var(--caval-text-muted)',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.12s',
                marginBottom: 1,
              }}
              onMouseEnter={(e) => {
                if (activeSection !== item.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.color = 'var(--caval-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== item.id) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--caval-text-muted)';
                }
              }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: activeSection === item.id ? 600 : 400, flex: 1 }}>
                {item.label}
              </span>
              {item.badge && (
                <span style={{
                  fontSize: 8.5, padding: '1px 4px', borderRadius: 3,
                  background: activeSection === item.id
                    ? 'rgba(0,224,255,0.15)' : 'rgba(255,255,255,0.06)',
                  color: activeSection === item.id
                    ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
                  fontWeight: 700, letterSpacing: '0.03em',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Content header */}
        <div style={{
          padding: '12px 18px 10px',
          borderBottom: '1px solid var(--caval-border)',
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: 'var(--caval-accent)', display: 'flex' }}>
            {currentNav?.icon}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--caval-text)' }}>
            {currentNav?.label}
          </span>
          {currentNav?.badge && (
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 3,
              background: 'rgba(0,224,255,0.08)',
              border: '1px solid rgba(0,224,255,0.15)',
              color: 'var(--caval-accent)', fontWeight: 700, letterSpacing: '0.05em',
            }}>
              {currentNav.badge}
            </span>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}
          className="ai-messages-scroll"
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
