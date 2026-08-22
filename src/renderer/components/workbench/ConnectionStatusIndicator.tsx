import React from "react";

import { useTranslation } from "../../../../ai/i18n/useTranslation";

/** Railway & MCP connection indicator — moved from ActivityBar to StatusBar. */
export function ConnectionStatusIndicator(): React.ReactElement {
  const { t } = useTranslation();
  const connected = true;

  return (
    <span
      className="glass-status-dot glow-emerald"
      title={t("statusBar.connectionTooltip")}
      aria-label={connected ? t("statusBar.connected") : t("statusBar.disconnected")}
      aria-live="polite"
      data-testid="statusbar-connection-indicator"
      style={{ flexShrink: 0 }}
    />
  );
}
