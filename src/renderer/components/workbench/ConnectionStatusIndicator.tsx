import React, { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "../../../../ai/i18n/useTranslation";
import type { MessageKey } from "../../../../ai/i18n/locales/en";
import {
  DEFAULT_CONNECTION_HEALTH,
  type ConnectionHealthSnapshot,
  type ConnectionHealthState,
} from "../../../shared/connection-health-contract";
import { useEditorStore } from "../../store/editor-store";

const POLL_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 90_000;

const DOT_COLOR: Record<ConnectionHealthState, string> = {
  unknown: "rgba(255, 255, 255, 0.28)",
  healthy: "var(--caval-success, #3dd68c)",
  degraded: "var(--caval-warning, #e6b450)",
  unavailable: "var(--caval-danger, #f07178)",
};

const LABEL_KEY: Record<ConnectionHealthState, MessageKey> = {
  unknown: "statusBar.connectionUnavailable",
  healthy: "statusBar.connectionHealthy",
  degraded: "statusBar.connectionDegraded",
  unavailable: "statusBar.connectionHealthUnavailable",
};

const TOOLTIP_KEY: Record<ConnectionHealthState, MessageKey> = {
  unknown: "statusBar.connectionUnavailableTooltip",
  healthy: "statusBar.connectionHealthyTooltip",
  degraded: "statusBar.connectionDegradedTooltip",
  unavailable: "statusBar.connectionHealthUnavailableTooltip",
};

function readConnectionHealth(): Promise<ConnectionHealthSnapshot> | undefined {
  const caval = (
    window as unknown as {
      caval?: { connectionHealth?: () => Promise<ConnectionHealthSnapshot> };
    }
  ).caval;
  return caval?.connectionHealth?.();
}

function stateAfterPollFailure(previous: ConnectionHealthState): ConnectionHealthState {
  if (previous === "healthy" || previous === "degraded") {
    return "unavailable";
  }
  return previous;
}

/** Railway & MCP connection indicator — moved from ActivityBar to StatusBar. */
export function ConnectionStatusIndicator(): React.ReactElement {
  const { t } = useTranslation();
  const projectPath = useEditorStore((s) => s.projectPath);
  const [state, setState] = useState<ConnectionHealthState>(DEFAULT_CONNECTION_HEALTH.overall);
  const stateRef = useRef(state);
  const inFlightRef = useRef(false);
  const lastSuccessAtRef = useRef<number | null>(null);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    const lastSuccessAt = lastSuccessAtRef.current;
    if (lastSuccessAt !== null && Date.now() - lastSuccessAt > STALE_AFTER_MS) {
      setState("unknown");
      stateRef.current = "unknown";
    }
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    try {
      const pending = readConnectionHealth();
      if (!pending) {
        setState(stateAfterPollFailure(stateRef.current));
        return;
      }
      const snapshot = await pending;
      lastSuccessAtRef.current = Date.now();
      setState(snapshot.overall);
    } catch {
      setState(stateAfterPollFailure(stateRef.current));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh, projectPath]);

  const label = t(LABEL_KEY[state]);
  const tooltip = t(TOOLTIP_KEY[state]);

  return (
    <span
      title={tooltip}
      aria-label={label}
      aria-live="polite"
      data-testid="statusbar-connection-indicator"
      data-connection-state={state}
      style={{
        flexShrink: 0,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: DOT_COLOR[state],
        boxShadow: "none",
      }}
    />
  );
}
