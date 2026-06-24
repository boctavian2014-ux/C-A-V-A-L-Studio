import { useEffect, useState } from "react";
import { Badge } from "../../ui-kit/components/badge";
import { Button } from "../../ui-kit/components/button";
import { Panel } from "../../ui-kit/components/panel";
import type { SuggestionAlternative, SuggestionRisk, SuggestionsBundle, SymbolImpact } from "./types";

export interface SuggestionsPanelProps {
  bundle: SuggestionsBundle | null;
  onApprove?: (alternativeId: string) => void;
  onReject?: () => void;
  onProceed?: () => void;
  onSelectAlternative?: (alternativeId: string) => void;
}

const riskLevelVariant = (level: SuggestionRisk["level"]) => {
  if (level === "critical" || level === "high") return "error" as const;
  if (level === "medium") return "warning" as const;
  return "info" as const;
};

const Section = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => (
  <details className="caval-suggestions__section" open={defaultOpen}>
    <summary>{title}</summary>
    <div className="caval-suggestions__section-body">{children}</div>
  </details>
);

const SymbolRow = ({ impact }: { impact: SymbolImpact }) => (
  <div className="caval-suggestions__symbol">
    <code>{impact.symbol}</code>
    <span className="caval-suggestions__symbol-action">{impact.action}</span>
    <small>{impact.file}</small>
    <p>{impact.description}</p>
  </div>
);

const AlternativeCard = ({
  alternative,
  selected,
  onSelect
}: {
  alternative: SuggestionAlternative;
  selected: boolean;
  onSelect?: () => void;
}) => (
  <button
    type="button"
    className={`caval-suggestions__alternative ${selected ? "is-selected" : ""}`}
    onClick={onSelect}
  >
    <div className="caval-suggestions__alternative-head">
      <strong>{alternative.title}</strong>
      {alternative.recommended && <Badge tone="success">Recommended</Badge>}
    </div>
    <p>{alternative.summary}</p>
    <div className="caval-suggestions__alternative-meta">
      <span>{alternative.estimatedFiles} files</span>
      <span>{alternative.estimatedLines.min}–{alternative.estimatedLines.max} lines</span>
    </div>
    <ul>
      {alternative.pros.slice(0, 2).map((pro) => <li key={pro}>+ {pro}</li>)}
      {alternative.cons.slice(0, 1).map((con) => <li key={con}>− {con}</li>)}
    </ul>
  </button>
);

export const SuggestionsPanel = ({
  bundle,
  onApprove,
  onReject,
  onProceed,
  onSelectAlternative
}: SuggestionsPanelProps) => {
  const [selectedAlt, setSelectedAlt] = useState(bundle?.selectedAlternativeId ?? "alt-optimized");

  useEffect(() => {
    if (bundle?.selectedAlternativeId) {
      setSelectedAlt(bundle.selectedAlternativeId);
    }
  }, [bundle?.selectedAlternativeId, bundle?.id]);

  if (!bundle) {
    return (
      <Panel title="AI Suggestions" variant="ai">
        <p className="caval-suggestions__empty">No active suggestion session. Send a Composer request in Plan mode to preview changes first.</p>
      </Panel>
    );
  }

  const handleSelect = (id: string) => {
    setSelectedAlt(id);
    onSelectAlternative?.(id);
  };

  return (
    <Panel
      title="AI Suggestions"
      variant="ai"
      actions={
        <div className="caval-suggestions__actions">
          <Button variant="ghost" size="sm" onClick={onReject}>Reject</Button>
          <Button variant="secondary" size="sm" onClick={() => onApprove?.(selectedAlt)}>Approve Direction</Button>
          <Button variant="primary" size="sm" onClick={onProceed}>Proceed to Patch Generation</Button>
        </div>
      }
    >
      <div className="caval-suggestions">
        <header className="caval-suggestions__hero">
          <div className="caval-suggestions__pulse-icon" aria-hidden="true" />
          <div>
            <Badge tone="info">Before Review</Badge>
            <h3>{bundle.summary.headline}</h3>
            <p>
              {bundle.summary.affectedFileCount} files · {bundle.summary.affectedSymbolCount} symbols ·
              {" "}{bundle.summary.estimatedLines.min}–{bundle.summary.estimatedLines.max} lines ·
              {" "}{bundle.summary.complexity} complexity
            </p>
          </div>
        </header>

        <Section title="Symbol Impact">
          {bundle.symbolImpacts.map((impact) => (
            <SymbolRow key={`${impact.file}-${impact.symbol}`} impact={impact} />
          ))}
        </Section>

        <Section title="Risk Assessment">
          {bundle.risks.map((risk) => (
            <div key={risk.id} className="caval-suggestions__risk">
              <Badge tone={riskLevelVariant(risk.level)}>{risk.level}</Badge>
              <strong>{risk.title}</strong>
              <p>{risk.description}</p>
              {risk.mitigation && <small>Mitigation: {risk.mitigation}</small>}
            </div>
          ))}
        </Section>

        <Section title="Alternatives">
          <div className="caval-suggestions__alternatives">
            {bundle.alternatives.map((alternative) => (
              <AlternativeCard
                key={alternative.id}
                alternative={alternative}
                selected={selectedAlt === alternative.id}
                onSelect={() => handleSelect(alternative.id)}
              />
            ))}
          </div>
        </Section>

        <Section title="Side Effects & Dependencies" defaultOpen={false}>
          <ul className="caval-suggestions__list">
            {bundle.sideEffects.map((effect) => <li key={effect}>{effect}</li>)}
            {bundle.dependencies.slice(0, 12).map((dep) => <li key={dep}>{dep}</li>)}
          </ul>
        </Section>
      </div>
    </Panel>
  );
};
