import React, { Suspense } from 'react';
import type { SchematicGraph } from '../../../../ai/schematic/schematic-types';
import type { SchematicEditorProps } from '../../../../ai/schematic/schematic-editor';

const SchematicEditor = React.lazy(() =>
  import('../../../../ai/schematic/schematic-editor').then((m) => ({
    default: m.SchematicEditor,
  }))
) as React.LazyExoticComponent<React.ComponentType<SchematicEditorProps>>;

export function SchematicPanel({
  graph,
  workspaceRoot,
  error,
  isGenerating,
  onGenerateFromCode,
  onGenerateCode,
  onExplain,
  onAnalyze,
}: {
  graph: SchematicGraph | null;
  workspaceRoot: string;
  error: string | null;
  isGenerating: boolean;
  onGenerateFromCode: () => void;
  onGenerateCode: () => void;
  onExplain: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {isGenerating && (
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--caval-border)',
            fontSize: 11,
            color: 'var(--caval-accent)',
            fontWeight: 600,
          }}
        >
          ⬤ Schematic AI lucrează…
        </div>
      )}
      <Suspense
        fallback={
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--caval-text-muted)',
              fontSize: 13,
            }}
          >
            Încarc editor schematic…
          </div>
        }
      >
        <SchematicEditor
          graph={graph}
          workspaceRoot={workspaceRoot}
          error={error}
          isGenerating={isGenerating}
          onGenerateFromCode={onGenerateFromCode}
          onGenerateCode={onGenerateCode}
          onExplain={onExplain}
          onAnalyze={onAnalyze}
        />
      </Suspense>
    </div>
  );
}
