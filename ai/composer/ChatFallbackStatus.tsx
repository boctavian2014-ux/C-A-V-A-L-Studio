import React, { useEffect, useState } from "react";

import { useTranslation } from "../i18n/useTranslation";
import { findRetryableStoppedTurn, useAIStore } from "./ai-store";
import {
  formatFallbackBadge,
  formatProviderLabel,
  useFallbackStatusStore,
} from "./fallback-status-store";

export function ChatFallbackStatus() {
  const { t } = useTranslation();
  const retryLastTurn = useAIStore((s) => s.retryLastTurn);
  const messages = useAIStore((s) => s.messages);
  const agentMode = useAIStore((s) => s.agentMode);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const {
    activeProvider,
    fallbackFrom,
    agenticBlockedProvider,
    agenticBlockedUntil,
    clearAgenticBlock,
  } = useFallbackStatusStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!agenticBlockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [agenticBlockedUntil]);

  const remainingMs = agenticBlockedUntil ? Math.max(0, agenticBlockedUntil - now) : 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const badge = formatFallbackBadge(fallbackFrom, activeProvider);
  const blocked = agentMode === "agentic" && Boolean(agenticBlockedProvider);
  const stoppedTurn = isStreaming ? null : findRetryableStoppedTurn(messages);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  /** Header Retry is cooldown-only. User Stop is handled on the interrupted bubble. */
  const showRetry = Boolean(blocked && !stoppedTurn);

  if (!activeProvider && !blocked) return null;

  return (
    <div
      className="chat-fallback-status"
      data-testid="chat-fallback-status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginLeft: 10,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {activeProvider ? (
        <span className="chat-fallback-provider" data-testid="chat-active-provider">
          {formatProviderLabel(activeProvider)}
        </span>
      ) : null}
      {badge ? (
        <span className="chat-fallback-badge" data-testid="chat-fallback-badge">
          {badge}
        </span>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="chat-fallback-retry"
          data-testid="chat-agentic-retry"
          disabled={remainingMs > 0 || isStreaming || !lastUser}
          onClick={() => {
            if (remainingMs > 0 || isStreaming || !lastUser) return;
            clearAgenticBlock();
            void retryLastTurn();
          }}
        >
          {remainingMs > 0
            ? t("ai.fallback.retryIn", { seconds: String(remainingSec) })
            : t("ai.fallback.retry")}
        </button>
      ) : null}
    </div>
  );
}
