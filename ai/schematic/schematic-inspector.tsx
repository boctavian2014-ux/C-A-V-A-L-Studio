import React from "react";
import { useSchematicStore } from "./schematic-store";
import { NODE_TYPE_LABELS } from "./schematic-types";

export function SchematicInspector() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const selectedNodeId = useSchematicStore((s) => s.selectedNodeId);
  const selectedEdgeId = useSchematicStore((s) => s.selectedEdgeId);
  const issues = useSchematicStore((s) => s.issues);
  const aiExplanation = useSchematicStore((s) => s.aiExplanation);
  const isDirty = useSchematicStore((s) => s.isDirty);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  const sectionTitle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--caval-text-muted)",
    marginBottom: 8,
  };

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid var(--caval-border, #2a2f3a)",
        background: "var(--caval-surface, #12151c)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--caval-border)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--caval-text)",
        }}
      >
        Inspector
        {isDirty && (
          <span style={{ marginLeft: 8, fontSize: 10, color: "var(--caval-accent)" }}>● unsaved</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }} className="ai-messages-scroll">
        {selectedNode && (
          <>
            <div style={sectionTitle}>Node</div>
            <div style={{ fontSize: 11, color: "var(--caval-accent)", marginBottom: 4 }}>
              {NODE_TYPE_LABELS[selectedNode.data.schematicNode.type]}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--caval-text)", marginBottom: 8 }}>
              {selectedNode.data.schematicNode.title}
            </div>
            {selectedNode.data.schematicNode.description && (
              <p style={{ fontSize: 11, color: "var(--caval-text-muted)", lineHeight: 1.5, margin: "0 0 12px" }}>
                {selectedNode.data.schematicNode.description}
              </p>
            )}
            {selectedNode.data.schematicNode.metadata.sourceFile && (
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "var(--caval-text-muted)" }}>
                {selectedNode.data.schematicNode.metadata.sourceFile}
                {selectedNode.data.schematicNode.metadata.lineRange
                  ? `:${selectedNode.data.schematicNode.metadata.lineRange[0]}`
                  : ""}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={sectionTitle}>Pins</div>
              {selectedNode.data.schematicNode.pins.map((p) => (
                <div key={p.id} style={{ fontSize: 10, color: "var(--caval-text-muted)", marginBottom: 4 }}>
                  {p.direction === "in" ? "→" : "←"} {p.label}
                </div>
              ))}
            </div>
          </>
        )}

        {selectedEdge && !selectedNode && (
          <>
            <div style={sectionTitle}>Connection</div>
            <div style={{ fontSize: 12, color: "var(--caval-text)", marginBottom: 6 }}>
              {selectedEdge.data?.schematicEdge.type ?? "edge"}
            </div>
            <div style={{ fontSize: 11, color: "var(--caval-text-muted)" }}>
              {selectedEdge.source} → {selectedEdge.target}
            </div>
            {selectedEdge.data?.schematicEdge.tooltip && (
              <p style={{ fontSize: 11, marginTop: 8, color: "var(--caval-text-muted)" }}>
                {selectedEdge.data.schematicEdge.tooltip}
              </p>
            )}
          </>
        )}

        {!selectedNode && !selectedEdge && (
          <div style={{ fontSize: 12, color: "var(--caval-text-muted)", lineHeight: 1.5 }}>
            Select a node or connection to inspect details. Use toolbar AI actions for explanations.
          </div>
        )}

        {aiExplanation && (
          <>
            <div style={{ ...sectionTitle, marginTop: 16 }}>AI Explanation</div>
            <p style={{ fontSize: 11, color: "var(--caval-text)", lineHeight: 1.55, margin: 0 }}>
              {aiExplanation}
            </p>
          </>
        )}

        {issues.length > 0 && (
          <>
            <div style={{ ...sectionTitle, marginTop: 16 }}>Issues ({issues.length})</div>
            {issues.map((issue) => (
              <div
                key={issue.id}
                style={{
                  fontSize: 10,
                  padding: "6px 8px",
                  marginBottom: 6,
                  borderRadius: 6,
                  border: `1px solid ${
                    issue.severity === "error"
                      ? "rgba(239,68,68,0.35)"
                      : issue.severity === "warning"
                        ? "rgba(251,191,36,0.35)"
                        : "var(--caval-border)"
                  }`,
                  color:
                    issue.severity === "error"
                      ? "#ff8080"
                      : issue.severity === "warning"
                        ? "#fbbf24"
                        : "var(--caval-text-muted)",
                }}
              >
                {issue.message}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
