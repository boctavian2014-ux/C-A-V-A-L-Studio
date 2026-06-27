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
  const downloadStl = useEngineeringCadStore((s) => s.downloadStl);
  const clearCadJob = useEngineeringCadStore((s) => s.clearCadJob);
  const cancelCadJob = useEngineeringCadStore((s) => s.cancelCadJob);

  if (!stlUrl) return null;

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
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 6, columnGap: 8 }}>
          {downloadMessage && (
            <span style={{ fontSize: 11, color: 'var(--caval-text-muted)', maxWidth: 280 }}>
              {downloadMessage}
            </span>
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
            Descarcă STL
          </button>
          {(phase === 'submitting' || phase === 'processing') && (
            <button
              type="button"
              onClick={cancelCadJob}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--caval-border)',
                background: 'var(--caval-surface)',
                color: 'var(--caval-text-muted)',
                font: '600 12px Inter, sans-serif',
                cursor: 'pointer',
              }}
            >
              Anulează
            </button>
          )}
          <button
            type="button"
            onClick={clearCadJob}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)',
              color: 'var(--caval-text-muted)',
              font: '600 12px Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            Închide preview
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <CadViewer stlUrl={stlUrl} />
      </div>
    </div>
  );
}
