import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { SchematicEdge } from "./schematic-types";
import { useSchematicStore } from "./schematic-store";

export type SchematicEdgeData = {
  schematicEdge: SchematicEdge;
};

export function SchematicConnection({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
}: EdgeProps & { data?: SchematicEdgeData }) {
  const activeEdgeIds = useSchematicStore((s) => s.activeEdgeIds);
  const edge = data?.schematicEdge;
  const isActive = activeEdgeIds.has(id);
  const isAiReasoning = edge?.type === "ai_reasoning";
  const strokeWidth = edge?.weight ?? 1.5;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const stroke = isActive || edge?.glow ? "#00e0ff" : "#4a5568";
  const filter = isActive || edge?.glow ? "drop-shadow(0 0 4px rgba(0,224,255,0.8))" : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: isAiReasoning ? "6 4" : undefined,
          filter,
        }}
        markerEnd="url(#schematic-arrow)"
      />
      {(label || edge?.tooltip) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 9,
              color: "var(--caval-text-muted, #8b929a)",
              background: "rgba(10,10,11,0.85)",
              padding: "2px 6px",
              borderRadius: 4,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
            title={edge?.tooltip}
          >
            {String(label ?? edge?.tooltip ?? "")}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
