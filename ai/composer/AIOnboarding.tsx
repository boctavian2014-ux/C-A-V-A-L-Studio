import React, { useState } from "react";

export interface OnboardingSuggestion {
  id: string;
  label: string;
  /** When null, suggestion is informational (e.g. explain via hover). */
  prompt: string | null;
  hint?: string;
}

const SUGGESTIONS: OnboardingSuggestion[] = [
  {
    id: "fix",
    label: "Fix a bug",
    prompt: "Fix the errors in my current file",
  },
  {
    id: "explain",
    label: "Explain code",
    prompt: null,
    hint: "Select code in the editor, then use Explain (hover or command).",
  },
  {
    id: "refactor",
    label: "Refactor",
    prompt: "Help me refactor this function",
  },
  {
    id: "preview",
    label: "Preview my app",
    prompt: "Open a preview of my app",
  },
];

export function AIOnboarding({
  onStartChat,
}: {
  onStartChat: (prompt?: string) => void;
}): React.ReactElement {
  const [hint, setHint] = useState<string | null>(null);

  return (
    <div
      className="ai-onboarding"
      data-testid="ai-onboarding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "20px 16px",
        gap: 14,
        color: "var(--caval-text)",
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          What can AI help with?
        </h3>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: "var(--caval-text-muted)",
            lineHeight: 1.45,
          }}
        >
          Chat, quick fix, inline Tab, explain, refactor, and preview — with a
          safe tool set and an activity timeline you can restore from History.
        </p>
      </div>

      <div
        className="ai-onboarding-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="ai-suggestion-card"
            data-testid={`ai-onboarding-suggestion-${s.id}`}
            onClick={() => {
              if (s.prompt) {
                setHint(null);
                onStartChat(s.prompt);
                return;
              }
              setHint(s.hint ?? "Use Explain from the editor selection.");
            }}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--caval-border)",
              background: "var(--caval-surface-raised)",
              color: "var(--caval-text)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {hint && (
        <p
          role="status"
          data-testid="ai-onboarding-hint"
          style={{
            margin: 0,
            fontSize: 11,
            color: "var(--caval-accent)",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      )}

      <details
        className="ai-tools-info"
        data-testid="ai-onboarding-tools"
        style={{
          fontSize: 11,
          color: "var(--caval-text-muted)",
          borderTop: "1px solid var(--caval-border)",
          paddingTop: 10,
        }}
      >
        <summary style={{ cursor: "pointer", color: "var(--caval-text)" }}>
          What tools does AI have access to?
        </summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
          <li>
            <code>get_problems</code> — reads diagnostics, no changes
          </li>
          <li>
            <code>git_status</code> — reads repo state, no commits
          </li>
          <li>
            <code>run_task</code> — runs scripts from package.json only
          </li>
          <li>
            <code>open_preview</code> — opens web/mobile preview
          </li>
        </ul>
        <p style={{ margin: "8px 0 0", lineHeight: 1.45 }}>
          No free terminal access. No commits without your explicit action.
          File edits always go through diff preview and Accept.
        </p>
      </details>
    </div>
  );
}

export { SUGGESTIONS as AI_ONBOARDING_SUGGESTIONS };
