import React, { useCallback, useEffect, useRef } from "react";

import { FeatureFirstUseTip } from "../ai/FeatureFirstUseTip";
import { useTerminalExplainStore } from "../../store/terminal-explain-store";

/** Ephemeral popover for terminal output explain — does not persist into history.db. */
export function TerminalExplainPopover(): React.ReactElement | null {
  const panel = useTerminalExplainStore((s) => s.panel);
  const clear = useTerminalExplainStore((s) => s.clear);
  const stop = useTerminalExplainStore((s) => s.stop);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel || panel.phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
        clear();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [panel, clear, stop]);

  const onStop = useCallback(() => {
    stop();
  }, [stop]);

  if (!panel || panel.phase === "idle") return null;

  return (
    <div
      ref={rootRef}
      className="terminal-explain-popover"
      role="dialog"
      aria-label="Terminal output explanation"
      data-testid="terminal-explain-popover"
      style={{
        position: "absolute",
        right: 12,
        bottom: 52,
        zIndex: 40,
        width: "min(420px, 92%)",
        maxHeight: "36vh",
        overflow: "auto",
        background: "var(--caval-surface, #0D1117)",
        border: "1px solid var(--caval-border, #30363d)",
        borderRadius: 8,
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        padding: "10px 12px",
        fontFamily: "JetBrains Mono, Consolas, monospace",
        fontSize: 12,
        color: "var(--caval-text, #e6edf3)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Explain output</strong>
        <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 10 }}>
          {panel.terminalId}
        </span>
        {panel.phase === "loading" && (
          <button
            type="button"
            data-testid="terminal-explain-stop"
            onClick={onStop}
            aria-label="Stop"
            style={{
              marginLeft: "auto",
              border: "1px solid var(--caval-border)",
              background: "transparent",
              color: "var(--caval-text-muted)",
              cursor: "pointer",
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            ■ Stop
          </button>
        )}
        {panel.phase !== "loading" && (
          <button
            type="button"
            data-testid="terminal-explain-close"
            onClick={() => clear()}
            aria-label="Close"
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: "var(--caval-text-muted)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        )}
      </div>
      {panel.phase === "loading" && (
        <div role="status" style={{ color: "var(--caval-text-muted)" }}>
          Explaining…
        </div>
      )}
      {panel.phase === "error" && (
        <div role="alert" style={{ color: "#EF4444" }}>
          {panel.error ?? "Explain failed"}
        </div>
      )}
      {panel.phase === "done" && panel.explanation && (
        <div
          className="explanation-content"
          data-testid="terminal-explain-text"
          style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}
        >
          {panel.explanation}
        </div>
      )}
      <FeatureFirstUseTip
        feature="explain"
        active={panel.phase === "loading" || panel.phase === "done"}
      />
    </div>
  );
}
