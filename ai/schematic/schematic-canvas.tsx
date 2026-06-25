import React, { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SchematicNodeView } from "./schematic-node";
import { SchematicConnection } from "./schematic-connection";
import { SchematicMinimap } from "./schematic-minimap";
import { useSchematicStore } from "./schematic-store";

const nodeTypes = { schematicNode: SchematicNodeView };
const edgeTypes = { schematicEdge: SchematicConnection };

function SchematicCanvasInner() {
  const nodes = useSchematicStore((s) => s.nodes);
  const edges = useSchematicStore((s) => s.edges);
  const mode = useSchematicStore((s) => s.mode);
  const onNodesChange = useSchematicStore((s) => s.onNodesChange);
  const onEdgesChange = useSchematicStore((s) => s.onEdgesChange);
  const onConnect = useSchematicStore((s) => s.onConnect);
  const selectNode = useSchematicStore((s) => s.selectNode);
  const selectEdge = useSchematicStore((s) => s.selectEdge);
  const deleteSelection = useSchematicStore((s) => s.deleteSelection);
  const activeEdgeIds = useSchematicStore((s) => s.activeEdgeIds);

  const { fitView } = useReactFlow();

  const displayEdges = edges.map((e) => ({
    ...e,
    animated: activeEdgeIds.has(e.id) || e.animated,
    data: {
      ...e.data,
      schematicEdge: {
        ...e.data!.schematicEdge,
        glow: activeEdgeIds.has(e.id) || e.data!.schematicEdge.glow,
      },
    },
  }));

  const onNodeClick: NodeMouseHandler = useCallback(
    (_evt, node) => selectNode(node.id),
    [selectNode]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_evt, edge) => selectEdge(edge.id),
    [selectEdge]
  );

  useEffect(() => {
    if (nodes.length > 0) {
      void fitView({ padding: 0.2, duration: 300 });
    }
  }, [nodes.length, fitView]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
        deleteSelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useSchematicStore.getState().undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        useSchematicStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelection]);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", background: "#0a0a0b" }}>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <marker
            id="schematic-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L6,3 L0,6" fill="#4a5568" />
          </marker>
        </defs>
      </svg>

      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={mode === "connect" ? onConnect : undefined}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={mode !== "connect"}
        nodesConnectable={mode === "connect"}
        elementsSelectable
        panOnDrag={mode === "select"}
        style={{ background: "#0a0a0b" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e2430" />
        <Controls
          style={{
            background: "var(--caval-surface)",
            border: "1px solid var(--caval-border)",
            borderRadius: 8,
          }}
        />
        <SchematicMinimap />
      </ReactFlow>
    </div>
  );
}

export function SchematicCanvas() {
  return (
    <ReactFlowProvider>
      <SchematicCanvasInner />
    </ReactFlowProvider>
  );
}
