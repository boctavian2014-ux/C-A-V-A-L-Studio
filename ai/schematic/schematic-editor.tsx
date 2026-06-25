import React, { useEffect } from "react";
import { SchematicToolbar, type SchematicToolbarProps } from "./schematic-toolbar";
import { SchematicCanvas } from "./schematic-canvas";
import { SchematicInspector } from "./schematic-inspector";
import { useSchematicStore } from "./schematic-store";
import type { SchematicGraph } from "./schematic-types";

export interface SchematicEditorProps extends SchematicToolbarProps {
  graph?: SchematicGraph | null;
  workspaceRoot: string;
  error?: string | null;
}

export function SchematicEditor({
  graph,
  workspaceRoot,
  error,
  onGenerateFromCode,
  onGenerateCode,
  onExplain,
  onAnalyze,
  isGenerating,
}: SchematicEditorProps) {
  const issues = useSchematicStore((s) => s.issues);
  const loadGraph = useSchematicStore((s) => s.loadGraph);
  const setWorkspaceRoot = useSchematicStore((s) => s.setWorkspaceRoot);
  const reset = useSchematicStore((s) => s.reset);
  const nodeCount = useSchematicStore((s) => s.nodes.length);

  useEffect(() => {
    setWorkspaceRoot(workspaceRoot);
    if (!graph && nodeCount === 0) {
      reset(workspaceRoot);
    }
  }, [workspaceRoot, setWorkspaceRoot, reset, graph, nodeCount]);

  useEffect(() => {
    if (graph && graph.nodes.length > 0) {
      loadGraph(graph);
    }
  }, [graph, loadGraph]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {error && (
        <div
          style={{
            padding: "8px 14px",
            background: "rgba(239,68,68,0.1)",
            borderBottom: "1px solid rgba(239,68,68,0.25)",
            color: "#ff8080",
            fontSize: 11.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <SchematicToolbar
          onGenerateFromCode={onGenerateFromCode}
          onGenerateCode={onGenerateCode}
          onExplain={onExplain}
          onAnalyze={onAnalyze}
          isGenerating={isGenerating}
          issueCount={issues.length}
        />
        <SchematicCanvas />
        <SchematicInspector />
      </div>

      <style>{`
        .schematic-node--ai-agent {
          animation: schematic-ai-pulse 2s ease-in-out infinite;
        }
        @keyframes schematic-ai-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(198,120,221,0.3); }
          50% { box-shadow: 0 0 18px rgba(198,120,221,0.65); }
        }
        .react-flow__edge-path {
          stroke-linecap: round;
        }
      `}</style>
    </div>
  );
}
