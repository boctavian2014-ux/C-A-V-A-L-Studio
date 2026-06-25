import React from 'react';

function ToolbarChip({
  label,
  active,
  onClick,
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
        padding: '5px 10px',
        borderRadius: 99,
        border: `1px solid ${active ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: active ? 'rgba(0,224,255,0.12)' : 'rgba(14,14,15,0.75)',
        color: active ? 'var(--caval-accent)' : 'var(--caval-text-muted)',
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
      }}
    >
      {label}
    </button>
  );
}

export function CadViewerToolbar({
  wireframe,
  autoRotate,
  dimensionsLabel,
  onToggleWireframe,
  onToggleAutoRotate,
}: {
  wireframe: boolean;
  autoRotate: boolean;
  dimensionsLabel: string | null;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
}) {
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      zIndex: 2,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      maxWidth: 'calc(100% - 20px)',
      pointerEvents: 'auto',
    }}>
      <ToolbarChip
        label={wireframe ? 'Wireframe' : 'Solid'}
        active={wireframe}
        onClick={onToggleWireframe}
      />
      <ToolbarChip
        label="Rotație auto"
        active={autoRotate}
        onClick={onToggleAutoRotate}
      />
      {dimensionsLabel && (
        <span style={{
          padding: '5px 10px',
          borderRadius: 99,
          border: '1px solid var(--caval-border)',
          background: 'rgba(14,14,15,0.75)',
          color: 'var(--caval-text)',
          fontSize: 11,
          fontWeight: 600,
          backdropFilter: 'blur(6px)',
        }}>
          {dimensionsLabel}
        </span>
      )}
    </div>
  );
}
