import React from "react";
import type { PendingProductResearch } from "../research/types";
import { useTranslation } from "../i18n/useTranslation";

export function ProductResearchCard({
  pending,
  onBuild,
  onSaveBrief,
}: {
  pending: PendingProductResearch;
  onBuild: () => void;
  onSaveBrief?: () => void;
}) {
  const { t } = useTranslation();
  const { brief, intent } = pending;
  const unavailable =
    brief.researchStatus === "unavailable" ||
    brief.researchStatus === "timeout" ||
    brief.researchStatus === "empty";

  return (
    <section
      data-testid="product-research-card"
      aria-label={t("ai.research.cardAria")}
      style={{
        marginTop: 8,
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--caval-border, rgba(255,255,255,0.1))",
        background: "rgba(255,255,255,0.03)",
        fontSize: 12,
        lineHeight: 1.45,
        color: "var(--caval-text, #f5f7fa)",
      }}
    >
      <div style={{ fontWeight: 650, marginBottom: 6 }}>{t("ai.research.understood")}</div>
      <div data-testid="product-research-type">
        {t("ai.research.type")}: {brief.productType}
        {intent.secondaryCategory ? ` / ${intent.secondaryCategory}` : ""}
      </div>
      <div>
        {t("ai.research.goal")}: {brief.primaryGoal}
      </div>
      <div>
        {t("ai.research.style")}: {brief.visualDirection.style}
      </div>
      <div style={{ marginTop: 6 }}>
        {t("ai.research.patterns")}:
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {brief.patterns.map((pattern) => (
            <li key={pattern.id}>{pattern.name}</li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: 6 }}>
        {t("ai.research.buildPlan")}
        <ol style={{ margin: "4px 0 0 16px", padding: 0 }}>
          {brief.buildPlan.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      {unavailable ? (
        <div data-testid="product-research-unavailable" style={{ marginTop: 6, opacity: 0.8 }}>
          {t("ai.research.unavailable")}
        </div>
      ) : null}
      {brief.references.length > 0 ? (
        <details style={{ marginTop: 8 }}>
          <summary>{t("ai.research.inspiration", { count: brief.references.length })}</summary>
          <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
            {brief.references.map((ref) => (
              <li key={ref.url}>
                <a href={ref.url} target="_blank" rel="noreferrer">
                  {ref.title}
                </a>
                <div style={{ opacity: 0.75 }}>{ref.takeaway}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {brief.clarifyingQuestion ? (
        <p data-testid="product-research-question" style={{ margin: "8px 0 0" }}>
          {brief.clarifyingQuestion}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="product-research-build"
          onClick={onBuild}
          style={{
            border: "1px solid rgba(0,224,255,0.4)",
            background: "rgba(0,224,255,0.12)",
            color: "var(--caval-accent, #00e0ff)",
            borderRadius: 4,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("ai.research.build")}
        </button>
        {onSaveBrief ? (
          <button
            type="button"
            data-testid="product-research-save"
            onClick={onSaveBrief}
            style={{
              border: "1px solid var(--caval-border, rgba(255,255,255,0.16))",
              background: "transparent",
              color: "var(--caval-text-muted, #8a95a6)",
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("ai.research.saveBrief")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
