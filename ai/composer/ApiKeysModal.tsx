import React, { useEffect } from 'react';
import { zIndex } from '../../themes/tokens/z-index';
import { createPortal } from 'react-dom';
import { ApiKeysForm } from './ApiKeysForm';

interface ApiKeysModalProps {
  onClose: () => void;
}

export function ApiKeysModal({ onClose }: ApiKeysModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zIndex.modalOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="api-keys-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--caval-surface)',
          border: '1px solid var(--caval-border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid var(--caval-border)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div id="api-keys-title" style={{ fontSize: 14, fontWeight: 700, color: 'var(--caval-text)' }}>
              API Keys
            </div>
            <div style={{ fontSize: 11, color: 'var(--caval-text-muted)', marginTop: 2 }}>
              Cheile tale rămân local, în aplicație
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: 'none',
              background: 'none',
              color: 'var(--caval-text-muted)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          <ApiKeysForm showSaveButton onSaved={onClose} />
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--caval-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid var(--caval-border)',
              background: 'none',
              color: 'var(--caval-text-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Închide
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
