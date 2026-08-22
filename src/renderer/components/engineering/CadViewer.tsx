import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StlDimensions } from './cad-viewer-utils';
import type {
  CadCameraPreset,
  CadGizmoMode,
  CadSectionAxis,
  CadToolMode,
} from './cad-viewer-tools';
import type { CadBatchViewerPart, CadViewerCanvasHandle } from './CadViewerCanvas';
import { CavalStudioHero } from '../brand/CavaloHorseMark';
import { useTranslation } from '../../../../ai/i18n/useTranslation';

type ViewerCanvasProps = {
  stlUrl: string;
  batchParts: CadBatchViewerPart[];
  wireframe: boolean;
  autoRotate: boolean;
  showGrid: boolean;
  toolMode: CadToolMode;
  gizmoMode: CadGizmoMode;
  sectionAxis: CadSectionAxis;
  sectionOffset: number;
  explodeAmount: number;
  dirty: boolean;
  hasEditedStl: boolean;
  dimensionsLabel: string | null;
  statusLabel: string | null;
  onDimensions?: (dims: StlDimensions) => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleGrid: () => void;
  onSetToolMode: (mode: CadToolMode) => void;
  onSetGizmoMode: (mode: CadGizmoMode) => void;
  onSectionAxis: (axis: CadSectionAxis) => void;
  onSectionOffset: (offset: number) => void;
  onExplodeAmount: (amount: number) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaveEdits: () => void;
  onExportPng: () => void;
  onCameraPreset: (preset: CadCameraPreset) => void;
  onResetTransform: () => void;
  onMeasureLabel: (label: string | null) => void;
};

export function CadViewer({
  stlUrl,
  batchParts = [],
  hasEditedStl = false,
  onSaveEditedStl,
  onEditDirtyChange,
}: {
  stlUrl: string | null;
  batchParts?: CadBatchViewerPart[];
  hasEditedStl?: boolean;
  onSaveEditedStl?: (base64: string) => void;
  onEditDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const [ViewerCanvas, setViewerCanvas] = useState<
    React.ForwardRefExoticComponent<
      ViewerCanvasProps & React.RefAttributes<CadViewerCanvasHandle>
    > | null
  >(null);
  const canvasRef = useRef<CadViewerCanvasHandle | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [toolMode, setToolMode] = useState<CadToolMode>('idle');
  const [gizmoMode, setGizmoMode] = useState<CadGizmoMode>('translate');
  const [sectionAxis, setSectionAxis] = useState<CadSectionAxis>('y');
  const [sectionOffset, setSectionOffset] = useState(0);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [dimensions, setDimensions] = useState<StlDimensions | null>(null);
  const [measureLabel, setMeasureLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!stlUrl) {
      setViewerCanvas(null);
      setDimensions(null);
      setDirty(false);
      return;
    }
    let alive = true;
    void import('./CadViewerCanvas.js').then((mod) => {
      if (alive) setViewerCanvas(() => mod.CadViewerCanvas);
    });
    return () => {
      alive = false;
    };
  }, [Boolean(stlUrl)]);

  useEffect(() => {
    if (!stlUrl) return;
    setDimensions(null);
    setDirty(false);
    setExplodeAmount(0);
    setToolMode('idle');
    setMeasureLabel(null);
  }, [stlUrl]);

  useEffect(() => {
    onEditDirtyChange?.(dirty);
  }, [dirty, onEditDirtyChange]);

  useEffect(() => {
    if (toolMode === 'measure' || toolMode === 'gizmo') {
      setAutoRotate(false);
    }
  }, [toolMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setToolMode('idle');
        setMeasureLabel(null);
      } else if (e.key === '1') {
        canvasRef.current?.setCameraPreset('fit');
      } else if (e.key === 'f' || e.key === 'F') {
        canvasRef.current?.setCameraPreset('front');
      } else if (e.key === 't' || e.key === 'T') {
        canvasRef.current?.setCameraPreset('top');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleDimensions = useCallback((dims: StlDimensions) => {
    setDimensions(dims);
  }, []);

  const handleDirty = useCallback((next: boolean) => {
    setDirty(next);
  }, []);

  const handleSaveEdits = useCallback(() => {
    const base64 = canvasRef.current?.bakeEditedStlBase64();
    if (!base64) return;
    onSaveEditedStl?.(base64);
    canvasRef.current?.resetTransform();
    setDirty(false);
  }, [onSaveEditedStl]);

  const handleExportPng = useCallback(() => {
    const dataUrl = canvasRef.current?.capturePngDataUrl();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'cad-preview.png';
    a.click();
  }, []);

  const statusLabel = useMemo(() => {
    if (measureLabel) return measureLabel;
    if (toolMode === 'section') return `Secțiune ${sectionAxis.toUpperCase()} · ${sectionOffset}`;
    if (explodeAmount > 0) return `Explode ${Math.round(explodeAmount * 100)}%`;
    if (dirty) return 'Modificat · nesalvat';
    if (hasEditedStl) return 'Modificat · salvat local';
    return null;
  }, [measureLabel, toolMode, sectionAxis, sectionOffset, explodeAmount, dirty, hasEditedStl]);

  if (!stlUrl) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--caval-text-muted)',
        fontSize: 13,
        textAlign: 'center',
        padding: 24,
        background: '#0D1117',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <CavalStudioHero size={268} />
          <div style={{ fontWeight: 600, color: 'var(--caval-text)', letterSpacing: '0.08em', fontSize: 12 }}>
            ROBOTICS AI ENGINE
          </div>
          <div style={{ maxWidth: 360, lineHeight: 1.55 }}>
            Flux: plan hardware → schematic → o piesă concretă (ex: cadru 5 inch, suport motor).
            Nu genera „dronă completă” ca un singur STL.
          </div>
        </div>
      </div>
    );
  }

  if (!ViewerCanvas) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        minHeight: 280,
        display: 'grid',
        placeItems: 'center',
        background: '#0a0a0b',
        color: 'var(--caval-text-muted)',
        fontSize: 12,
      }}>
        {t('robotics.loadingViewer')}
      </div>
    );
  }

  return (
    <ViewerCanvas
      ref={canvasRef}
      stlUrl={stlUrl}
      batchParts={batchParts}
      wireframe={wireframe}
      autoRotate={autoRotate}
      showGrid={showGrid}
      toolMode={toolMode}
      gizmoMode={gizmoMode}
      sectionAxis={sectionAxis}
      sectionOffset={sectionOffset}
      explodeAmount={explodeAmount}
      dirty={dirty}
      hasEditedStl={hasEditedStl}
      dimensionsLabel={dimensions?.label ?? null}
      statusLabel={statusLabel}
      onDimensions={handleDimensions}
      onToggleWireframe={() => setWireframe((v) => !v)}
      onToggleAutoRotate={() => setAutoRotate((v) => !v)}
      onToggleGrid={() => setShowGrid((v) => !v)}
      onSetToolMode={setToolMode}
      onSetGizmoMode={setGizmoMode}
      onSectionAxis={setSectionAxis}
      onSectionOffset={setSectionOffset}
      onExplodeAmount={setExplodeAmount}
      onDirtyChange={handleDirty}
      onSaveEdits={handleSaveEdits}
      onExportPng={handleExportPng}
      onCameraPreset={() => {}}
      onResetTransform={() => setDirty(false)}
      onMeasureLabel={setMeasureLabel}
    />
  );
}
