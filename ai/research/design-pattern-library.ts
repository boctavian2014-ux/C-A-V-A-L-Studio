import type { CompetingVisualTrait, DesignPattern, DesignPatternId, ProductCategory, ProductGoal, ProductIntent } from "./types";
import { COMPETING_VISUAL_TRAITS, RESEARCH_MAX_PATTERNS } from "./types";

export interface PatternLibraryEntry {
  id: DesignPatternId;
  name: string;
  why: string;
  categories: ProductCategory[];
  goals: Array<ProductGoal | "*">;
}

export const DESIGN_PATTERN_LIBRARY: readonly PatternLibraryEntry[] = [
  {
    id: "hero-cta",
    name: "Hero / CTA",
    why: "States the offer and the single conversion action on first paint.",
    categories: ["landing", "website", "web-app", "marketplace"],
    goals: ["*"],
  },
  {
    id: "social-proof",
    name: "Social proof",
    why: "Builds trust before a booking or purchase commitment.",
    categories: ["landing", "website", "marketplace", "web-app"],
    goals: ["booking", "checkout", "lead-gen"],
  },
  {
    id: "pricing",
    name: "Pricing",
    why: "Makes plan or service cost comparable without leaving the page.",
    categories: ["landing", "website", "web-app"],
    goals: ["lead-gen", "checkout"],
  },
  {
    id: "onboarding",
    name: "Onboarding",
    why: "Gets a new user to first value with the fewest steps.",
    categories: ["web-app", "mobile-app", "marketplace"],
    goals: ["onboarding", "catalog"],
  },
  {
    id: "booking",
    name: "Booking",
    why: "Service pick → slot → confirm is the critical path.",
    categories: ["landing", "website", "web-app", "mobile-app"],
    goals: ["booking"],
  },
  {
    id: "catalog",
    name: "Catalog / services",
    why: "Lets people scan offerings before they commit.",
    categories: ["landing", "website", "marketplace", "web-app", "mobile-app"],
    goals: ["catalog", "booking", "checkout"],
  },
  {
    id: "gallery",
    name: "Gallery",
    why: "Shows real work so a beauty or portfolio visit converts.",
    categories: ["landing", "website"],
    goals: ["booking", "portfolio", "lead-gen"],
  },
  {
    id: "checkout",
    name: "Checkout",
    why: "Shortens pay and address steps on the purchase path.",
    categories: ["marketplace", "web-app", "mobile-app"],
    goals: ["checkout"],
  },
  {
    id: "dashboard",
    name: "Dashboard",
    why: "Surfaces the next action and status, not a widget wall.",
    categories: ["dashboard", "web-app"],
    goals: ["dashboard"],
  },
  {
    id: "navigation",
    name: "Navigation",
    why: "Keeps the critical flow reachable in one tap on small screens.",
    categories: ["landing", "website", "web-app", "mobile-app", "marketplace", "dashboard"],
    goals: ["*"],
  },
  {
    id: "empty-states",
    name: "Empty states",
    why: "Turns a first-run blank screen into a guided next step.",
    categories: ["web-app", "mobile-app", "dashboard", "marketplace"],
    goals: ["onboarding", "catalog", "dashboard"],
  },
] as const;

const GOAL_PRIORITY: Record<ProductGoal, DesignPatternId[]> = {
  booking: ["hero-cta", "booking", "catalog", "gallery", "navigation"],
  checkout: ["hero-cta", "catalog", "checkout", "social-proof", "navigation"],
  onboarding: ["onboarding", "navigation", "empty-states", "hero-cta", "catalog"],
  catalog: ["catalog", "hero-cta", "navigation", "empty-states", "social-proof"],
  "lead-gen": ["hero-cta", "social-proof", "pricing", "navigation", "gallery"],
  dashboard: ["dashboard", "navigation", "empty-states", "catalog", "hero-cta"],
  delivery: ["hero-cta", "onboarding", "navigation", "empty-states", "catalog"],
  learning: ["hero-cta", "catalog", "onboarding", "navigation", "social-proof"],
  portfolio: ["hero-cta", "gallery", "navigation", "social-proof", "catalog"],
  community: ["hero-cta", "onboarding", "navigation", "empty-states", "catalog"],
};

function toPattern(entry: PatternLibraryEntry): DesignPattern {
  return { id: entry.id, name: entry.name, why: entry.why };
}

export function selectDesignPatterns(intent: ProductIntent): DesignPattern[] {
  const category = intent.category;
  const goal = intent.primaryGoal;
  if (!category) return [];
  const preferred: DesignPatternId[] = goal
    ? GOAL_PRIORITY[goal]
    : ["hero-cta", "navigation", "catalog"];
  const picked: DesignPattern[] = [];
  const used = new Set<DesignPatternId>();

  const allowed = new Set<ProductCategory>(
    [category, intent.secondaryCategory].filter(Boolean) as ProductCategory[]
  );
  for (const id of preferred) {
    const entry = DESIGN_PATTERN_LIBRARY.find((p) => p.id === id);
    if (!entry) continue;
    if (!entry.categories.some((c) => allowed.has(c))) continue;
    if (used.has(id)) continue;
    used.add(id);
    picked.push(toPattern(entry));
    if (picked.length >= RESEARCH_MAX_PATTERNS) return picked;
  }

  for (const entry of DESIGN_PATTERN_LIBRARY) {
    if (used.has(entry.id)) continue;
    if (!entry.categories.includes(category)) continue;
    if (goal && !entry.goals.includes("*") && !entry.goals.includes(goal)) continue;
    used.add(entry.id);
    picked.push(toPattern(entry));
    if (picked.length >= RESEARCH_MAX_PATTERNS) break;
  }
  return picked;
}

export function selectVisualTraits(intent: ProductIntent): {
  traits: string[];
  rejectedTraits: CompetingVisualTrait[];
} {
  const wanted: CompetingVisualTrait[] = [];
  if (intent.style === "dark" || /dark/.test(intent.style)) wanted.push("dark-mode");
  if (/glass/.test(intent.style)) wanted.push("glassmorphism");
  if (/3d/.test(intent.style)) wanted.push("3d");
  if (/anim/.test(intent.style)) wanted.push("heavy-animation");
  if (/bento/.test(intent.style)) wanted.push("bento-grid");

  const keep = wanted.slice(0, 2);
  if (intent.primaryGoal === "booking" || intent.primaryGoal === "checkout") {
    const filtered: CompetingVisualTrait[] = keep.filter(
      (t) => t !== "3d" && t !== "heavy-animation" && t !== "bento-grid"
    );
    const rejected = COMPETING_VISUAL_TRAITS.filter((t) => !filtered.includes(t));
    return { traits: filtered, rejectedTraits: rejected };
  }
  const rejected = COMPETING_VISUAL_TRAITS.filter((t) => !keep.includes(t));
  return { traits: keep, rejectedTraits: rejected };
}
