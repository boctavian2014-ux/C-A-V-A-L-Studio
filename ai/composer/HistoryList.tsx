import React, { useEffect, useRef } from "react";

import type { ConversationSummary } from "../../src/shared/ai-history-contract";
import { formatHistoryWhen } from "../../src/shared/ai-history-contract";
import { useTranslation } from "../i18n/useTranslation";

export function HistoryList({
  conversations,
  activeId,
  hasMore,
  loadingMore,
  onSelect,
  onDelete,
  onLoadMore,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root: node.parentElement, rootMargin: "40px", threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, conversations.length]);

  if (conversations.length === 0) {
    return (
      <div style={{ fontSize: 10, color: "var(--caval-text-muted)" }}>
        {t("ai.history.empty")}
      </div>
    );
  }

  return (
    <div
      className="history-list"
      data-testid="ai-history-list-items"
      role="list"
      aria-label={t("ai.history.aria")}
    >
      {conversations.map((c) => {
        const selected = activeId === c.id;
        return (
          <div
            key={c.id}
            role="listitem"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 2,
            }}
          >
            <button
              type="button"
              data-testid="ai-history-item"
              onClick={() => onSelect(c.id)}
              title={`${c.title} · ${c.messageCount} messages`}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                border: "none",
                borderRadius: 4,
                padding: "4px 6px",
                background: selected ? "var(--caval-accent-glow)" : "transparent",
                color: selected ? "var(--caval-accent)" : "var(--caval-text)",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              <div
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: selected ? 600 : 500,
                }}
              >
                {c.title}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--caval-text-muted)" }}>
                {formatHistoryWhen(c.updatedAt)} · {c.messageCount} msg
              </div>
            </button>
            <button
              type="button"
              data-testid="ai-history-delete"
              title={t("ai.history.delete")}
              aria-label={t("ai.history.deleteNamed", { title: c.title })}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
              style={{
                width: 22,
                height: 22,
                border: "none",
                borderRadius: 4,
                background: "transparent",
                color: "var(--caval-text-muted)",
                cursor: "pointer",
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      {hasMore ? (
        <div
          ref={sentinelRef}
          data-testid="ai-history-sentinel"
          className="history-sentinel"
          style={{ height: 8 }}
          aria-hidden="true"
        />
      ) : null}
      {loadingMore ? (
        <div style={{ fontSize: 9.5, color: "var(--caval-text-muted)", padding: "2px 0" }}>
          {t("ai.history.loading")}
        </div>
      ) : null}
    </div>
  );
}
