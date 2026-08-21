import React, { useCallback, useEffect, useRef } from "react";

import { FeatureFirstUseTip } from "../ai/FeatureFirstUseTip";
import { useTerminalExplainStore } from "../../store/terminal-explain-store";
import { TerminalAiCard } from "./TerminalAiCard";
import { useTranslation } from "../../../../ai/i18n/useTranslation";

/** Ephemeral popover for terminal output explain — does not persist into history.db. */
export function TerminalExplainPopover(): React.ReactElement | null {
  const { t } = useTranslation();
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
      style={{
        position: "absolute",
        right: 12,
        bottom: 52,
        zIndex: 40,
        width: "min(420px, 92%)",
        maxHeight: "36vh",
        overflow: "auto",
      }}
    >
      <TerminalAiCard
        variant="explain"
        state={panel.phase}
        title={t("terminal.explainOutput")}
        subtitle={panel.terminalId}
        onStop={onStop}
        onClose={() => clear()}
        testId="terminal-explain-popover"
        stopTestId="terminal-explain-stop"
        closeTestId="terminal-explain-close"
      >
        {panel.phase === "loading" && (
          <div role="status" style={{ color: "var(--caval-text-muted)" }}>
            {t("terminal.explaining")}
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
      </TerminalAiCard>
    </div>
  );
}
