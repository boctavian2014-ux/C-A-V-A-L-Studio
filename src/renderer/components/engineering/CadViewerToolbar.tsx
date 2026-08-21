import React from 'react';
import type {
  CadCameraPreset,
  CadGizmoMode,
  CadSectionAxis,
  CadToolMode,
} from './cad-viewer-tools';
import { useTranslation } from '../../../../ai/i18n/useTranslation';

function ToolbarChip({
  label,
  active,
  onClick,
  disabled,
  title,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 99,
        border: `1px solid ${active ? 'var(--caval-accent)' : 'var(--caval-border)'}`,
        background: active ? 'rgba(0,224,255,0.12)' : 'rgba(14,14,15,0.75)',
        color: disabled
          ? 'var(--caval-text-muted)'
          : active
            ? 'var(--caval-accent)'
            : 'var(--caval-text-muted)',
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        backdropFilter: 'blur(6px)',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--caval-text-muted)',
      marginLeft: 4,
      marginRight: 2,
      opacity: 0.8,
    }}>
      {children}
    </span>
  );
}

export function CadViewerToolbar({
  wireframe,
  autoRotate,
  showGrid,
  toolMode,
  gizmoMode,
  sectionAxis,
  sectionOffset,
  explodeAmount,
  explodeEnabled,
  dirty,
  hasEditedStl,
  dimensionsLabel,
  statusLabel,
  onToggleWireframe,
  onToggleAutoRotate,
  onToggleGrid,
  onSetToolMode,
  onSetGizmoMode,
  onCameraPreset,
  onSectionAxis,
  onSectionOffset,
  onExplodeAmount,
  onResetTransform,
  onSaveEdits,
  onExportPng,
}: {
  wireframe: boolean;
  autoRotate: boolean;
  showGrid: boolean;
  toolMode: CadToolMode;
  gizmoMode: CadGizmoMode;
  sectionAxis: CadSectionAxis;
  sectionOffset: number;
  explodeAmount: number;
  explodeEnabled: boolean;
  dirty: boolean;
  hasEditedStl: boolean;
  dimensionsLabel: string | null;
  statusLabel: string | null;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleGrid: () => void;
  onSetToolMode: (mode: CadToolMode) => void;
  onSetGizmoMode: (mode: CadGizmoMode) => void;
  onCameraPreset: (preset: CadCameraPreset) => void;
  onSectionAxis: (axis: CadSectionAxis) => void;
  onSectionOffset: (offset: number) => void;
  onExplodeAmount: (amount: number) => void;
  onResetTransform: () => void;
  onSaveEdits: () => void;
  onExportPng: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      right: 10,
      zIndex: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxWidth: '100%',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto',
      }}>
        <GroupLabel>Viz</GroupLabel>
        <ToolbarChip
          label={wireframe ? 'Wireframe' : 'Solid'}
          active={wireframe}
          onClick={onToggleWireframe}
        />
        <ToolbarChip label="Grid" active={showGrid} onClick={onToggleGrid} />
        <ToolbarChip
          label="Rotație auto"
          active={autoRotate}
          onClick={onToggleAutoRotate}
        />

        <GroupLabel>Cam</GroupLabel>
        {([
          ['fit', 'Fit'],
          ['iso', 'Iso'],
          ['front', 'Față'],
          ['top', 'Sus'],
          ['right', 'Dreapta'],
        ] as const).map(([preset, label]) => (
          <ToolbarChip
            key={preset}
            label={label}
            onClick={() => onCameraPreset(preset)}
            title={`Cameră ${label}`}
          />
        ))}

        <GroupLabel>{t('robotics.inspection')}</GroupLabel>
        <ToolbarChip
          label="Măsură"
          active={toolMode === 'measure'}
          onClick={() => onSetToolMode(toolMode === 'measure' ? 'idle' : 'measure')}
        />
        <ToolbarChip
          label="Secțiune"
          active={toolMode === 'section'}
          onClick={() => onSetToolMode(toolMode === 'section' ? 'idle' : 'section')}
        />
        <ToolbarChip
          label="Explode"
          active={explodeAmount > 0}
          disabled={!explodeEnabled}
          title={explodeEnabled ? 'Desparte piesele' : 'Necesită ≥2 piese batch'}
          onClick={() => onExplodeAmount(explodeAmount > 0 ? 0 : 0.4)}
        />

        <GroupLabel>Editare</GroupLabel>
        <ToolbarChip
          label="Mută"
          active={toolMode === 'gizmo' && gizmoMode === 'translate'}
          onClick={() => {
            onSetGizmoMode('translate');
            onSetToolMode('gizmo');
          }}
        />
        <ToolbarChip
          label="Rotire"
          active={toolMode === 'gizmo' && gizmoMode === 'rotate'}
          onClick={() => {
            onSetGizmoMode('rotate');
            onSetToolMode('gizmo');
          }}
        />
        <ToolbarChip
          label="Scale"
          active={toolMode === 'gizmo' && gizmoMode === 'scale'}
          onClick={() => {
            onSetGizmoMode('scale');
            onSetToolMode('gizmo');
          }}
        />
        <ToolbarChip label="Reset" onClick={onResetTransform} disabled={!dirty} />
        <ToolbarChip
          label="Salvează modificările"
          active={dirty}
          disabled={!dirty}
          onClick={onSaveEdits}
          title={t('robotics.bakeTransform')}
        />

        <GroupLabel>Export</GroupLabel>
        <ToolbarChip label="PNG" onClick={onExportPng} />

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
        {(statusLabel || hasEditedStl) && (
          <span style={{
            padding: '5px 10px',
            borderRadius: 99,
            border: '1px solid var(--caval-border)',
            background: 'rgba(14,14,15,0.75)',
            color: hasEditedStl ? 'var(--caval-accent)' : 'var(--caval-text)',
            fontSize: 11,
            fontWeight: 600,
            backdropFilter: 'blur(6px)',
          }}>
            {statusLabel ?? (hasEditedStl ? 'Modificat · salvat local' : null)}
          </span>
        )}
      </div>

      {toolMode === 'section' && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--caval-border)',
          background: 'rgba(14,14,15,0.85)',
          maxWidth: 420,
        }}>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <ToolbarChip
              key={axis}
              label={axis.toUpperCase()}
              active={sectionAxis === axis}
              onClick={() => onSectionAxis(axis)}
            />
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--caval-text-muted)' }}>
            Offset
            <input
              type="range"
              min={-80}
              max={80}
              step={1}
              value={sectionOffset}
              onChange={(e) => onSectionOffset(Number(e.target.value))}
              style={{ width: 120 }}
            />
            <span style={{ color: 'var(--caval-text)', fontWeight: 600, minWidth: 28 }}>
              {sectionOffset}
            </span>
          </label>
        </div>
      )}

      {explodeEnabled && explodeAmount > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'auto',
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--caval-border)',
          background: 'rgba(14,14,15,0.85)',
          maxWidth: 360,
          fontSize: 11,
          color: 'var(--caval-text-muted)',
        }}>
          Explode
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explodeAmount}
            onChange={(e) => onExplodeAmount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: 'var(--caval-text)', fontWeight: 600, minWidth: 36 }}>
            {Math.round(explodeAmount * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
