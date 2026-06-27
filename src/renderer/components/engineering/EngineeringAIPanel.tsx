import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore, getModelDisplayLabel } from '../../../../ai/composer/ai-store';
import { ChatModelSelect } from '../../../../ai/composer/ChatModelSelect';
import { useModelCatalog } from '../../../../ai/composer/use-model-catalog';
import {
  generateEngineering,
  type SpecData,
  type SchemaNode,
  type SchemaData,
  type PartItem,
  type BuildFile,
  type EngProject,
} from '../../../../ai/engineering/engineering-generator';
import { checkModelReadiness, type ModelReadiness } from '../../../../ai/models/model-readiness';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { IconSpec, IconSchema, IconParts, IconBuild } from '../brand/CavaloIcons';
import { CavaloAiMark } from '../brand/CavaloHorseMark';

// ──────────────────────────────────────────────────────────────
//  EngineeringAIPanel — hardware / electronică / CAD (NU chat coding)
// ──────────────────────────────────────────────────────────────

type EngTab = 'spec' | 'schema' | 'parts' | 'build';

const EXAMPLE_PROMPTS = [
  'Suport telefon cu încărcare wireless, ESP32, integrare Home Assistant',
  'Senzor de calitate a aerului cu ecran OLED și alertă pe WiFi',
  'Robot mic pe roți controlat prin Bluetooth de pe telefon',
  'Stație meteo solară cu log pe card SD',
];

const NODE_COLORS: Record<SchemaNode['role'], string> = {
  mcu: '#00E0FF',
  sensor: '#2FBF71',
  power: '#D4A857',
  actuator: '#7C3AED',
  io: '#8A95A6',
};

const NODE_LABELS: Record<SchemaNode['role'], string> = {
  mcu: 'Controler',
  sensor: 'Senzor',
  power: 'Alimentare',
  actuator: 'Actuator',
  io: 'I/O',
};

export function EngineeringAIPanel() {
  useCavalTheme();
  const projectPath = useEditorStore((s) => s.projectPath);

  const selectedModel = useAIStore((s) => s.selectedModel);
  const apiKeys = useAIStore((s) => s.apiKeys);
  const modelLabels = useAIStore((s) => s.modelLabels);
  const loadModelLabels = useAIStore((s) => s.loadModelLabels);
  const chatPrepareDraft = useAIStore((s) => s.chatPrepareDraft);
  const prepareState = useAIStore((s) => s.prepareState);
  const handoffFromEngineering = useAIStore((s) => s.handoffFromEngineering);
  const modelLabel = getModelDisplayLabel(selectedModel, modelLabels);

  const { catalog, loading: catalogLoading } = useModelCatalog();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readinessHint, setReadinessHint] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ModelReadiness | null>(null);
  const [project, setProject] = useState<EngProject | null>(null);
  const [activeTab, setActiveTab] = useState<EngTab>('spec');
  const [openRouterKey, setOpenRouterKey] = useState<string | undefined>();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  useEffect(() => {
    if (!prompt.trim() || !projectPath) return;
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = setTimeout(() => {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      void chatPrepareDraft({
        text: prompt,
        projectPath,
        activeFile: activeTab?.path,
        openFiles: tabs.map((t) => t.path),
      });
    }, 350);
    return () => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
    };
  }, [prompt, projectPath, tabs, activeTabId, chatPrepareDraft]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settingsRes = await window.caval.settingsLoad?.();
      const key = settingsRes?.settings?.['openrouter.apiKey'];
      if (!cancelled) setOpenRouterKey(key);
      const result = await checkModelReadiness(selectedModel, apiKeys, {
        openRouterApiKey: key,
      });
      if (!cancelled) {
        setReadiness(result);
        setReadinessHint(result.ready ? null : result.hint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedModel, apiKeys]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Descrie ce vrei să construiești.');
      return;
    }

    const readyCheck = await checkModelReadiness(selectedModel, apiKeys, {
      openRouterApiKey: openRouterKey,
    });
    setReadiness(readyCheck);
    if (!readyCheck.ready) {
      setReadinessHint(readyCheck.hint);
      setError(readyCheck.reason);
      return;
    }

    useEngineeringCadStore.getState().clearCadPreview();
    setLoading(true);
    setError(null);
    setReadinessHint(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const result = await generateEngineering({
      prompt,
      modelId: selectedModel,
      apiKeys,
      workspaceRoot: projectPath,
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      return;
    }

    if (result.ok && result.project) {
      setProject(result.project);
      setActiveTab('spec');
    } else {
      setError(result.error ?? 'Generare eșuată.');
    }
    abortRef.current = null;
    setLoading(false);
  }, [prompt, selectedModel, apiKeys, openRouterKey, projectPath]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const applyExample = (ex: string) => {
    setPrompt(ex);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleSoftwareHandoff = useCallback(() => {
    if (!project) return;
    const result = handoffFromEngineering({ project, userPrompt: prompt });
    if (!result.ok) {
      setError(result.error);
    }
  }, [project, prompt, handoffFromEngineering]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>
      <div style={{
        padding: '11px 14px 10px',
        borderBottom: '1px solid var(--caval-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'linear-gradient(135deg, #00E0FF22, #7C3AED22)',
            border: '1px solid rgba(0,224,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <CavaloAiMark size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>
              Engineering AI
            </div>
            <div style={{ fontSize: 10, color: 'var(--caval-text-muted)' }}>
              Hardware · schemă · BOM · CAD · firmware (nu aplicații software)
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChatModelSelect catalog={catalog} loading={catalogLoading} />
          </div>
        </div>

        {prepareState?.ready && prompt.trim() && !loading && (
          <div style={{
            fontSize: 10, color: 'var(--caval-success)', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--caval-success)' }} />
            Pregătit · {modelLabel}
          </div>
        )}

        <div style={{
          display: 'flex', gap: 4, flexWrap: 'nowrap',
          overflowX: 'auto', paddingBottom: 2, marginBottom: 8,
        }}
          className="ai-messages-scroll"
        >
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => applyExample(ex)}
              style={{
                flexShrink: 0,
                padding: '3px 8px', borderRadius: 99, fontSize: 10.5,
                background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
                color: 'var(--caval-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,224,255,0.3)';
                e.currentTarget.style.color = 'var(--caval-text)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--caval-border)';
                e.currentTarget.style.color = 'var(--caval-text-muted)';
              }}
            >
              {ex.split(',')[0].slice(0, 26)}…
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Descrie orice obiect sau sistem… (Ctrl+Enter = generează)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
            borderRadius: 6, padding: '7px 9px',
            color: 'var(--caval-text)', fontSize: 12.5,
            fontFamily: "'Inter', sans-serif", resize: 'none', outline: 'none',
            lineHeight: 1.55,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
        />

        {error && (
          <div style={{
            marginTop: 5, padding: '5px 8px', borderRadius: 5,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
            color: '#EF4444', fontSize: 11.5,
          }}>
            {error}
          </div>
        )}

        {readinessHint && (
          <div style={{
            marginTop: 5, padding: '5px 8px', borderRadius: 5,
            background: 'rgba(212,168,87,0.08)', border: '1px solid rgba(212,168,87,0.2)',
            color: '#D4A857', fontSize: 11, lineHeight: 1.45,
          }}>
            {readinessHint}
            <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--caval-text-muted)' }}>
              Alege alt model din dropdown-ul de mai sus sau configurează cheia OpenRouter.
            </div>
          </div>
        )}

        <button
          onClick={loading ? handleStop : handleGenerate}
          disabled={!loading && !prompt.trim()}
          style={{
            width: '100%', marginTop: 7, padding: '8px 0',
            borderRadius: 6, border: 'none',
            background: loading
              ? 'rgba(239,68,68,0.12)'
              : prompt.trim()
                ? 'linear-gradient(135deg, rgba(0,224,255,0.9), rgba(0,160,200,0.9))'
                : 'rgba(255,255,255,0.07)',
            color: loading
              ? '#EF4444'
              : prompt.trim() ? '#0E0E0F' : 'var(--caval-text-muted)',
            fontWeight: 700, fontSize: 13,
            cursor: (!loading && !prompt.trim()) ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          {loading ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
              </svg>
              Oprește
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Generează
            </>
          )}
        </button>
      </div>

      {!project ? (
        <EmptyState />
      ) : (
        <>
          <div style={{
            display: 'flex', gap: 2, padding: '8px 10px 0',
            borderBottom: '1px solid var(--caval-border)', flexShrink: 0,
            flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', gap: 2 }}>
            {([
              ['spec', 'Spec', <IconSpec key="i" size={14} />],
              ['schema', 'Schemă', <IconSchema key="i" size={14} />],
              ['parts', 'Componente', <IconParts key="i" size={14} />],
              ['build', 'Build', <IconBuild key="i" size={14} />],
            ] as [EngTab, string, React.ReactNode][]).map(([id, label, icon]) => (
              <ResultTab
                key={id}
                label={label}
                icon={icon}
                active={activeTab === id}
                onClick={() => setActiveTab(id)}
              />
            ))}
            </div>
            <button
              type="button"
              onClick={handleSoftwareHandoff}
              title="Deschide Coding Chat cu tot contextul Engineering (spec, schemă, BOM, build)"
              style={{
                margin: '6px 0 8px',
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid rgba(124,58,237,0.45)',
                background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(0,224,255,0.1))',
                color: 'var(--caval-text)',
                fontWeight: 600,
                fontSize: 11.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden>→</span>
              Generează software în Coding Chat
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px' }}
            className="ai-messages-scroll"
          >
            {activeTab === 'spec' && <SpecView spec={project.spec} />}
            {activeTab === 'schema' && <SchemaView schema={project.schema} />}
            {activeTab === 'parts' && <PartsView parts={project.parts} projectPath={projectPath} />}
            {activeTab === 'build' && (
              <BuildView project={project} projectPath={projectPath} userPrompt={prompt} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ResultTab({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', border: 'none', cursor: 'pointer',
        background: 'transparent',
        color: active ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        fontSize: 12, fontWeight: active ? 600 : 500,
        borderBottom: `2px solid ${active ? 'var(--caval-accent)' : 'transparent'}`,
        marginBottom: -1, transition: 'all 0.12s',
        display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--caval-surface)',
      border: '1px solid var(--caval-border)',
      borderRadius: 8, padding: '12px 13px', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--caval-text-muted)',
      fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      marginBottom: 3,
    }}>
      {children}
    </div>
  );
}

function SpecView({ spec }: { spec: SpecData }) {
  return (
    <div>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--caval-text)', marginBottom: 6 }}>
          {spec.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', lineHeight: 1.55 }}>
          {spec.summary}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <Card>
            <FieldLabel>Dimensiuni</FieldLabel>
            <div style={{ fontSize: 12.5, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>
              {spec.dimensions}
            </div>
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          <Card>
            <FieldLabel>Greutate</FieldLabel>
            <div style={{ fontSize: 12.5, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>
              {spec.weight}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <FieldLabel>Materiale</FieldLabel>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {spec.materials.map((m) => (
            <span key={m} style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(0,224,255,0.06)', border: '1px solid rgba(0,224,255,0.15)',
              color: 'var(--caval-accent)',
            }}>
              {m}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <FieldLabel>Toleranțe</FieldLabel>
        <div style={{ fontSize: 12, color: 'var(--caval-text)', lineHeight: 1.5 }}>
          {spec.tolerances}
        </div>
      </Card>
    </div>
  );
}

function SchemaView({ schema }: { schema: SchemaData }) {
  const nodeById = (id: string) => schema.nodes.find((n) => n.id === id);
  return (
    <div>
      <Card>
        <FieldLabel>Schemă bloc</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
          {schema.nodes.map((n) => (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', borderRadius: 6,
              background: 'var(--caval-bg)',
              border: `1px solid ${NODE_COLORS[n.role]}33`,
            }}>
              <span style={{
                width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                background: NODE_COLORS[n.role],
                boxShadow: `0 0 6px ${NODE_COLORS[n.role]}80`,
              }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>
                {n.label}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 10,
                color: NODE_COLORS[n.role], fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {NODE_LABELS[n.role]}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <FieldLabel>Conexiuni</FieldLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
          {schema.connections.map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, color: 'var(--caval-text)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span>{nodeById(c.from)?.label ?? c.from}</span>
              <span style={{ color: 'var(--caval-accent)' }}>→</span>
              <span>{nodeById(c.to)?.label ?? c.to}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(255,255,255,0.05)', color: 'var(--caval-text-muted)',
              }}>
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Card>
            <FieldLabel>Buget putere</FieldLabel>
            <div style={{ fontSize: 12, color: 'var(--caval-text)', lineHeight: 1.5 }}>
              {schema.powerBudget}
            </div>
          </Card>
        </div>
        <div style={{ flex: 1 }}>
          <Card>
            <FieldLabel>Protocoale</FieldLabel>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {schema.protocols.map((p) => (
                <span key={p} style={{
                  fontSize: 10.5, padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.05)', color: 'var(--caval-text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {p}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PartsView({ parts, projectPath }: { parts: PartItem[]; projectPath: string | null }) {
  const total = parts.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
  const currency = parts[0]?.currency ?? 'RON';
  const [exported, setExported] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async () => {
    const res = await window.caval.engineering.exportCart(parts, projectPath);
    setExported(res.ok);
    setExportMsg(res.ok ? `Salvat: ${res.savedPath}` : (res.error ?? 'Eroare la export.'));
  };

  const openShop = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    if (url) await window.caval.engineering.openExternal(url);
  };

  return (
    <div>
      {parts.map((p, i) => (
        <Card key={i}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>
                {p.name}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.05)', color: 'var(--caval-text-muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  ×{p.qty}
                </span>
                <a
                  href={p.shopUrl}
                  onClick={(e) => openShop(e, p.shopUrl)}
                  style={{
                    fontSize: 11, color: 'var(--caval-accent)',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3,
                    cursor: 'pointer',
                  }}
                >
                  {p.shop}
                  <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 3h7v7M13 3L4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
              {p.substitute && (
                <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 3 }}>
                  Alternativă: {p.substitute}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                {(p.qty * p.unitPrice).toFixed(2)} {p.currency}
              </div>
              <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                {p.unitPrice.toFixed(2)}/buc
              </div>
            </div>
          </div>
        </Card>
      ))}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '11px 13px', borderRadius: 8, marginTop: 2,
        background: 'rgba(0,224,255,0.05)', border: '1px solid rgba(0,224,255,0.18)',
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--caval-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Total estimat
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--caval-accent)', fontFamily: "'JetBrains Mono', monospace" }}>
            {total.toFixed(2)} {currency}
          </div>
        </div>
        <button
          onClick={handleExport}
          title={projectPath ? 'Salvează lista în proiect' : 'Salvează lista (alegi locația)'}
          style={{
            marginLeft: 'auto', padding: '7px 13px', borderRadius: 6, border: 'none',
            background: exported ? 'rgba(47,191,113,0.18)' : 'var(--caval-accent)',
            color: exported ? '#2FBF71' : '#0E0E0F',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {exported ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 2h2l1.5 9h7l1.5-6H4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6.5" cy="14" r="1" /><circle cx="12.5" cy="14" r="1" />
            </svg>
          )}
          {exported ? 'Exportat ✓' : 'Export coș'}
        </button>
      </div>

      {exportMsg && (
        <div style={{
          fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 6,
          wordBreak: 'break-all', lineHeight: 1.45,
        }}>
          {exportMsg}
        </div>
      )}
    </div>
  );
}

const BUILD_ICONS: Record<BuildFile['kind'], string> = {
  stl: '🧱',
  firmware: '⚙️',
  wiring: '🔌',
  doc: '📄',
};

function buildFilePayload(f: BuildFile): { name: string; content: string } {
  const content =
    f.content && f.content.trim().length > 0
      ? f.content
      : `# ${f.name}\n# ${f.note}\n# (generat de Caval Engineering AI — completează conținutul)\n`;
  return { name: f.name, content };
}

function BuildView({
  project,
  projectPath,
  userPrompt,
}: {
  project: EngProject;
  projectPath: string | null;
  userPrompt: string;
}) {
  const { build } = project;
  const [savedAll, setSavedAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [savedFiles, setSavedFiles] = useState<Record<number, 'ok' | 'err'>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [installingScad, setInstallingScad] = useState(false);
  const [cadCloudOnly, setCadCloudOnly] = useState(true);

  useEffect(() => {
    void window.caval.cad?.isCloudOnly?.().then((r) => {
      if (r?.cloudOnly !== undefined) setCadCloudOnly(r.cloudOnly);
    });
  }, []);

  const phase = useEngineeringCadStore((s) => s.phase);
  const cadBusy = useEngineeringCadStore((s) => s.cadBusy);
  const cadStatus = useEngineeringCadStore((s) => s.serverStatus);
  const cadError = useEngineeringCadStore((s) => s.error);
  const generateMessage = useEngineeringCadStore((s) => s.statusMessage);
  const createCadJob = useEngineeringCadStore((s) => s.createCadJob);
  const cancelCadJob = useEngineeringCadStore((s) => s.cancelCadJob);
  const retryCadJob = useEngineeringCadStore((s) => s.retryCadJob);

  const hasStl = build.some((f) => f.kind === 'stl');
  const needsOpenScad = !cadCloudOnly && Boolean(cadError?.includes('OpenSCAD'));

  const installOpenScad = async () => {
    if (!window.caval?.cad?.installOpenScad) return;
    setInstallingScad(true);
    setMsg('Se deschide instalatorul OpenSCAD — aprobă UAC dacă apare.');
    const res = await window.caval.cad.installOpenScad();
    setInstallingScad(false);
    if (res.ok) {
      setMsg('OpenSCAD instalat. Relansez generarea STL…');
      await retryCadJob();
      return;
    }
    setMsg(`Eroare: ${res.error ?? 'instalare eșuată'}`);
  };

  const saveOne = async (f: BuildFile, i: number) => {
    if (!projectPath) return;
    const res = await window.caval.engineering.saveFile(projectPath, buildFilePayload(f));
    setSavedFiles((prev) => ({ ...prev, [i]: res.ok ? 'ok' : 'err' }));
    setMsg(res.ok ? `Salvat: ${res.savedPath}` : `Eroare: ${res.error}`);
  };

  const saveAll = async () => {
    if (!projectPath) return;
    setSavingAll(true);
    const res = await window.caval.engineering.saveAll(projectPath, build.map(buildFilePayload));
    setSavingAll(false);
    setSavedAll(res.ok);
    setMsg(
      res.ok
        ? `Salvate ${res.savedPaths?.length ?? 0} fișiere în caval-engineering/`
        : `Eroare: ${res.error}`
    );
  };

  return (
    <div>
      {hasStl && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => void createCadJob({ project, userPrompt, projectPath })}
            disabled={cadBusy}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 6, border: 'none',
              background: cadBusy ? 'rgba(0,224,255,0.25)' : 'rgba(124,58,237,0.85)',
              color: '#fff', fontWeight: 700, fontSize: 12.5,
              cursor: cadBusy ? 'wait' : 'pointer', marginBottom: 8,
            }}
          >
            {cadBusy
              ? `Generez STL pe cloud… (${phase}${cadStatus ? ` / ${cadStatus}` : ''})`
              : 'Generează STL 3D (cloud)'}
          </button>
          {cadBusy && (
            <button
              type="button"
              onClick={cancelCadJob}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 6,
                border: '1px solid var(--caval-border)', background: 'transparent',
                color: 'var(--caval-text-muted)', fontSize: 11.5, cursor: 'pointer', marginBottom: 8,
              }}
            >
              Anulează generarea
            </button>
          )}
          {cadError && phase === 'failed' && needsOpenScad && (
            <button
              type="button"
              onClick={() => void installOpenScad()}
              disabled={installingScad}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
                background: 'rgba(124,58,237,0.85)', color: '#fff',
                fontSize: 11.5, fontWeight: 600, cursor: installingScad ? 'wait' : 'pointer', marginBottom: 8,
              }}
            >
              {installingScad ? 'Instalez OpenSCAD…' : 'Instalează OpenSCAD'}
            </button>
          )}
          {cadError && phase === 'failed' && (
            <button
              type="button"
              onClick={() => void retryCadJob()}
              style={{
                width: '100%', padding: '6px 0', borderRadius: 6, border: 'none',
                background: 'rgba(0,224,255,0.12)', color: 'var(--caval-accent)',
                fontSize: 11.5, fontWeight: 600, cursor: 'pointer', marginBottom: 8,
              }}
            >
              Reîncearcă generarea CAD
            </button>
          )}
          {cadError && (
            <div style={{ fontSize: 11, color: '#ff7070', marginBottom: 6 }}>{cadError}</div>
          )}
          {generateMessage && (
            <div style={{ fontSize: 11, color: 'var(--caval-accent)', marginBottom: 6 }}>{generateMessage}</div>
          )}
        </div>
      )}

      {projectPath && (
        <button
          onClick={() => void saveAll()}
          disabled={savingAll}
          style={{
            width: '100%', marginBottom: 10, padding: '8px 0', borderRadius: 6, border: 'none',
            background: savedAll ? 'rgba(47,191,113,0.15)' : 'var(--caval-accent)',
            color: savedAll ? '#2FBF71' : '#0E0E0F',
            fontWeight: 700, fontSize: 12.5, cursor: savingAll ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
        >
          {savedAll ? 'Salvate ✓' : savingAll ? 'Salvez…' : 'Salvează toate în proiect'}
        </button>
      )}

      {build.map((f, i) => (
        <Card key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{BUILD_ICONS[f.kind]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                {f.name}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
                {f.note}
              </div>
            </div>
            <button
              onClick={() => void saveOne(f, i)}
              title={projectPath ? 'Salvează în proiect' : 'Deschide un proiect mai întâi'}
              disabled={!projectPath}
              style={{
                flexShrink: 0, width: 30, height: 30, borderRadius: 5,
                background: savedFiles[i] === 'ok'
                  ? 'rgba(47,191,113,0.2)'
                  : projectPath ? 'var(--caval-accent)' : 'rgba(255,255,255,0.07)',
                border: 'none',
                color: savedFiles[i] === 'ok'
                  ? '#2FBF71'
                  : projectPath ? '#0E0E0F' : 'var(--caval-text-muted)',
                cursor: projectPath ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {savedFiles[i] === 'ok' ? '✓' : '↓'}
            </button>
          </div>
        </Card>
      ))}

      {msg && (
        <div style={{
          fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 2,
          wordBreak: 'break-all', lineHeight: 1.45,
        }}>
          {msg}
        </div>
      )}

      {!projectPath && (
        <div style={{
          fontSize: 11, color: 'var(--caval-text-muted)', textAlign: 'center',
          padding: '8px 4px', lineHeight: 1.5,
        }}>
          Deschide un proiect ca să salvezi fișierele generate în el.
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 24, textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'linear-gradient(135deg, rgba(0,224,255,0.12), rgba(124,58,237,0.12))',
        border: '1px solid rgba(0,224,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--caval-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--caval-text)' }}>
        Descrie ce vrei să construiești
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.55, maxWidth: 230 }}>
        Scrii un prompt liber, iar Caval generează designul tehnic, schema,
        componentele electronice cu prețuri și magazine, plus fișierele de fabricație.
      </div>
    </div>
  );
}
