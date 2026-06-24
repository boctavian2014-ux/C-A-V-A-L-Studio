import type { ComposerContext } from "../composer/types";

export type SuggestionRiskLevel = "low" | "medium" | "high" | "critical";
export type SuggestionRiskCategory =
  | "breaking_change"
  | "side_effect"
  | "performance"
  | "security"
  | "architecture";

export type AlternativeStrategy = "minimal" | "optimized" | "complete" | "aggressive";

export interface SymbolImpact {
  symbol: string;
  kind: string;
  file: string;
  action: "create" | "modify" | "delete" | "rename" | "reference";
  description: string;
}

export interface SuggestionRisk {
  id: string;
  category: SuggestionRiskCategory;
  level: SuggestionRiskLevel;
  title: string;
  description: string;
  mitigation?: string;
}

export interface SuggestionAlternative {
  id: string;
  strategy: AlternativeStrategy;
  title: string;
  summary: string;
  pros: string[];
  cons: string[];
  estimatedFiles: number;
  estimatedLines: { min: number; max: number };
  recommended?: boolean;
}

export interface SuggestionSummary {
  headline: string;
  affectedFileCount: number;
  affectedSymbolCount: number;
  estimatedLines: { min: number; max: number };
  complexity: "low" | "medium" | "high";
}

export interface SuggestionsBundle {
  id: string;
  request: string;
  workspaceRoot: string;
  context: ComposerContext;
  summary: SuggestionSummary;
  symbolImpacts: SymbolImpact[];
  risks: SuggestionRisk[];
  alternatives: SuggestionAlternative[];
  sideEffects: string[];
  dependencies: string[];
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "proceeded";
  selectedAlternativeId?: string;
  userNotes?: string;
}

export interface SuggestionsGenerateInput {
  request: string;
  workspaceRoot: string;
  context: ComposerContext;
}

export interface SuggestionsApprovalInput {
  sessionId: string;
  alternativeId?: string;
  notes?: string;
}
