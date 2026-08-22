import React from "react";

import { useTranslation } from "../../../../ai/i18n/useTranslation";

/** Railway & MCP connection indicator — moved from ActivityBar to StatusBar. */
export function ConnectionStatusIndicator(): React.ReactElement {
  const { t } = useTranslation();
  const label = t("statusBar.connectionUnavailable");
  const tooltip = t("statusBar.connectionUnavailableTooltip");

  return (
    <span
      title={tooltip}
      aria-label={label}
      aria-live="polite"
      data-testid="statusbar-connection-indicator"
      data-connection-state="unknown"
      style={{
        flexShrink: 0,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: "rgba(255, 255, 255, 0.28)",
        boxShadow: "none",
      }}
    />
  );
}
