import React from 'react';
import { CadViewer } from './CadViewer';
import type { CadJobStatus } from '../../store/engineering-store';

const STATUS_LABELS: Record<CadJobStatus, string> = {
  queued: 'În coadă…',
  generating: 'Generez cod CAD…',
  rendering: 'Compilez OpenSCAD…',
  done: 'Model gata',
  failed: 'Eșuat',
};

export function CadJobPanel({
  status,
  stlUrl,
  scad,
  error,
  isGenerating,
  onGenerate,
  onStop,
  onDownload,
}: {
  status: CadJobStatus | null;
  stlUrl: string | null;
  scad: string | null;
  error: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onStop: () => void;
  onDownload: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--caval-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          style={{
            padding: '7px 12px',
            borderRadius: 6,
            border: 'none',
            background: isGenerating ? 'rgba(0,224,255,0.3)' : 'var(--caval-accent)',
            color: '#0E0E0F',
            fontWeight: 700,
            fontSize: 12,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
          }}
        >
          {isGenerating ? 'Generez model…' : 'Generează model 3D'}
        </button>
        {isGenerating && (
          <button
            type="button"
            onClick={onStop}
            style={{
              padding: '7px 10px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'transparent',
              color: 'var(--caval-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
        {status && (
          <span style={{ fontSize: 11.5, color: 'var(--caval-accent)', fontWeight: 600 }}>
            {STATUS_LABELS[status]}
          </span>
        )}
        {stlUrl && (
          <button
            type="button"
            onClick={onDownload}
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: 5,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)',
              color: 'var(--caval-text)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Download STL
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '8px 14px',
          fontSize: 11.5,
          color: /fallback|mock|MOCK|repair/i.test(error) ? '#fbbf24' : '#FF8080',
          borderBottom: '1px solid var(--caval-border)',
          background: /fallback|mock|MOCK|repair/i.test(error)
            ? 'rgba(251,191,36,0.08)'
            : 'rgba(239,68,68,0.08)',
        }}>
          {/fallback|mock|MOCK/i.test(error)
            ? `⚠ ${error}`
            : error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <CadViewer stlUrl={stlUrl} />
        {isGenerating && status !== 'done' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,10,11,0.55)',
            pointerEvents: 'none',
          }}>
            <div style={{
              padding: '12px 18px',
              borderRadius: 8,
              border: '1px solid var(--caval-border)',
              background: 'var(--caval-surface)',
              color: 'var(--caval-accent)',
              fontSize: 12,
              fontWeight: 600,
            }}>
              {status ? STATUS_LABELS[status] : 'Pornesc job CAD…'}
            </div>
          </div>
        )}
      </div>

      {scad && (
        <details style={{
          borderTop: '1px solid var(--caval-border)',
          flexShrink: 0,
          maxHeight: 180,
          overflow: 'auto',
        }}>
          <summary style={{
            padding: '8px 14px',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--caval-text-muted)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            OpenSCAD sursă
          </summary>
          <pre style={{
            margin: 0,
            padding: '10px 14px',
            fontSize: 11,
            lineHeight: 1.45,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--caval-text)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {scad}
          </pre>
        </details>
      )}
    </div>
  );
}
