import React from 'react';
import { CadViewer } from './CadViewer';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';

import type { CadStorePhase } from '../../store/engineering-cad-store';

const PHASE_LABELS: Record<CadStorePhase, string> = {
  idle: '',
  submitting: 'Planificare…',
  processing: 'Generare…',
  completed: 'Gata',
  failed: 'Eșuat',
  cancelled: 'Anulat',
};

export function EngineeringCadPreview() {
  const stlUrl = useEngineeringCadStore((s) => s.stlUrl);
  const stlFileName = useEngineeringCadStore((s) => s.stlFileName);
  const cadTitle = useEngineeringCadStore((s) => s.cadTitle);
  const phase = useEngineeringCadStore((s) => s.phase);
  const serverStatus = useEngineeringCadStore((s) => s.serverStatus);
  const downloadMessage = useEngineeringCadStore((s) => s.downloadMessage);
  const batchParts = useEngineeringCadStore((s) => s.batchParts);
  const activePartId = useEngineeringCadStore((s) => s.activePartId);
  const batchSummary = useEngineeringCadStore((s) => s.batchSummary);
  const downloadStl = useEngineeringCadStore((s) => s.downloadStl);
  const clearCadJob = useEngineeringCadStore((s) => s.clearCadJob);
  const cancelCadJob = useEngineeringCadStore((s) => s.cancelCadJob);
  const setActivePartId = useEngineeringCadStore((s) => s.setActivePartId);
  const exportBatchZip = useEngineeringCadStore((s) => s.exportBatchZip);

  if (!stlUrl) return null;

  const doneParts = batchParts.filter((p) => p.status === 'done' && p.stlUrl);
  const title = stlFileName ?? cadTitle ?? 'Model 3D';

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: '#0D1117',
      minHeight: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        rowGap: 8,
        columnGap: 12,
        padding: '8px 14px',
        borderBottom: '1px solid var(--caval-border)',
        background: '#111214',
        flexShrink: 0,
      }}>
        <div style={{
          font: "600 12px 'JetBrains Mono', monospace",
          color: 'var(--caval-text)',
        }}>
          {title}
          {(phase !== 'idle' || serverStatus) && (
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--caval-text-muted)', fontWeight: 500 }}>
              {PHASE_LABELS[phase]}{serverStatus ? ` · ${serverStatus}` : ''}
            </span>
          )}
          {batchSummary && (
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--caval-accent)', fontWeight: 500 }}>
              {batchSummary}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6, columnGap: 8 }}>
          {downloadMessage && (
            <span style={{ fontSize: 11, color: 'var(--caval-text-muted)', maxWidth: 280 }}>
              {downloadMessage}
            </span>
          )}
          {doneParts.length > 1 && (
            <button
              type="button"
              onClick={() => void exportBatchZip()}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--caval-border)',
                background: 'transparent',
                color: 'var(--caval-text)',
                font: '600 12px Inter, sans-serif',
                cursor: 'pointer',
              }}
            >
              ZIP
            </button>
          )}
          <button
            type="button"
            onClick={() => void downloadStl()}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--caval-accent)',
              color: '#0E0E0F',
              font: '700 12px Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            Salvează STL
          </button>
          {(phase === 'submitting' || phase === 'processing') && (
            <button
              type="button"
              onClick={() => cancelCadJob()}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'transparent',
                color: '#EF4444',
                font: '600 12px Inter, sans-serif',
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={() => clearCadJob()}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'transparent',
              color: 'var(--caval-text-muted)',
              font: '600 12px Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            Închide
          </button>
        </div>
      </div>

      {doneParts.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '8px 14px',
          borderBottom: '1px solid var(--caval-border)',
          background: '#0f1218',
          flexShrink: 0,
        }}>
          {doneParts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActivePartId(p.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${activePartId === p.id ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
                background: activePartId === p.id ? 'rgba(0,224,255,0.12)' : 'transparent',
                color: activePartId === p.id ? 'var(--caval-accent)' : 'var(--caval-text)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {p.name}
              <span style={{ marginLeft: 6, opacity: 0.7, fontWeight: 500 }}>{p.mode}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <CadViewer stlUrl={stlUrl} />
      </div>
    </div>
  );
}
