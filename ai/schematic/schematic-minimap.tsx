import React from "react";
import { MiniMap } from "@xyflow/react";
import { NODE_TYPE_COLORS, type SchematicNodeType } from "./schematic-types";

export function SchematicMinimap() {
  return (
    <MiniMap
      style={{
        background: "rgba(10,10,11,0.92)",
        border: "1px solid var(--caval-border, #2a2f3a)",
        borderRadius: 8,
        bottom: 12,
        right: 12,
        width: 140,
        height: 100,
      }}
      nodeColor={(node) => {
        const type = (node.data as { schematicNode?: { type: SchematicNodeType } })?.schematicNode?.type;
        return type ? NODE_TYPE_COLORS[type] : "#00e0ff";
      }}
      maskColor="rgba(0,0,0,0.55)"
      pannable
      zoomable
    />
  );
}
