import React, { useEffect } from 'react';

export interface ReferenceHit {
  filePath: string;
  line: number;
  column: number;
  preview?: string;
}

export function ReferencesOverlay({
  open,
  symbol,
  references,
  loading,
  onClose,
  onOpenReference,
}: {
  open: boolean;
  symbol: string;
  references: ReferenceHit[];
  loading?: boolean;
  onClose: () => void;
  onOpenReference: (hit: ReferenceHit) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 640,
          maxHeight: '55vh',
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--caval-border)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--caval-text)',
        }}>
          References: {symbol || '(symbol)'}
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--caval-text-muted)', fontWeight: 400 }}>
            {loading ? 'Searching…' : `${references.length} results`}
          </span>
        </div>
        <div style={{ maxHeight: 'calc(55vh - 44px)', overflowY: 'auto' }}>
          {!loading && references.length === 0 && (
            <p style={{ padding: 12, margin: 0, fontSize: 12, color: 'var(--caval-text-muted)' }}>
              Niciun rezultat
            </p>
          )}
          {references.map((hit, i) => (
            <button
              key={`${hit.filePath}:${hit.line}:${hit.column}:${i}`}
              type="button"
              onClick={() => onOpenReference(hit)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 14px',
                border: 'none',
                borderBottom: '1px solid var(--caval-border)',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--caval-text)',
              }}
            >
              <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                {hit.filePath}:{hit.line}:{hit.column}
              </div>
              {hit.preview && (
                <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 2 }}>
                  {hit.preview}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
