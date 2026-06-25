import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SchematicNode } from "./schematic-types";
import { NODE_TYPE_LABELS } from "./schematic-types";

export type SchematicNodeData = {
  schematicNode: SchematicNode;
};

function SchematicNodeComponent({ data, selected }: NodeProps & { data: SchematicNodeData }) {
  const node = data.schematicNode;
  const inPins = node.pins.filter((p) => p.direction === "in");
  const outPins = node.pins.filter((p) => p.direction === "out");
  const isAiAgent = node.type === "ai_agent";

  return (
    <div
      className={isAiAgent ? "schematic-node schematic-node--ai-agent" : "schematic-node"}
      style={{
        minWidth: 180,
        maxWidth: 240,
        borderRadius: 999,
        border: `1px solid ${selected ? "var(--pt-cyan, #00e0ff)" : "var(--caval-border, #2a2f3a)"}`,
        background: "var(--caval-surface, #12151c)",
        boxShadow: selected
          ? "0 0 16px rgba(0,224,255,0.35)"
          : "0 2px 8px rgba(0,0,0,0.35)",
        padding: "10px 14px 10px 12px",
        position: "relative",
        borderLeft: `4px solid ${node.color}`,
      }}
    >
      {inPins.map((pin, i) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="target"
          position={Position.Left}
          style={{
            top: `${((i + 1) / (inPins.length + 1)) * 100}%`,
            background: node.color,
            width: 8,
            height: 8,
            border: "2px solid #0a0a0b",
          }}
          title={pin.label}
        />
      ))}

      <div style={{ fontSize: 10, color: node.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {NODE_TYPE_LABELS[node.type]}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--caval-text, #e8eaed)", marginTop: 2 }}>
        {node.title}
      </div>
      {node.description && (
        <div style={{ fontSize: 10, color: "var(--caval-text-muted, #8b929a)", marginTop: 4, lineHeight: 1.35 }}>
          {node.description.slice(0, 80)}
          {node.description.length > 80 ? "…" : ""}
        </div>
      )}

      {outPins.map((pin, i) => (
        <Handle
          key={pin.id}
          id={pin.id}
          type="source"
          position={Position.Right}
          style={{
            top: `${((i + 1) / (outPins.length + 1)) * 100}%`,
            background: node.color,
            width: 8,
            height: 8,
            border: "2px solid #0a0a0b",
          }}
          title={pin.label}
        />
      ))}
    </div>
  );
}

export const SchematicNodeView = memo(SchematicNodeComponent);
