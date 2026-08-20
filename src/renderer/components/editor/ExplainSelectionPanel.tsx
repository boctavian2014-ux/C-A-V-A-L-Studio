import React from "react";

import { useExplainPanelStore } from "../../store/explain-panel-store";
import { FeatureFirstUseTip } from "../ai/FeatureFirstUseTip";

/** Ephemeral inline panel for selection explain — does not persist into the model. */
export function ExplainSelectionPanel(): React.ReactElement | null {
  const panel = useExplainPanelStore((s) => s.panel);
  const clear = useExplainPanelStore((s) => s.clear);

  if (!panel || panel.phase === "idle") return null;

  return (
    <div
      role="dialog"
      aria-label="AI explain"
      data-testid="explain-selection-panel"
      style={{
        position: "fixed",
        right: 24,
        bottom: 88,
        zIndex: 1100,
        width: "min(420px, 92vw)",
        maxHeight: "40vh",
        overflow: "auto",
        background: "#0D1117",
        border: "1px solid var(--caval-border, #30363d)",
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        padding: "12px 14px",
        fontFamily: "JetBrains Mono, Consolas, monospace",
        fontSize: 12,
        color: "var(--caval-text, #e6edf3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>AI Explain</strong>
        <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 10 }}>
          {panel.filePath}
        </span>
        <button
          type="button"
          data-testid="explain-panel-close"
          onClick={() => clear()}
          style={{
            marginLeft: "auto",
            border: "none",
            background: "transparent",
            color: "var(--caval-text-muted, #8b949e)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>
      {panel.phase === "loading" && (
        <div role="status" style={{ color: "var(--caval-text-muted, #8b949e)" }}>
          Explaining selection…
        </div>
      )}
      {panel.phase === "error" && (
        <div role="alert" style={{ color: "#EF4444" }}>
          {panel.error ?? "Explain failed"}
        </div>
      )}
      {panel.phase === "ready" && panel.explanation && (
        <div data-testid="explain-panel-text" style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
          {panel.explanation}
        </div>
      )}
      <FeatureFirstUseTip
        feature="explain"
        active={panel.phase === "loading" || panel.phase === "ready"}
      />
    </div>
  );
}
