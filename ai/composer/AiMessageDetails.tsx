import React, { useState } from "react";

import { useTranslation } from "../i18n/useTranslation";

export interface AiMessageDetailsProps {
  /** When false, nothing is rendered (no empty accordion). */
  hasContent: boolean;
  children: React.ReactNode;
}

/** Collapsed-by-default panel for pipeline / timeline / review technical noise. */
export function AiMessageDetails({ hasContent, children }: AiMessageDetailsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!hasContent) return null;

  return (
    <div
      data-testid="ai-message-details"
      style={{ marginTop: 8 }}
    >
      <button
        type="button"
        data-testid="ai-message-details-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 0",
          border: "none",
          background: "none",
          color: "var(--caval-text-muted)",
          fontSize: 10.5,
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span>{open ? t("ai.details.hide") : t("ai.details.show")}</span>
      </button>
      {open ? (
        <div
          data-testid="ai-message-details-body"
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: "1px solid var(--caval-border)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
