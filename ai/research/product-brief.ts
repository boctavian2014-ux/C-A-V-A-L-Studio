import { selectDesignPatterns, selectVisualTraits } from "./design-pattern-library";
import { isProductPromptClear } from "./detect-product-intent";
import { sanitizeProductBrief } from "./sanitize-research";
import type {
  DesignReference,
  ProductCategory,
  ProductGoal,
  ProductIntent,
  ProductResearchBrief,
  ResearchSourceHit,
  ResearchStatus,
} from "./types";
import { PRODUCT_BRIEF_RELATIVE_PATH } from "./types";

const DEFAULT_AUDIENCE: Record<string, string> = {
  beauty: "local clients booking a visit",
  fashion: "shoppers comparing style and fit",
  "food-service": "diners deciding where and when to eat",
  fitness: "members tracking workouts",
  education: "learners picking the next lesson",
  "b2b-saas": "operators scanning status and next actions",
  logistics: "customers tracking a delivery",
  ecommerce: "buyers completing a purchase",
  "ai-saas": "teams evaluating a product in minutes",
};

function pagesFor(intent: ProductIntent): string[] {
  if (intent.estimatedPages.length) return intent.estimatedPages;
  if (intent.category === "landing" && intent.primaryGoal === "booking") {
    return ["home", "services", "gallery", "booking", "confirmation"];
  }
  return ["home"];
}

function flowsFor(intent: ProductIntent): string[] {
  const flows = new Set<string>();
  if (intent.primaryGoal === "booking") {
    flows.add("booking");
    flows.add("confirmation");
  }
  if (intent.primaryGoal === "checkout") flows.add("checkout");
  if (intent.primaryGoal === "onboarding") flows.add("onboarding");
  if (intent.primaryGoal === "delivery") flows.add("track-order");
  if (intent.category === "landing") flows.add("primary-cta");
  if (intent.category === "mobile-app") flows.add("critical-screen");
  if (intent.needsAuth) flows.add("auth");
  if (intent.needsPayments) flows.add("payments");
  return [...flows];
}

function buildPlan(intent: ProductIntent): string[] {
  const first =
    intent.category === "mobile-app"
      ? "Ship the critical screen and minimal navigation first"
      : "Ship one runnable first page, responsive and original";
  const critical =
    intent.primaryGoal === "booking"
      ? "Implement the booking flow next (services → slot → confirm)"
      : "Implement only the critical conversion flow next";
  const extras =
    intent.needsAuth || intent.needsPayments
      ? "Add auth or payments only because the request asked for them"
      : "Skip auth, payments, and extra modules until they are requested";
  return [first, critical, extras, "QA after each milestone — do not mark done without preview or a clear environment limit"];
}

function clarifyingQuestion(intent: ProductIntent): string | undefined {
  if (isProductPromptClear(intent)) return undefined;
  if (!intent.industry && !intent.audience) {
    return "Pentru cine este produsul și ce acțiune trebuie să facă vizitatorul în primul ecran?";
  }
  if (!intent.primaryGoal) {
    return "Care este acțiunea principală: rezervare, cumpărare, înscriere sau altceva?";
  }
  return undefined;
}

export function referencesFromHits(hits: ResearchSourceHit[]): DesignReference[] {
  return hits.map((hit) => ({
    url: hit.url,
    title: hit.title,
    kind: hit.kind,
    takeaway: hit.note,
  }));
}

export function buildProductResearchBrief(
  intent: ProductIntent,
  hits: ResearchSourceHit[],
  status: ResearchStatus
): ProductResearchBrief | null {
  if (!intent.shouldResearch || !intent.category) return null;
  const goal: ProductGoal = intent.primaryGoal ?? (intent.category === "dashboard" ? "dashboard" : "catalog");
  const category: ProductCategory = intent.category;
  const visual = selectVisualTraits(intent);
  const brief: ProductResearchBrief = {
    productType: category,
    industry: intent.industry || "general",
    primaryGoal: goal,
    audience: intent.audience || DEFAULT_AUDIENCE[intent.industry] || "first-time visitors",
    requiredFlows: flowsFor(intent),
    proposedPages: pagesFor(intent),
    visualDirection: {
      style: intent.style || "modern-functional",
      traits: visual.traits,
      rejectedTraits: visual.rejectedTraits,
    },
    patterns: selectDesignPatterns({ ...intent, primaryGoal: goal }),
    references: referencesFromHits(hits),
    constraints: {
      mobileFirst: intent.platform !== "web" || category === "landing" || category === "mobile-app",
      wcagAa: true,
      performance: "Keep the first screen light: no heavy 3D, no stacked animation kits",
    },
    buildPlan: buildPlan(intent),
    clarifyingQuestion: clarifyingQuestion(intent),
    researchStatus: status,
  };
  return sanitizeProductBrief(brief);
}

export function applyDirectionRefinement(brief: ProductResearchBrief, text: string): ProductResearchBrief {
  const next = { ...brief, visualDirection: { ...brief.visualDirection } };
  if (/premium|luxe|luxury/i.test(text)) next.visualDirection.style = "premium";
  if (/fără anima|fara anima|no anim/i.test(text)) {
    next.visualDirection.traits = next.visualDirection.traits.filter((t) => t !== "heavy-animation");
    if (!next.visualDirection.rejectedTraits.includes("heavy-animation")) {
      next.visualDirection.rejectedTraits = [...next.visualDirection.rejectedTraits, "heavy-animation"];
    }
  }
  if (/apple|minimal/i.test(text)) next.visualDirection.style = "minimal";
  if (/mobil|mobile/i.test(text)) next.constraints = { ...next.constraints, mobileFirst: true };
  return sanitizeProductBrief(next);
}

export function isBuildConfirmText(text: string): boolean {
  return /^(construie[șs]te(\s+proiectul)?|build(\s+(it|the\s+project))?|ok\s+build|genereaz[ăa](\s+proiectul)?|start(\s+build)?)$/i.test(
    text.trim()
  );
}

export function isDirectionRefinementText(text: string): boolean {
  return /premium|anima|apple|minimal|mobil|dark|fără|fara|mai\s+(potrivit|curat|simplu)/i.test(text);
}

export function serializeProductBrief(brief: ProductResearchBrief): string {
  return `${JSON.stringify(sanitizeProductBrief(brief), null, 2)}\n`;
}

export function productBriefWorkspacePath(): string {
  return PRODUCT_BRIEF_RELATIVE_PATH;
}
