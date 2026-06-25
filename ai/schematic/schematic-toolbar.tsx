import React from "react";
import { useSchematicStore } from "./schematic-store";
import type { SchematicEditorMode, SchematicNodeType, SchematicZoomLevel } from "./schematic-types";
import { NODE_TYPE_LABELS } from "./schematic-types";

const MODES: { id: SchematicEditorMode; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "◎" },
  { id: "connect", label: "Connect", icon: "⟷" },
  { id: "edit", label: "Edit", icon: "✎" },
];

const ZOOM_LEVELS: SchematicZoomLevel[] = ["module", "class", "function"];

const ADD_NODE_TYPES: SchematicNodeType[] = [
  "function",
  "class",
  "module",
  "api_endpoint",
  "state",
  "event",
  "data_structure",
  "ai_agent",
  "external_dependency",
];

export interface SchematicToolbarProps {
  onGenerateFromCode?: () => void;
  onGenerateCode?: () => void;
  onExplain?: () => void;
  onAnalyze?: () => void;
  isGenerating?: boolean;
  issueCount?: number;
}

export function SchematicToolbar({
  onGenerateFromCode,
  onGenerateCode,
  onExplain,
  onAnalyze,
  isGenerating,
  issueCount = 0,
}: SchematicToolbarProps) {
  const mode = useSchematicStore((s) => s.mode);
  const zoomLevel = useSchematicStore((s) => s.zoomLevel);
  const setMode = useSchematicStore((s) => s.setMode);
  const setZoomLevel = useSchematicStore((s) => s.setZoomLevel);
  const addNode = useSchematicStore((s) => s.addNode);
  const deleteSelection = useSchematicStore((s) => s.deleteSelection);
  const autoLayout = useSchematicStore((s) => s.autoLayout);
  const undo = useSchematicStore((s) => s.undo);
  const redo = useSchematicStore((s) => s.redo);
  const canUndo = useSchematicStore((s) => s.canUndo());
  const canRedo = useSchematicStore((s) => s.canRedo());

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${active ? "var(--caval-accent, #00e0ff)" : "var(--caval-border, #2a2f3a)"}`,
    background: active ? "rgba(0,224,255,0.12)" : "var(--caval-bg, #0a0a0b)",
    color: active ? "var(--caval-accent, #00e0ff)" : "var(--caval-text-muted, #8b929a)",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        borderRight: "1px solid var(--caval-border, #2a2f3a)",
        background: "var(--caval-surface, #12151c)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "8px 6px",
        overflowY: "auto",
      }}
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.label}
          style={btnStyle(mode === m.id)}
          onClick={() => setMode(m.id)}
        >
          {m.icon}
        </button>
      ))}

      <div style={{ width: "100%", height: 1, background: "var(--caval-border)", margin: "4px 0" }} />

      {ZOOM_LEVELS.map((z) => (
        <button
          key={z}
          type="button"
          title={`Zoom: ${z}`}
          style={{ ...btnStyle(zoomLevel === z), fontSize: 9, fontWeight: 700 }}
          onClick={() => setZoomLevel(z)}
        >
          {z[0]!.toUpperCase()}
        </button>
      ))}

      <div style={{ width: "100%", height: 1, background: "var(--caval-border)", margin: "4px 0" }} />

      <button type="button" title="Undo" style={btnStyle()} disabled={!canUndo} onClick={undo}>
        ↶
      </button>
      <button type="button" title="Redo" style={btnStyle()} disabled={!canRedo} onClick={redo}>
        ↷
      </button>
      <button type="button" title="Auto-layout" style={btnStyle()} onClick={autoLayout}>
        ⊞
      </button>
      <button type="button" title="Delete" style={btnStyle()} onClick={deleteSelection}>
        ⌫
      </button>

      <div style={{ width: "100%", height: 1, background: "var(--caval-border)", margin: "4px 0" }} />

      <select
        title="Add node"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            addNode(e.target.value as SchematicNodeType);
            e.target.value = "";
          }
        }}
        style={{
          width: 36,
          fontSize: 9,
          background: "var(--caval-bg)",
          color: "var(--caval-text-muted)",
          border: "1px solid var(--caval-border)",
          borderRadius: 6,
        }}
      >
        <option value="">+</option>
        {ADD_NODE_TYPES.map((t) => (
          <option key={t} value={t}>
            {NODE_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <div style={{ width: "100%", height: 1, background: "var(--caval-border)", margin: "4px 0" }} />

      <button
        type="button"
        title="Generate from code"
        style={{ ...btnStyle(), fontSize: 10 }}
        disabled={isGenerating}
        onClick={onGenerateFromCode}
      >
        {isGenerating ? "…" : "C→S"}
      </button>
      <button
        type="button"
        title="Generate code"
        style={{ ...btnStyle(), fontSize: 10 }}
        disabled={isGenerating}
        onClick={onGenerateCode}
      >
        S→C
      </button>
      <button type="button" title="AI Explain" style={{ ...btnStyle(), fontSize: 10 }} onClick={onExplain}>
        ?
      </button>
      <button type="button" title="Analyze" style={{ ...btnStyle(), fontSize: 10 }} onClick={onAnalyze}>
        {issueCount > 0 ? `!${issueCount}` : "A"}
      </button>
    </div>
  );
}
