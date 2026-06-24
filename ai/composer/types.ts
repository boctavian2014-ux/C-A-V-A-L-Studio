import type { SymbolMatch } from "../get-symbols";
import type { AIContextBundle } from "../get-context";
import type { SuggestionsBundle } from "../suggestions/types";
import type { CodeReviewSession } from "../review/types";

export type ComposerPhase =
  | "completed"
  | "awaiting_suggestions"
  | "awaiting_review"
  | "failed";

export interface ComposerRequest {
  objective: string;
  workspaceRoot: string;
  constraints?: string[];
  dryRun?: boolean;
  runBuild?: boolean;
  runTests?: boolean;
  skipSuggestions?: boolean;
  skipReview?: boolean;
  suggestionSessionId?: string;
  reviewSessionId?: string;
  approvedAlternativeId?: string;
}

export interface ComposerContext {
  objective: string;
  workspaceRoot: string;
  relevantFiles: string[];
  symbols: SymbolMatch[];
  contextBundle: AIContextBundle;
  notes: string[];
}

export interface ComposerPlanStep {
  id: string;
  title: string;
  rationale: string;
  files: string[];
  symbols: string[];
  risk: "low" | "medium" | "high";
}

export interface ComposerPlan {
  objective: string;
  steps: ComposerPlanStep[];
  risks: string[];
  validation: string[];
}

export interface ComposerPatchFile {
  path: string;
  patch: string;
  fullContent?: string;
  semanticSummary?: string;
}

export interface ComposerPatchSet {
  summary: string;
  files: ComposerPatchFile[];
}

export interface ComposerDiagnostic {
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  file?: string;
}

export interface ComposerResult {
  ok: boolean;
  phase: ComposerPhase;
  plan: ComposerPlan;
  patchSet: ComposerPatchSet;
  changedFiles: string[];
  diagnostics: ComposerDiagnostic[];
  rolledBack: boolean;
  suggestions?: SuggestionsBundle;
  review?: CodeReviewSession;
}
