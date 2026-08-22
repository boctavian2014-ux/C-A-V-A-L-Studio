import React from "react";

import { CavaloAiMark } from "../../src/renderer/components/brand/CavaloHorseMark";
import { useTranslation } from "../i18n/useTranslation";

export interface OnboardingSuggestion {
  id: string;
  label: string;
  /** When null, suggestion is informational (e.g. explain via hover). */
  prompt: string | null;
  hint?: string;
}

/** Quick-action definitions — consumed by AiPanelToolbar dropdown. */
export const AI_ONBOARDING_SUGGESTIONS: OnboardingSuggestion[] = [
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

export function AIOnboarding(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="ai-onboarding"
      data-testid="ai-onboarding"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "20% 24px 24px",
        gap: 12,
        color: "var(--caval-text)",
        textAlign: "center",
      }}
    >
      <div aria-hidden style={{ opacity: 0.55 }}>
        <CavaloAiMark size={32} />
      </div>
      <p
        data-testid="ai-onboarding-welcome"
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--caval-text-muted)",
          maxWidth: 260,
        }}
      >
        {t("ai.onboarding.welcome")}
      </p>
    </div>
  );
}
