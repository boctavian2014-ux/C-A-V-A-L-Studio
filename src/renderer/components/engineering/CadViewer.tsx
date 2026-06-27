import React, { useCallback, useEffect, useState } from 'react';
import type { StlDimensions } from './cad-viewer-utils';

type ViewerCanvasProps = {
  stlUrl: string;
  wireframe: boolean;
  autoRotate: boolean;
  dimensionsLabel: string | null;
  onDimensions?: (dims: StlDimensions) => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
};

export function CadViewer({ stlUrl }: { stlUrl: string | null }) {
  const [ViewerCanvas, setViewerCanvas] = useState<React.ComponentType<ViewerCanvasProps> | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dimensions, setDimensions] = useState<StlDimensions | null>(null);

  useEffect(() => {
    if (!stlUrl) {
      setViewerCanvas(null);
      setDimensions(null);
      return;
    }
    setDimensions(null);
    let alive = true;
    void import('./CadViewerCanvas.js').then((mod) => {
      if (alive) setViewerCanvas(() => mod.CadViewerCanvas);
    });
    return () => {
      alive = false;
    };
  }, [stlUrl]);

  const handleDimensions = useCallback((dims: StlDimensions) => {
    setDimensions(dims);
  }, []);

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
      }}>
        <div>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.35 }}>◇</div>
          <div style={{ fontWeight: 600, color: 'var(--caval-text)', marginBottom: 6 }}>
            Niciun model 3D
          </div>
          <div style={{ maxWidth: 340, lineHeight: 1.5 }}>
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
        Se încarcă viewer 3D…
      </div>
    );
  }

  return (
    <ViewerCanvas
      stlUrl={stlUrl}
      wireframe={wireframe}
      autoRotate={autoRotate}
      dimensionsLabel={dimensions?.label ?? null}
      onDimensions={handleDimensions}
      onToggleWireframe={() => setWireframe((v) => !v)}
      onToggleAutoRotate={() => setAutoRotate((v) => !v)}
    />
  );
}
