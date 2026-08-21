import React from "react";

import type { SuggestedCommand } from "../../../shared/ai-terminal-contract";
import { useTerminalSuggestStore } from "../../store/terminal-suggest-store";
import { TerminalAiCard } from "./TerminalAiCard";
import { useTranslation } from "../../../../ai/i18n/useTranslation";

export function SuggestedCommandsCard({
  commands: overrideCommands,
}: {
  commands?: SuggestedCommand[];
}): React.ReactElement | null {
  const { t } = useTranslation();
  const panel = useTerminalSuggestStore((s) => s.panel);
  const insertCommand = useTerminalSuggestStore((s) => s.insertCommand);
  const dismissCommand = useTerminalSuggestStore((s) => s.dismissCommand);
  const clear = useTerminalSuggestStore((s) => s.clear);
  const stop = useTerminalSuggestStore((s) => s.stop);

  const commands = overrideCommands ?? panel?.commands ?? [];
  const phase = overrideCommands ? "done" : panel?.phase;

  if (!phase || phase === "idle") return null;
  if (phase === "done" && commands.length === 0) return null;

  return (
    <TerminalAiCard
      variant="suggest"
      state={phase}
      title={t("terminal.suggestedCommands")}
      onStop={() => stop()}
      onClose={overrideCommands ? undefined : () => clear()}
      className="suggested-commands-card"
      testId="suggested-commands-card"
      stopTestId="terminal-suggest-stop"
      style={{ margin: "6px 8px", boxShadow: "none" }}
    >
      {phase === "loading" && (
        <div role="status" style={{ color: "var(--caval-text-muted)" }}>
          {t("terminal.suggesting")}
        </div>
      )}
      {phase === "error" && (
        <div role="alert" style={{ color: "#EF4444" }}>
          {panel?.error ?? "Suggest failed"}
        </div>
      )}
      {phase === "done" && (
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {commands.map((cmd) => (
            <div
              key={cmd.id}
              className="command-row"
              data-testid="suggested-command-row"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 6,
                alignItems: "start",
              }}
            >
              <div>
                <code
                  className="command-text"
                  style={{
                    display: "block",
                    fontFamily: "JetBrains Mono, Consolas, monospace",
                    fontSize: 11,
                    color: "var(--caval-text)",
                    wordBreak: "break-all",
                  }}
                >
                  {cmd.command}
                </code>
                <span
                  className="command-explanation"
                  style={{ color: "var(--caval-text-muted)", fontSize: 10.5 }}
                >
                  {cmd.explanation}
                </span>
              </div>
              <div className="command-actions" style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  data-testid="suggested-command-insert"
                  onClick={() => void insertCommand(cmd)}
                  className={cmd.requiresConfirmation ? "btn-warning" : "btn-primary"}
                  style={{
                    border: "1px solid var(--caval-border)",
                    background: cmd.requiresConfirmation
                      ? "rgba(239, 68, 68, 0.12)"
                      : "rgba(0, 224, 255, 0.1)",
                    color: "var(--caval-text)",
                    cursor: "pointer",
                    fontSize: 10.5,
                    borderRadius: 4,
                    padding: "3px 8px",
                  }}
                  title={
                    cmd.requiresConfirmation
                      ? "Requires confirmation — inserts into prompt only"
                      : "Insert into terminal prompt (does not run)"
                  }
                >
                  {cmd.requiresConfirmation ? "Insert…" : "Insert"}
                </button>
                <button
                  type="button"
                  data-testid="suggested-command-dismiss"
                  onClick={() => dismissCommand(cmd.id)}
                  className="btn-ghost"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--caval-text-muted)",
                    cursor: "pointer",
                    fontSize: 10.5,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </TerminalAiCard>
  );
}
