import React from "react";
import { useTranslation } from "../i18n/useTranslation";

/** Shared copy for AI tool access info (toolbar popover). */
export function AiToolsInfoContent(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div data-testid="ai-tools-info-content" style={{ fontSize: 11, lineHeight: 1.55, color: "var(--caval-text-muted)" }}>
      <p style={{ margin: "0 0 8px", color: "var(--caval-text)", fontWeight: 500 }}>
        {t("ai.toolbar.toolsInfo")}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
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
      <p style={{ margin: "8px 0 0" }}>
        No free terminal access. No commits without your explicit action. File edits always go through diff preview and Accept.
      </p>
    </div>
  );
}
