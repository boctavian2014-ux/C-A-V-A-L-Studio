import React from "react";

export type TerminalAiCardVariant = "explain" | "suggest";
export type TerminalAiCardState = "idle" | "loading" | "done" | "error";

export interface TerminalAiCardProps {
  variant: TerminalAiCardVariant;
  state: TerminalAiCardState;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onStop?: () => void;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
  stopTestId?: string;
  closeTestId?: string;
}

const TITLES: Record<TerminalAiCardVariant, string> = {
  explain: "Explain",
  suggest: "Suggest",
};

/** Shared chrome for terminal explain popover + suggest card (7c.3). */
export function TerminalAiCard({
  variant,
  state,
  title,
  subtitle,
  children,
  onStop,
  onClose,
  className,
  style,
  testId,
  stopTestId,
  closeTestId,
}: TerminalAiCardProps): React.ReactElement {
  return (
    <div
      className={["terminal-ai-card", `terminal-ai-card--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label={title ?? TITLES[variant]}
      data-testid={testId ?? `terminal-ai-card-${variant}`}
      data-state={state}
      style={{
        background: "var(--caval-surface, #0D1117)",
        border: "1px solid var(--caval-border, #30363d)",
        borderRadius: 8,
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        padding: "10px 12px",
        fontFamily: "JetBrains Mono, Consolas, monospace",
        fontSize: 12,
        color: "var(--caval-text, #e6edf3)",
        ...style,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="terminal-ai-card-header"
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
      >
        <strong style={{ fontSize: 12 }}>{title ?? TITLES[variant]}</strong>
        {subtitle ? (
          <span style={{ color: "var(--caval-text-muted, #8b949e)", fontSize: 10 }}>{subtitle}</span>
        ) : null}
        {state === "loading" && onStop ? (
          <button
            type="button"
            data-testid={stopTestId ?? `terminal-ai-${variant}-stop`}
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
        ) : null}
        {state !== "loading" && onClose ? (
          <button
            type="button"
            data-testid={closeTestId ?? `terminal-ai-${variant}-close`}
            onClick={onClose}
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
        ) : null}
      </div>
      <div className="terminal-ai-card-body">{children}</div>
    </div>
  );
}
