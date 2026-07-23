import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useAIStore } from '../../../../ai/composer/ai-store';
import {
  type PartItem,
  type EngProject,
} from '../../../../ai/engineering/engineering-generator';
import type { RoboticsComponentBom } from '../../../../ai/engineering/robotics-components-schema';
import { summarizeBomModes } from '../../../../ai/engineering/robotics-decompose';
import {
  ROBOTICS_TAB_GROUPS,
  extractScadBlock,
  markdownToSimpleHtml,
  roboticsPlanToMarkdown,
  tabGroupMarkdown,
  type ParsedRoboticsPlan,
} from '../../../../ai/engineering/robotics-format';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import {
  useRoboticsSessionStore,
  type RoboticsTabId,
} from '../../store/robotics-session-store';

/** Center-stage Robotics plan / tabs (shared session store). */
export function RoboticsResponseStage() {
  const projectPath = useEditorStore((s) => s.projectPath);
  const handoffFromEngineering = useAIStore((s) => s.handoffFromEngineering);

  const prompt = useRoboticsSessionStore((s) => s.prompt);
  const loading = useRoboticsSessionStore((s) => s.loading);
  const project = useRoboticsSessionStore((s) => s.project);
  const plan = useRoboticsSessionStore((s) => s.plan);
  const bom = useRoboticsSessionStore((s) => s.bom);
  const activeTab = useRoboticsSessionStore((s) => s.activeTab);
  const streamProgress = useRoboticsSessionStore((s) => s.streamProgress);
  const warning = useRoboticsSessionStore((s) => s.warning);
  const error = useRoboticsSessionStore((s) => s.error);
  const setActiveTab = useRoboticsSessionStore((s) => s.setActiveTab);
  const setUserTabLocked = useRoboticsSessionStore((s) => s.setUserTabLocked);

  const [tabCols, setTabCols] = useState(2);
  const tabsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tabsWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setTabCols(w < 520 ? 1 : 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project, plan]);

  const handleSoftwareHandoff = () => {
    if (!project) return;
    const result = handoffFromEngineering({ project, userPrompt: prompt });
    if (!result.ok) {
      useRoboticsSessionStore.getState().setError(result.error);
    }
  };

  if (!project || !plan) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: 32, textAlign: 'center', minHeight: 0,
      }}>
        <div className={loading ? 'glow-accent' : undefined} style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(0,224,255,0.12), rgba(124,58,237,0.12))',
          border: '1px solid rgba(0,224,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--caval-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--caval-text)' }}>
          {loading ? 'Generez planul Robotics…' : 'Răspunsul apare aici, în centru'}
          {loading && <span className="glass-stream-cursor" aria-hidden />}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--caval-text-muted)', lineHeight: 1.55, maxWidth: 420 }}>
          Scrie cererea în panoul din dreapta și apasă Generează. Planul, BOM-ul și acțiunile CAD
          se afișează pe tot ecranul central.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0,
      background: 'var(--caval-bg)',
    }}>
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 24px 32px',
      }}>
        <div style={{
          width: '100%', maxWidth: 900, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {(warning || error) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {warning && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(212,168,87,0.08)', border: '1px solid rgba(212,168,87,0.2)',
                  color: '#D4A857', fontSize: 12.5, lineHeight: 1.45,
                }}>
                  {warning}
                </div>
              )}
              {error && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)',
                  color: '#EF4444', fontSize: 12.5, lineHeight: 1.45,
                }}>
                  {error}
                </div>
              )}
            </div>
          )}

          <div
            ref={tabsWrapRef}
            role="tablist"
            style={{
              display: 'grid',
              gridTemplateColumns: tabCols === 1 ? '1fr' : '1fr 1fr',
              gap: 8,
            }}
          >
            {ROBOTICS_TAB_GROUPS.map(({ id, label }) => (
              <ResultTab
                key={id}
                label={label}
                active={activeTab === id}
                onClick={() => {
                  setUserTabLocked(true);
                  setActiveTab(id as RoboticsTabId);
                }}
              />
            ))}
          </div>

          {streamProgress && streamProgress.total > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)' }}>
              Secțiuni: {streamProgress.completed}/{streamProgress.total}
              {streamProgress.activeKey ? ` · generează ${streamProgress.activeKey}` : ''}
            </div>
          )}

          <button
            type="button"
            onClick={handleSoftwareHandoff}
            title="Deschide Coding Chat cu contextul Robotics AI"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(124,58,237,0.45)',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(0,224,255,0.1))',
              color: 'var(--caval-text)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            → Generează software în Coding Chat
          </button>

          <div className="glass-panel glass-ai-bubble" style={{
            padding: '16px 18px',
            borderRadius: 14,
            marginBottom: streamProgress ? 8 : 0,
          }}>
            <RoboticsTabContent
              tabId={activeTab}
              plan={plan}
              project={project}
              bom={bom}
              projectPath={projectPath}
              userPrompt={prompt}
            />
            {Boolean(streamProgress) && <span className="glass-stream-cursor" aria-hidden />}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoboticsTabContent({
  tabId,
  plan,
  project,
  bom,
  projectPath,
  userPrompt,
}: {
  tabId: RoboticsTabId;
  plan: ParsedRoboticsPlan;
  project: EngProject;
  bom: RoboticsComponentBom | null;
  projectPath: string | null;
  userPrompt: string;
}) {
  const group = ROBOTICS_TAB_GROUPS.find((g) => g.id === tabId);
  const md = group ? tabGroupMarkdown(plan, group.sections) : '';

  if (tabId === 'parts') {
    return (
      <>
        {bom && <ComponentsBomView bom={bom} />}
        <MarkdownSection html={markdownToSimpleHtml(md)} />
        <PartsView parts={project.parts} projectPath={projectPath} />
      </>
    );
  }

  if (tabId === 'cad') {
    return (
      <>
        {bom && <ComponentsBomView bom={bom} />}
        <MarkdownSection html={markdownToSimpleHtml(md)} />
        <CadActions
          project={project}
          projectPath={projectPath}
          userPrompt={userPrompt}
          plan={plan}
          bom={bom}
        />
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

function ComponentsBomView({ bom }: { bom: RoboticsComponentBom }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--caval-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
      }}>
        Decompose CAD · {summarizeBomModes(bom.components)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bom.components.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '7px 10px', borderRadius: 8,
              border: '1px solid var(--caval-border)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: c.mode === 'standard' ? 'rgba(0,224,255,0.15)' : 'rgba(124,58,237,0.2)',
              color: c.mode === 'standard' ? 'var(--caval-accent)' : '#A78BFA',
            }}>
              {c.mode === 'standard' ? 'Standard' : 'Custom'}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)', flex: 1 }}>
              {c.name}
              <span style={{ color: 'var(--caval-text-muted)', fontWeight: 500 }}> ×{c.qty}</span>
            </span>
            {c.standardKey && (
              <span style={{ fontSize: 10, color: 'var(--caval-text-muted)', fontFamily: 'monospace' }}>
                {c.standardKey}
              </span>
            )}
          </div>
        ))}
      </div>
      {bom.assemblyHints && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          {bom.assemblyHints}
        </div>
      )}
    </div>
  );
}

function MarkdownSection({ html }: { html: string }) {
  if (!html.trim()) {
    return (
      <div style={{ fontSize: 13, color: 'var(--caval-text-muted)', fontStyle: 'italic' }}>
        Secțiunea nu a fost generată încă.
      </div>
    );
  }
  return (
    <div
      className="glass-markdown"
      style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--caval-text)' }}
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
  bom,
}: {
  project: EngProject;
  projectPath: string | null;
  userPrompt: string;
  plan: ParsedRoboticsPlan;
  bom: RoboticsComponentBom | null;
}) {
  const phase = useEngineeringCadStore((s) => s.phase);
  const cadBusy = useEngineeringCadStore((s) => s.cadBusy);
  const batchBusy = useEngineeringCadStore((s) => s.batchBusy);
  const batchParts = useEngineeringCadStore((s) => s.batchParts);
  const batchSummary = useEngineeringCadStore((s) => s.batchSummary);
  const cadStatus = useEngineeringCadStore((s) => s.serverStatus);
  const cadError = useEngineeringCadStore((s) => s.error);
  const statusMessage = useEngineeringCadStore((s) => s.statusMessage);
  const createCadJob = useEngineeringCadStore((s) => s.createCadJob);
  const createBatchFromBom = useEngineeringCadStore((s) => s.createBatchFromBom);
  const exportBatchZip = useEngineeringCadStore((s) => s.exportBatchZip);
  const retryCadJob = useEngineeringCadStore((s) => s.retryCadJob);
  const scad = extractScadBlock(plan.rawMarkdown);
  const busy = cadBusy || batchBusy;

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

      {bom && bom.components.length > 0 && (
        <button
          type="button"
          onClick={() => void createBatchFromBom({ bom, project, userPrompt, projectPath })}
          disabled={busy}
          style={{
            padding: '9px 0', borderRadius: 6, border: 'none',
            background: busy ? 'rgba(0,224,255,0.25)' : 'linear-gradient(135deg, rgba(0,224,255,0.95), rgba(124,58,237,0.85))',
            color: busy ? '#fff' : '#0E0E0F',
            fontWeight: 700, fontSize: 12.5,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {batchBusy
            ? `Batch STL… (${batchParts.filter((p) => p.status === 'done').length}/${batchParts.length || bom.components.length})`
            : `Generează STL-uri (${bom.components.length} piese · dual-mode)`}
        </button>
      )}

      <button
        type="button"
        onClick={() => void createCadJob({ project, userPrompt, projectPath })}
        disabled={busy}
        style={{
          padding: '9px 0', borderRadius: 6, border: 'none',
          background: busy ? 'rgba(0,224,255,0.25)' : 'rgba(124,58,237,0.85)',
          color: '#fff', fontWeight: 700, fontSize: 12.5,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {cadBusy && !batchBusy
          ? `Generez STL… (${phase}${cadStatus ? ` / ${cadStatus}` : ''})`
          : 'Generează STL 3D (o piesă / cloud)'}
      </button>

      {batchParts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {batchParts.map((p) => (
            <div key={p.id} style={{ fontSize: 11, color: 'var(--caval-text-muted)', display: 'flex', gap: 8 }}>
              <span style={{
                color: p.status === 'done' ? 'var(--caval-accent)'
                  : p.status === 'failed' ? '#EF4444'
                    : p.status === 'running' ? '#A78BFA' : 'var(--caval-text-muted)',
              }}>
                {p.status === 'done' ? '✓' : p.status === 'failed' ? '✗' : p.status === 'running' ? '…' : '○'}
              </span>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span>{p.mode}</span>
            </div>
          ))}
        </div>
      )}

      {batchParts.some((p) => p.status === 'done' && p.stlBase64) && (
        <button
          type="button"
          onClick={() => void exportBatchZip()}
          style={{
            padding: '7px 0', borderRadius: 6, border: '1px solid var(--caval-border)',
            background: 'transparent', color: 'var(--caval-text)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          Export ZIP toate STL-urile
        </button>
      )}

      {(busy || batchSummary) && statusMessage && (
        <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', lineHeight: 1.45 }}>
          {batchSummary ?? statusMessage}
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

function ResultTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: active ? 'rgba(0,224,255,0.10)' : 'var(--caval-surface)',
        color: active ? 'var(--caval-accent)' : 'var(--caval-text)',
        fontSize: 12.5, fontWeight: active ? 700 : 500,
        textAlign: 'left', width: '100%',
      }}
    >
      {label}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-panel" style={{ borderRadius: 10, padding: '12px 13px', marginBottom: 10 }}>
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
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--caval-text)' }}>{p.name}</div>
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
                  style={{ fontSize: 11, color: 'var(--caval-accent)', textDecoration: 'none', cursor: 'pointer' }}
                >
                  {p.shop}
                </a>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--caval-text)', fontFamily: "'JetBrains Mono', monospace" }}>
                {(p.qty * p.unitPrice).toFixed(2)} {p.currency}
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
          type="button"
          onClick={() => void handleExport()}
          style={{
            marginLeft: 'auto', padding: '7px 13px', borderRadius: 6, border: 'none',
            background: exported ? 'rgba(47,191,113,0.18)' : 'var(--caval-accent)',
            color: exported ? '#2FBF71' : '#0E0E0F',
            fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}
        >
          {exported ? 'Exportat ✓' : 'Export listă componente'}
        </button>
      </div>
      {exportMsg && (
        <div style={{ fontSize: 10.5, color: 'var(--caval-text-muted)', marginTop: 6 }}>{exportMsg}</div>
      )}
    </div>
  );
}
