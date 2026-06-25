import React, { useState } from 'react';
import { useEngineeringStore } from '../../store/engineering-store';
import { CadJobPanel } from './CadJobPanel';
import {
  projectTypeLabel,
  emptyEngineeringSections,
  type EngineeringProjectType,
  type EngineeringSectionKey,
} from './engineering-format';

const PROJECT_TYPES: EngineeringProjectType[] = ['drone', 'robot', 'iot', 'cnc', 'custom'];

const SECTION_META: { key: EngineeringSectionKey; label: string }[] = [
  { key: 'requirements', label: 'Cerințe' },
  { key: 'bom', label: 'BOM' },
  { key: 'circuit', label: 'Circuit' },
  { key: 'pcb', label: 'PCB' },
  { key: 'assembly', label: 'Asamblare' },
  { key: 'testing', label: 'Testare' },
  { key: 'performance', label: 'Performanță' },
  { key: 'upgrades', label: 'Upgrade-uri' },
];

function Chip({
  label, active, onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 99,
        border: `1px solid ${active ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: active ? 'rgba(0,224,255,0.1)' : 'var(--caval-surface)',
        color: active ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}

function Field({
  label, value, onChange, placeholder, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 140 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--caval-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--caval-bg)',
          border: '1px solid var(--caval-border)',
          borderRadius: 6,
          padding: '7px 10px',
          color: 'var(--caval-text)',
          fontSize: 12,
          fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
          outline: 'none',
        }}
      />
    </label>
  );
}

function SectionCard({ title, content, bomRows }: {
  title: string;
  content: string;
  bomRows?: { name: string; partNumber: string; quantity: string; role: string; notes: string }[];
}) {
  if (!content && (!bomRows || bomRows.length === 0)) return null;

  return (
    <div style={{
      background: 'var(--caval-surface)',
      border: '1px solid var(--caval-border)',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--caval-border)',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--caval-accent)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ padding: '12px 14px' }}>
        {bomRows && bomRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bomRows.map((row, i) => (
              <div
                key={`${row.name}-${i}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--caval-border)',
                  background: 'var(--caval-bg)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--caval-text)', marginBottom: 4 }}>
                  {row.name}
                  {row.quantity ? <span style={{ color: 'var(--caval-text-muted)', fontWeight: 500 }}> × {row.quantity}</span> : null}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', lineHeight: 1.5 }}>
                  {row.partNumber && <div><strong>Cod:</strong> {row.partNumber}</div>}
                  {row.role && <div><strong>Rol:</strong> {row.role}</div>}
                  {row.notes && <div><strong>Note:</strong> {row.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--caval-text)',
          }}>
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

export function EngineeringAIPanel() {
  const {
    prompt, projectType, constraints,
    isGenerating, streamText, error, lastPlan,
    cadJob, isCadGenerating,
    setPrompt, setProjectType, setConstraints,
    generatePlan, stopGeneration, clearResult,
    exportBomCsv, exportMarkdown, exportCircuitJson, exportPdf,
    generateCadModel, stopCadPolling, downloadCadStl,
  } = useEngineeringStore();

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<EngineeringSectionKey | 'all'>('all');
  const [rightTab, setRightTab] = useState<'plan' | 'cad'>('plan');

  const parsed = lastPlan?.parsed;
  const displaySections = parsed?.sections ?? emptyEngineeringSections();
  const bomRows = parsed?.bomRows ?? [];

  const handleExport = async (kind: 'csv' | 'md' | 'json' | 'pdf') => {
    setExportMsg(null);
    const fn = {
      csv: exportBomCsv,
      md: exportMarkdown,
      json: exportCircuitJson,
      pdf: exportPdf,
    }[kind];
    const result = await fn();
    setExportMsg(result.ok ? 'Export reușit.' : (result.error ?? 'Export eșuat.'));
    setTimeout(() => setExportMsg(null), 3000);
  };

  const visibleSections = activeSection === 'all'
    ? SECTION_META
    : SECTION_META.filter((s) => s.key === activeSection);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--caval-bg)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--caval-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--caval-text)' }}>
            Engineering AI
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--caval-text-muted)', marginTop: 2 }}>
            Proiectează hardware: BOM, circuit logic, PCB, asamblare și testare
          </div>
        </div>
        {lastPlan && (
          <button
            type="button"
            onClick={clearResult}
            style={{
              padding: '5px 10px',
              borderRadius: 5,
              border: '1px solid var(--caval-border)',
              background: 'transparent',
              color: 'var(--caval-text-muted)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Șterge rezultat
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: input form */}
        <div style={{
          width: 380,
          flexShrink: 0,
          borderRight: '1px solid var(--caval-border)',
          overflowY: 'auto',
          padding: 16,
        }}
          className="ai-messages-scroll"
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Definește proiectul
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {PROJECT_TYPES.map((type) => (
              <Chip
                key={type}
                label={projectTypeLabel(type)}
                active={projectType === type}
                onClick={() => {
                  setProjectType(type);
                  if (!prompt.trim() && type !== 'custom') {
                    const samples: Record<EngineeringProjectType, string> = {
                      drone: 'Vreau să fac o dronă FPV 5 inch pentru racing',
                      robot: 'Vreau un robot mobil cu senzori și braț robotic simplu',
                      iot: 'Vreau un nod IoT cu senzori ambientali și conectivitate WiFi',
                      cnc: 'Vreau un controller simplu pentru un CNC desktop 3 axe',
                      custom: '',
                    };
                    setPrompt(samples[type]);
                  }
                }}
              />
            ))}
          </div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--caval-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ce vrei să construiești?
            </span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Vreau să fac o dronă FPV 5 inch pentru racing..."
              rows={5}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 6,
                background: 'var(--caval-surface)',
                border: '1px solid var(--caval-border)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--caval-text)',
                fontSize: 12.5,
                lineHeight: 1.5,
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </label>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--caval-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Constrângeri (opțional)
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <Field label="Buget" value={constraints.budget} onChange={(v) => setConstraints({ budget: v })} placeholder="ex: 300 EUR" />
            <Field label="Dimensiuni" value={constraints.dimensions} onChange={(v) => setConstraints({ dimensions: v })} placeholder="ex: 250×250 mm" />
            <Field label="Tensiune" value={constraints.voltage} onChange={(v) => setConstraints({ voltage: v })} placeholder="ex: 4S LiPo" />
            <Field label="Autonomie" value={constraints.autonomy} onChange={(v) => setConstraints({ autonomy: v })} placeholder="ex: 8 min" />
            <Field label="Greutate" value={constraints.weight} onChange={(v) => setConstraints({ weight: v })} placeholder="ex: sub 600g" />
          </div>

          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--caval-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Skill level
            </span>
            <select
              value={constraints.skillLevel}
              onChange={(e) => setConstraints({ skillLevel: e.target.value as typeof constraints.skillLevel })}
              style={{
                width: '100%',
                marginTop: 6,
                background: 'var(--caval-surface)',
                border: '1px solid var(--caval-border)',
                borderRadius: 6,
                padding: '7px 10px',
                color: 'var(--caval-text)',
                fontSize: 12,
              }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => void generatePlan()}
              disabled={isGenerating || !prompt.trim()}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 6,
                border: 'none',
                background: isGenerating ? 'rgba(0,224,255,0.3)' : 'var(--caval-accent)',
                color: '#0E0E0F',
                fontWeight: 700,
                fontSize: 13,
                cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                opacity: !prompt.trim() ? 0.5 : 1,
              }}
            >
              {isGenerating ? 'Generez plan…' : 'Generează hardware plan'}
            </button>
            {isGenerating && (
              <button
                type="button"
                onClick={stopGeneration}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--caval-border)',
                  background: 'transparent',
                  color: 'var(--caval-text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Stop
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setRightTab('cad');
              void generateCadModel();
            }}
            disabled={isCadGenerating || !prompt.trim()}
            style={{
              width: '100%',
              padding: '9px 14px',
              borderRadius: 6,
              border: '1px solid var(--caval-accent)',
              background: 'transparent',
              color: 'var(--caval-accent)',
              fontWeight: 600,
              fontSize: 12.5,
              cursor: isCadGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
              opacity: !prompt.trim() ? 0.5 : 1,
              marginBottom: 8,
            }}
          >
            {isCadGenerating ? 'Generez model 3D…' : 'Generează model 3D'}
          </button>

          {error && (
            <div style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 6,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#FF8080',
              fontSize: 11.5,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Right: output */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--caval-border)',
            display: 'flex',
            gap: 8,
            flexShrink: 0,
          }}>
            <Chip label="Plan hardware" active={rightTab === 'plan'} onClick={() => setRightTab('plan')} />
            <Chip label="Model 3D" active={rightTab === 'cad'} onClick={() => setRightTab('cad')} />
          </div>

          {rightTab === 'cad' ? (
            <CadJobPanel
              status={cadJob?.status ?? null}
              stlUrl={cadJob?.stlUrl ?? null}
              scad={cadJob?.scad ?? null}
              error={cadJob?.error ?? error}
              isGenerating={isCadGenerating}
              onGenerate={() => void generateCadModel()}
              onStop={stopCadPolling}
              onDownload={() => void downloadCadStl()}
            />
          ) : (
          <>
          {/* Output toolbar */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--caval-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginRight: 4 }}>Secțiuni:</span>
            <Chip label="Toate" active={activeSection === 'all'} onClick={() => setActiveSection('all')} />
            {SECTION_META.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={activeSection === s.key}
                onClick={() => setActiveSection(s.key)}
              />
            ))}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['csv', 'md', 'json', 'pdf'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!lastPlan}
                  onClick={() => void handleExport(kind)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 5,
                    border: '1px solid var(--caval-border)',
                    background: lastPlan ? 'var(--caval-surface)' : 'transparent',
                    color: lastPlan ? 'var(--caval-text)' : 'var(--caval-text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: lastPlan ? 'pointer' : 'not-allowed',
                    opacity: lastPlan ? 1 : 0.5,
                  }}
                >
                  {kind === 'csv' ? 'BOM CSV' : kind === 'md' ? 'Markdown' : kind === 'json' ? 'Circuit JSON' : 'PDF'}
                </button>
              ))}
            </div>
          </div>

          {exportMsg && (
            <div style={{
              padding: '6px 14px',
              fontSize: 11,
              color: 'var(--caval-accent)',
              borderBottom: '1px solid var(--caval-border)',
            }}>
              {exportMsg}
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="ai-messages-scroll">
            {!streamText && !isGenerating && (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--caval-text-muted)',
                fontSize: 13,
                textAlign: 'center',
                padding: 24,
              }}>
                <div>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⚙</div>
                  <div style={{ fontWeight: 600, color: 'var(--caval-text)', marginBottom: 6 }}>
                    Niciun plan generat încă
                  </div>
                  <div style={{ maxWidth: 360, lineHeight: 1.5 }}>
                    Descrie proiectul hardware, adaugă constrângeri opționale și apasă „Generează hardware plan”.
                  </div>
                </div>
              </div>
            )}

            {isGenerating && !parsed && (
              <div style={{
                padding: 14,
                borderRadius: 8,
                border: '1px solid var(--caval-border)',
                background: 'var(--caval-surface)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--caval-accent)', marginBottom: 8, fontWeight: 600 }}>
                  ⬤ Generare în curs…
                </div>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: 'var(--caval-text)',
                }}>
                  {streamText || 'Aștept răspuns de la model…'}
                </pre>
              </div>
            )}

            {parsed && visibleSections.map(({ key, label }) => (
              <SectionCard
                key={key}
                title={label}
                content={displaySections[key] ?? ''}
                bomRows={key === 'bom' ? bomRows : undefined}
              />
            ))}

            {parsed && activeSection === 'all' && displaySections.other && (
              <SectionCard title="Note" content={displaySections.other} />
            )}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
