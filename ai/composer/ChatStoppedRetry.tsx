import React from "react";

import { useTranslation } from "../i18n/useTranslation";
import { findRetryableStoppedTurn, useAIStore } from "./ai-store";
import { useFallbackStatusStore } from "./fallback-status-store";

/** Native Retry on the interrupted assistant turn — not in the panel header. */
export function ChatStoppedRetry({ messageId }: { messageId: string }) {
  const { t } = useTranslation();
  const retryLastTurn = useAIStore((s) => s.retryLastTurn);
  const messages = useAIStore((s) => s.messages);
  const isStreaming = useAIStore((s) => s.isStreaming);
  const clearAgenticBlock = useFallbackStatusStore((s) => s.clearAgenticBlock);
  const turn = isStreaming ? null : findRetryableStoppedTurn(messages);
  if (!turn || turn.assistant.id !== messageId) return null;

  return (
    <button
      type="button"
      className="chat-fallback-retry"
      data-testid="chat-agentic-retry"
      onClick={() => {
        clearAgenticBlock();
        void retryLastTurn();
      }}
    >
      {t("ai.fallback.retry")}
    </button>
  );
}
