import React, { useCallback, useState } from 'react';
import { CadViewer } from './CadViewer';
import { useEngineeringCadStore } from '../../store/engineering-cad-store';
import { tActive } from '../../../../ai/i18n/active-locale';

import type { CadStorePhase } from '../../store/engineering-cad-store';

const PHASE_LABELS: Record<CadStorePhase, string> = {
  idle: '',
  submitting: 'Planificare…',
  processing: 'Generare…',
  cancelling: 'Oprire…',
  completed: 'Gata',
  failed: 'Eșuat',
  cancelled: 'Anulat',
  stale: 'Necert',
};

export function EngineeringCadPreview() {
  const stlUrl = useEngineeringCadStore((s) => s.stlUrl);
  const stlFileName = useEngineeringCadStore((s) => s.stlFileName);
  const editedStlBase64 = useEngineeringCadStore((s) => s.editedStlBase64);
  const cadTitle = useEngineeringCadStore((s) => s.cadTitle);
  const phase = useEngineeringCadStore((s) => s.phase);
  const serverStatus = useEngineeringCadStore((s) => s.serverStatus);
  const downloadMessage = useEngineeringCadStore((s) => s.downloadMessage);
  const batchParts = useEngineeringCadStore((s) => s.batchParts);
  const activePartId = useEngineeringCadStore((s) => s.activePartId);
  const batchSummary = useEngineeringCadStore((s) => s.batchSummary);
  const downloadStl = useEngineeringCadStore((s) => s.downloadStl);
  const setEditedStl = useEngineeringCadStore((s) => s.setEditedStl);
  const clearCadJob = useEngineeringCadStore((s) => s.clearCadJob);
  const cancelCadJob = useEngineeringCadStore((s) => s.cancelCadJob);
  const setActivePartId = useEngineeringCadStore((s) => s.setActivePartId);
  const exportBatchZip = useEngineeringCadStore((s) => s.exportBatchZip);
  const [editDirty, setEditDirty] = useState(false);
  const busy = phase === 'submitting' || phase === 'processing' || phase === 'cancelling';
  const showShell = Boolean(stlUrl) || busy || phase === 'stale';

  const handleClose = useCallback(() => {
    if (editDirty) {
      const ok = window.confirm(tActive('dialog.unsavedCadViewer'));
      if (!ok) return;
    }
    if (busy) {
      void cancelCadJob();
      return;
    }
    clearCadJob();
  }, [busy, cancelCadJob, clearCadJob, editDirty]);

  const handleSaveEdited = useCallback(
    (base64: string) => {
      setEditedStl(base64);
      setEditDirty(false);
    },
    [setEditedStl]
  );

  if (!showShell) return null;

  const doneParts = batchParts.filter((p) => p.status === 'done' && p.stlUrl);
  const viewerParts = doneParts
    .filter((p): p is typeof p & { stlUrl: string } => Boolean(p.stlUrl))
    .map((p) => ({ id: p.id, name: p.name, stlUrl: p.stlUrl }));
  const title = stlFileName ?? cadTitle ?? 'Model 3D';
  const hasEdited = Boolean(editedStlBase64);

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
          {hasEdited && (
            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--caval-accent)', fontWeight: 600 }}>
              · editat
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
            {hasEdited ? 'STL (cu modificări)' : 'Salvează STL'}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => cancelCadJob()}
              disabled={phase === 'cancelling'}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'transparent',
                color: '#EF4444',
                font: '600 12px Inter, sans-serif',
                cursor: phase === 'cancelling' ? 'not-allowed' : 'pointer',
              }}
            >
              {phase === 'cancelling' ? 'Cancelling…' : 'Stop'}
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
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
        {stlUrl ? (
          <CadViewer
            stlUrl={stlUrl}
            batchParts={viewerParts}
            hasEditedStl={hasEdited}
            onSaveEditedStl={handleSaveEdited}
            onEditDirtyChange={setEditDirty}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              color: 'var(--caval-text-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {phase === 'stale'
              ? 'Nu s-a putut confirma anularea. Jobul ar putea fi încă activ.'
              : 'Aștept STL-ul generat.'}
          </div>
        )}
      </div>
    </div>
  );
}
