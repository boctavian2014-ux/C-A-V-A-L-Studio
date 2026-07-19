import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useCavalTheme } from '../../../../themes/theme-provider';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import { ChatModelSelect } from '../../../../ai/composer/ChatModelSelect';
import { useModelCatalog } from '../../../../ai/composer/use-model-catalog';
import {
  generateEngineering,
  type PartItem,
  type EngProject,
} from '../../../../ai/engineering/engineering-generator';
import {
  ROBOTICS_TAB_GROUPS,
  extractScadBlock,
  markdownToSimpleHtml,
  parseRoboticsPlan,
  roboticsPlanToEngProject,
  roboticsPlanToMarkdown,
  tabGroupMarkdown,
  type ParsedRoboticsPlan,
} from '../../../../ai/engineering/robotics-format';
import {
  createSectionCollector,
  type SectionStreamSnapshot,
} from '../../../../ai/engineering/streaming-sections';
import { checkModelReadiness, type ModelReadiness } from '../../../../ai/models/model-readiness';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { CavaloAiMark } from '../brand/CavaloHorseMark';

// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — roboți, vehicule, mecanisme, PCB, CAD
// ──────────────────────────────────────────────────────────────

type RoboticsTabId = (typeof ROBOTICS_TAB_GROUPS)[number]['id'];

export function EngineeringAIPanel() {
  useCavalTheme();
  const projectPath = useEditorStore((s) => s.projectPath);

  const selectedModel = useAIStore((s) => s.selectedModel);
  const apiKeys = useAIStore((s) => s.apiKeys);
  const loadModelLabels = useAIStore((s) => s.loadModelLabels);
  const handoffFromEngineering = useAIStore((s) => s.handoffFromEngineering);

  const { catalog, loading: catalogLoading } = useModelCatalog();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [readinessHint, setReadinessHint] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ModelReadiness | null>(null);
  const [project, setProject] = useState<EngProject | null>(null);
  const [plan, setPlan] = useState<ParsedRoboticsPlan | null>(null);
  const [activeTab, setActiveTab] = useState<RoboticsTabId>('overview');
  const [openRouterConfigured, setOpenRouterConfigured] = useState(false);
  const [tabCols, setTabCols] = useState(2);
  const [streamProgress, setStreamProgress] = useState<SectionStreamSnapshot | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const collectorRef = useRef(createSectionCollector());
  const userTabLockedRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadModelLabels();
  }, [loadModelLabels]);

  // Grilă tab-uri responsivă: 2 coloane când panelul e lat (>=360px), 1 coloană sub.
  useEffect(() => {
    const el = tabsWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setTabCols(w < 360 ? 1 : 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project, plan]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settingsRes, secretsRes] = await Promise.all([
        window.caval.settingsLoad?.(),
        window.caval.secretsGet?.(),
      ]);
      const configured =
        settingsRes?.settings?.['openrouter.configured'] === 'true' ||
        secretsRes?.configured?.OPENROUTER_API_KEY === true;
      if (!cancelled) setOpenRouterConfigured(configured);
      const result = await checkModelReadiness(selectedModel, apiKeys, {
        openRouterApiKey: configured ? '__configured__' : undefined,
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
      openRouterApiKey: openRouterConfigured ? '__configured__' : undefined,
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
    setWarning(null);
    setReadinessHint(null);
    setStreamProgress(null);
    userTabLockedRef.current = false;
    collectorRef.current.reset();
    streamIdRef.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    const flushPartial = (accumulated: string) => {
      const snap = collectorRef.current.snapshot();
      setStreamProgress(snap);
      if (!accumulated.trim()) return;
      const partialPlan = parseRoboticsPlan(accumulated);
      setPlan(partialPlan);
      try {
        setProject(roboticsPlanToEngProject(partialPlan));
      } catch {
        /* partial plans may lack structured fields — keep markdown tabs */
      }
    };

    let accumulated = '';
    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPartial(accumulated);
      }, 150);
    };

    const result = await generateEngineering({
      prompt,
      modelId: selectedModel,
      apiKeys,
      workspaceRoot: projectPath,
      signal: controller.signal,
      onStreamStart: (id) => {
        streamIdRef.current = id;
      },
      onDelta: (chunk) => {
        accumulated += chunk;
        collectorRef.current.push(chunk);
        scheduleFlush();
      },
    });

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    collectorRef.current.finish();
    setStreamProgress(null);

    if (controller.signal.aborted) {
      abortRef.current = null;
      streamIdRef.current = null;
      setLoading(false);
      return;
    }

    if (result.ok && result.project) {
      setProject(result.project);
      setPlan(result.plan ?? null);
      setWarning(result.warning ?? null);
      if (!userTabLockedRef.current) {
        setActiveTab('overview');
      }
    } else {
      setWarning(null);
      setError(result.error ?? 'Generare eșuată.');
    }
    abortRef.current = null;
    streamIdRef.current = null;
    setLoading(false);
  }, [prompt, selectedModel, apiKeys, openRouterConfigured, projectPath]);

  const handleStop = useCallback(() => {
    const streamId = streamIdRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    streamIdRef.current = null;
    if (streamId) {
      void window.caval.abortChatStream?.(streamId);
    }
    void useEngineeringCadStore.getState().cancelCadJob();
    setLoading(false);
    setStreamProgress(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            background: 'linear-gradient(135deg, #00E0FF22, #7C3AED22)',
            border: '1px solid rgba(0,224,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <CavaloAiMark size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1.2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>
                Robotics AI
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                padding: '1px 5px', borderRadius: 4,
                background: 'rgba(124,58,237,0.25)', color: '#A78BFA',
              }}>
                ULTRA
              </span>
            </div>
            <div style={{
              fontSize: 10, color: 'var(--caval-text-muted)', lineHeight: 1.35, marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Roboți · vehicule · mecanisme · componente · CAD · fabricare
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <ChatModelSelect catalog={catalog} loading={catalogLoading} />
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder="Descrie orice obiect sau sistem… (Ctrl+Enter = generează)"
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 10,
            background: 'var(--caval-surface)', border: '1px solid var(--caval-border)',
            borderRadius: 6, padding: '7px 9px',
            color: 'var(--caval-text)', fontSize: 12.5,
            fontFamily: "'Inter', sans-serif", resize: 'none', outline: 'none',
            lineHeight: 1.55,
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(0,224,255,0.4)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--caval-border)'; }}
        />

        {warning && (
          <div style={{
            marginTop: 5, padding: '5px 8px', borderRadius: 5,
            background: 'rgba(212,168,87,0.08)', border: '1px solid rgba(212,168,87,0.2)',
            color: '#D4A857', fontSize: 11.5,
          }}>
            {warning}
          </div>
        )}

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

      {!project || !plan ? (
        <EmptyState />
      ) : (
        <>
          <div style={{
            display: 'flex', gap: 2, padding: '8px 10px 0',
            borderBottom: '1px solid var(--caval-border)', flexShrink: 0,
            flexDirection: 'column',
          }}>
            <div
              ref={tabsWrapRef}
              role="tablist"
              style={{
                display: 'grid',
                gridTemplateColumns: tabCols === 1 ? '1fr' : '1fr 1fr',
                gap: 6,
                marginBottom: 2,
              }}
            >
            {ROBOTICS_TAB_GROUPS.map(({ id, label }) => (
              <ResultTab
                key={id}
                label={label}
                active={activeTab === id}
                onClick={() => {
                  userTabLockedRef.current = true;
                  setActiveTab(id);
                }}
              />
            ))}
            </div>
            {streamProgress && streamProgress.total > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', padding: '4px 2px 6px' }}>
                Secțiuni: {streamProgress.completed}/{streamProgress.total}
                {streamProgress.activeKey ? ` · generează ${streamProgress.activeKey}` : ''}
              </div>
            )}
            <button
              type="button"
              onClick={handleSoftwareHandoff}
              title="Deschide Coding Chat cu contextul Robotics AI"
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
            <RoboticsTabContent
              tabId={activeTab}
              plan={plan}
              project={project}
              projectPath={projectPath}
              userPrompt={prompt}
            />
          </div>
        </>
      )}
    </div>
  );
}

function RoboticsTabContent({
  tabId,
  plan,
  project,
  projectPath,
  userPrompt,
}: {
  tabId: RoboticsTabId;
  plan: ParsedRoboticsPlan;
  project: EngProject;
  projectPath: string | null;
  userPrompt: string;
}) {
  const group = ROBOTICS_TAB_GROUPS.find((g) => g.id === tabId);
  const md = group ? tabGroupMarkdown(plan, group.sections) : '';

  if (tabId === 'parts') {
    return (
      <>
        <MarkdownSection html={markdownToSimpleHtml(md)} />
        <PartsView parts={project.parts} projectPath={projectPath} />
      </>
    );
  }

  if (tabId === 'cad') {
    return (
      <>
        <MarkdownSection html={markdownToSimpleHtml(md)} />
        <CadActions project={project} projectPath={projectPath} userPrompt={userPrompt} plan={plan} />
      </>
    );
  }

  if (tabId === 'docs') {
    return (
      <>
        <MarkdownSection html={markdownToSimpleHtml(md)} />
        <ExportPlanButton plan={plan} title={project.spec.title} projectPath={projectPath} />
      </>
    );
  }

  return <MarkdownSection html={markdownToSimpleHtml(md)} />;
}

function MarkdownSection({ html }: { html: string }) {
  if (!html.trim()) {
    return (
      <div style={{ fontSize: 12, color: 'var(--caval-text-muted)', fontStyle: 'italic' }}>
        Secțiunea nu a fost generată încă.
      </div>
    );
  }
  return (
    <div
      style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--caval-text)' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ExportPlanButton({
  plan,
  title,
  projectPath,
}: {
  plan: ParsedRoboticsPlan;
  title: string;
  projectPath: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const handleExport = async () => {
    const content = roboticsPlanToMarkdown(plan, title);
    if (!projectPath) {
      setMsg('Deschide un folder de proiect pentru export.');
      return;
    }
    const res = await window.caval.engineering.saveFile(projectPath, {
      name: 'robotics-plan.md',
      content,
    });
    setMsg(res.ok ? `Salvat: ${res.savedPath}` : `Eroare: ${res.error}`);
  };
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => void handleExport()}
        style={{
          padding: '8px 14px', borderRadius: 6, border: 'none',
          background: 'var(--caval-accent)', color: '#0E0E0F',
          fontWeight: 700, fontSize: 12, cursor: 'pointer',
        }}
      >
        Export plan MD
      </button>
      {msg && <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

function CadActions({
  project,
  projectPath,
  userPrompt,
  plan,
}: {
  project: EngProject;
  projectPath: string | null;
  userPrompt: string;
  plan: ParsedRoboticsPlan;
}) {
  const phase = useEngineeringCadStore((s) => s.phase);
  const cadBusy = useEngineeringCadStore((s) => s.cadBusy);
  const cadStatus = useEngineeringCadStore((s) => s.serverStatus);
  const cadError = useEngineeringCadStore((s) => s.error);
  const statusMessage = useEngineeringCadStore((s) => s.statusMessage);
  const createCadJob = useEngineeringCadStore((s) => s.createCadJob);
  const retryCadJob = useEngineeringCadStore((s) => s.retryCadJob);
  const scad = extractScadBlock(plan.rawMarkdown);

  const saveScad = async () => {
    if (!scad || !projectPath) return;
    await window.caval.engineering.saveFile(projectPath, { name: 'model.scad', content: scad });
  };

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {scad && projectPath && (
        <button
          type="button"
          onClick={() => void saveScad()}
          style={{
            padding: '8px 0', borderRadius: 6, border: '1px solid var(--caval-border)',
            background: 'var(--caval-surface)', color: 'var(--caval-text)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          Salvează model.scad în proiect
        </button>
      )}
      <button
        type="button"
        onClick={() => void createCadJob({ project, userPrompt, projectPath })}
        disabled={cadBusy}
        style={{
          padding: '9px 0', borderRadius: 6, border: 'none',
          background: cadBusy ? 'rgba(0,224,255,0.25)' : 'rgba(124,58,237,0.85)',
          color: '#fff', fontWeight: 700, fontSize: 12.5,
          cursor: cadBusy ? 'wait' : 'pointer',
        }}
      >
        {cadBusy
          ? `Generez STL… (${phase}${cadStatus ? ` / ${cadStatus}` : ''})`
          : 'Generează STL 3D (cloud)'}
      </button>

      {cadBusy && statusMessage && (
        <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          {statusMessage}
        </div>
      )}

      {phase === 'failed' && cadError && (
        <div style={{
          padding: '7px 9px', borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
          color: '#EF4444', fontSize: 11.5, lineHeight: 1.45,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Generarea 3D a eșuat</div>
          {cadError}
          <button
            type="button"
            onClick={() => void retryCadJob()}
            style={{
              display: 'block', marginTop: 7, padding: '6px 12px', borderRadius: 6,
              border: '1px solid rgba(239,68,68,0.35)', background: 'transparent',
              color: '#EF4444', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
            }}
          >
            Reîncearcă
          </button>
        </div>
      )}
    </div>
  );
}

function ResultTab({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: active ? 'rgba(0,224,255,0.10)' : 'var(--caval-surface)',
        color: active ? 'var(--caval-accent)' : 'var(--caval-text)',
        fontSize: 11.5, fontWeight: active ? 700 : 500,
        lineHeight: 1.2, textAlign: 'left', width: '100%',
        whiteSpace: 'normal', wordBreak: 'break-word',
        transition: 'border-color 0.12s, background 0.12s, color 0.12s',
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
          {exported ? 'Exportat ✓' : 'Export listă componente'}
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
