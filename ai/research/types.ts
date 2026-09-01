/** Automatic product research contracts — compact, never hold scraped HTML. */

export const PRODUCT_CATEGORIES = [
  "landing",
  "website",
  "web-app",
  "mobile-app",
  "marketplace",
  "dashboard",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_PLATFORMS = [
  "web",
  "ios",
  "android",
  "react-native",
  "flutter",
  "cross-platform",
] as const;

export type ProductPlatform = (typeof PRODUCT_PLATFORMS)[number];

export const PRODUCT_GOALS = [
  "booking",
  "checkout",
  "onboarding",
  "catalog",
  "lead-gen",
  "dashboard",
  "delivery",
  "learning",
  "portfolio",
  "community",
] as const;

export type ProductGoal = (typeof PRODUCT_GOALS)[number];

export const RESEARCH_SOURCE_KINDS = [
  "example",
  "template",
  "ux-pattern",
  "trend",
  "user-url",
] as const;

export type ResearchSourceKind = (typeof RESEARCH_SOURCE_KINDS)[number];

export const RESEARCH_STATUSES = [
  "ok",
  "unavailable",
  "timeout",
  "empty",
  "skipped",
] as const;

export type ResearchStatus = (typeof RESEARCH_STATUSES)[number];

export const DESIGN_PATTERN_IDS = [
  "hero-cta",
  "social-proof",
  "pricing",
  "onboarding",
  "booking",
  "catalog",
  "checkout",
  "dashboard",
  "navigation",
  "empty-states",
  "gallery",
] as const;

export type DesignPatternId = (typeof DESIGN_PATTERN_IDS)[number];

export const COMPETING_VISUAL_TRAITS = [
  "dark-mode",
  "glassmorphism",
  "3d",
  "heavy-animation",
  "bento-grid",
] as const;

export type CompetingVisualTrait = (typeof COMPETING_VISUAL_TRAITS)[number];

export interface ProductWorkspaceContext {
  folderName?: string;
  fileHints?: string[];
}

export interface DesignReference {
  url: string;
  title: string;
  kind: ResearchSourceKind;
  /** Original one-line takeaway — never pasted page copy. */
  takeaway: string;
}

export interface DesignPattern {
  id: DesignPatternId;
  name: string;
  why: string;
}

export interface ProductIntent {
  shouldResearch: boolean;
  category: ProductCategory | null;
  secondaryCategory?: ProductCategory;
  platform: ProductPlatform;
  industry: string;
  primaryGoal: ProductGoal | null;
  goalExplicit: boolean;
  audience: string;
  style: string;
  references: string[];
  estimatedPages: string[];
  estimatedFeatures: string[];
  needsAuth: boolean;
  needsPayments: boolean;
  localization: string[];
  confidence: "high" | "medium" | "low";
  ambiguous: boolean;
  classifiedBy: "rules" | "llm";
  skipReason?: string;
}

export interface ProductResearchBrief {
  productType: ProductCategory;
  industry: string;
  primaryGoal: ProductGoal;
  audience: string;
  requiredFlows: string[];
  proposedPages: string[];
  visualDirection: {
    style: string;
    traits: string[];
    rejectedTraits: CompetingVisualTrait[];
  };
  patterns: DesignPattern[];
  references: DesignReference[];
  constraints: {
    mobileFirst: boolean;
    wcagAa: boolean;
    performance: string;
  };
  buildPlan: string[];
  clarifyingQuestion?: string;
  researchStatus: ResearchStatus;
}

export interface ResearchSourceHit {
  url: string;
  title: string;
  kind: ResearchSourceKind;
  note: string;
}

export interface WebResearchQuery {
  query: string;
  kind: ResearchSourceKind;
}

export interface WebResearchProvider {
  search(queries: WebResearchQuery[], signal: AbortSignal): Promise<ResearchSourceHit[]>;
}

export type ProductIntentClassifier = (input: {
  prompt: string;
  workspaceHint?: string;
}) => Promise<Partial<ProductIntent> | null>;

export interface ProductResearchRun {
  intent: ProductIntent;
  brief: ProductResearchBrief | null;
  sources: ResearchSourceHit[];
  status: ResearchStatus;
  durationMs: number;
  cacheHit: boolean;
  resultCount: number;
}

export interface PendingProductResearch {
  originalPrompt: string;
  intent: ProductIntent;
  brief: ProductResearchBrief;
  phase: "awaiting-confirm" | "accepted";
  messageId: string;
}

export const PRODUCT_BRIEF_RELATIVE_PATH = ".caval/research/product-brief.json";
export const RESEARCH_TIMEOUT_MS = 12_000;
export const RESEARCH_MAX_SOURCES = 6;
export const RESEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_MAX_PATTERNS = 5;
export const RESEARCH_NOTE_MAX_CHARS = 160;
