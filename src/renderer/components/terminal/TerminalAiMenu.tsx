import React from "react";

import {
  isTerminalAiPaletteEnabled,
  TERMINAL_AI_PALETTE,
  type TerminalAiCommand,
  type TerminalAiPaletteEntry,
} from "../../../shared/ai-terminal-contract";

export interface TerminalAiMenuProps {
  hasSelection: boolean;
  hasRecentError: boolean;
  onSelect: (command: TerminalAiCommand) => void;
  onClose?: () => void;
  style?: React.CSSProperties;
  /** Optional position for fixed context menu. */
  position?: { x: number; y: number };
}

export function terminalAiMenuItemDisabled(
  entry: TerminalAiPaletteEntry,
  state: { hasSelection: boolean; hasRecentError: boolean }
): boolean {
  return !isTerminalAiPaletteEnabled(entry, state);
}

/** Shared terminal AI context / palette menu (7c.3). */
export function TerminalAiMenu({
  hasSelection,
  hasRecentError,
  onSelect,
  onClose,
  style,
  position,
}: TerminalAiMenuProps): React.ReactElement {
  const state = { hasSelection, hasRecentError };

  return (
    <div
      role="menu"
      data-testid="terminal-ai-menu"
      style={{
        position: position ? "fixed" : "relative",
        left: position?.x,
        top: position?.y,
        zIndex: 50,
        background: "var(--caval-surface)",
        border: "1px solid var(--caval-border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        padding: 4,
        minWidth: 200,
        ...style,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {TERMINAL_AI_PALETTE.map((entry) => {
        const disabled = terminalAiMenuItemDisabled(entry, state);
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            data-testid={`terminal-ai-menu-${entry.id}`}
            disabled={disabled}
            aria-disabled={disabled}
            title={entry.shortcut}
            onClick={() => {
              if (disabled) return;
              onSelect(entry.id);
              onClose?.();
            }}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              textAlign: "left",
              border: "none",
              background: "transparent",
              color: disabled ? "var(--caval-text-muted)" : "var(--caval-text)",
              opacity: disabled ? 0.45 : 1,
              padding: "6px 10px",
              fontSize: 12,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut ? (
              <span style={{ fontSize: 10, color: "var(--caval-text-muted)" }}>{entry.shortcut}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
