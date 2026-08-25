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
    <div data-testid="ai-message-details" className="ai-message-details">
      <button
        type="button"
        data-testid="ai-message-details-toggle"
        className="ai-message-details-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? "▾" : "›"}</span>
        <span>{open ? t("ai.details.hide") : t("ai.details.show")}</span>
      </button>
      {open ? (
        <div data-testid="ai-message-details-body" className="ai-message-details-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}
