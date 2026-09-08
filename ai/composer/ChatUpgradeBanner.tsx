import React from "react";

import { useTranslation } from "../i18n/useTranslation";
import type { MessageKey } from "../i18n/locales/en";
import {
  useEntitlementStatusStore,
  type PlanId,
} from "./entitlement-status-store";

function reasonLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  reason: string
): string {
  const key = `ai.entitlement.reason.${reason}` as MessageKey;
  const translated = t(key);
  return translated === key ? t("ai.entitlement.reason.generic") : translated;
}

export function ChatUpgradeBanner() {
  const { t } = useTranslation();
  const notice = useEntitlementStatusStore((s) => s.notice);
  const clearNotice = useEntitlementStatusStore((s) => s.clearNotice);

  if (!notice) return null;

  const resetsLabel = (() => {
    try {
      return new Date(notice.resetsAt).toLocaleString();
    } catch {
      return notice.resetsAt;
    }
  })();

  const required = notice.requiredPlan as PlanId;
  const canUpgrade = required === "pro" || required === "ultra";

  const onUpgrade = () => {
    if (!canUpgrade) return;
    void window.caval?.subscriptionsOpenUpgrade?.({ plan: required }).then((res) => {
      if (!res?.ok) return;
    });
  };

  return (
    <div
      className="chat-upgrade-banner"
      data-testid="chat-upgrade-banner"
      role="status"
      style={{
        margin: "8px 12px 0",
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid rgba(245, 158, 11, 0.35)",
        background: "rgba(245, 158, 11, 0.08)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 12,
        lineHeight: 1.45,
        color: "var(--caval-text)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }} data-testid="chat-upgrade-title">
            {t("ai.entitlement.title")}
          </div>
          <div data-testid="chat-upgrade-message">
            {notice.message?.trim() || reasonLabel(t, notice.reason)}
          </div>
          <div
            style={{ marginTop: 4, color: "var(--caval-text-muted)", fontSize: 11.5 }}
            data-testid="chat-upgrade-meta"
          >
            {t("ai.entitlement.planLine", {
              current: notice.currentPlan,
              required: notice.requiredPlan,
            })}
            {" · "}
            {t("ai.entitlement.resetsAt", { date: resetsLabel })}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("ai.entitlement.dismiss")}
          onClick={() => clearNotice()}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--caval-text-muted)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ×
        </button>
      </div>
      {canUpgrade && (
        <div>
          <button
            type="button"
            data-testid="chat-upgrade-cta"
            onClick={onUpgrade}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid rgba(245, 158, 11, 0.5)",
              background: "rgba(245, 158, 11, 0.16)",
              color: "var(--caval-text)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {required === "ultra"
              ? t("settings.subscription.upgradeUltra")
              : t("settings.subscription.upgradePro")}
          </button>
        </div>
      )}
    </div>
  );
}
