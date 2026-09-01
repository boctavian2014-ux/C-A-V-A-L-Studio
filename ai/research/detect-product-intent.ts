import {
  looksLikeChecklistOrAuditRequest,
  looksLikeExplicitCreate,
} from "../modes/create-intent";
import { detectSoftwareCategories } from "../tools/auto-web-context";
import { detectPlatforms } from "../tools/platform-context";
import type {
  ProductCategory,
  ProductGoal,
  ProductIntent,
  ProductIntentClassifier,
  ProductPlatform,
  ProductWorkspaceContext,
} from "./types";

const URL_RE = /https?:\/\/[^\s)>\]]+/gi;

const DEBUG_RE =
  /typescript|ts\s*error|compile|compilare|stack\s*trace|exception|bugfix|bug\s*fix|repar[ae]|fix\s+(the\s+)?(error|bug|build)|eroarea|undefined|cannot\s+find|type\s+error/i;

const EXPLAIN_RE =
  /explica|explain|ce\s+face|what\s+does|how\s+does|cum\s+functioneaza|de\s+ce\s+(e|este)|why\s+is/i;

const SMALL_EDIT_RE =
  /redenumeste|\brename\b|schimba\s+culoarea|change\s+the\s+color|adauga\s+un\s+console\.log|\btypo\b|whitespace|\bindent\b/i;

const LANDING_RE =
  /landing\s*page|pagina\s+de\s+prezentare|pagina\s+de\s+vanzare|hero\s+page/i;
const WEBSITE_RE =
  /website|web\s*site|site\s+web|site\s+(pentru|for)|portofoliu|portfolio\s+site/i;
const WEB_APP_RE = /web\s*app|aplicatie\s+web|\bsaas\b/i;
const MOBILE_RE =
  /mobile\s*app|aplicatie\s+mobila|mobila|ios|android|react\s*native|flutter|\bexpo\b/i;
const MARKET_RE =
  /marketplace|piata|two-?sided|cumparatori\s+[sș]i\s+vanzatori/i;
const DASH_RE = /dashboard|admin\s+panel|panou\s+admin|analytics\s+ui/i;

const BOOKING_RE = /rezerv|booking|appointment|programar|calendar\s+de\s+program/i;
const CHECKOUT_RE = /checkout|cos\s+de\s+cumpar|cart\s+and\s+pay|\bplata\b/i;
const ONBOARD_RE = /onboarding|inregistrare|sign[\s-]?up/i;
const CATALOG_RE = /catalog|produse|servicii|listings|meniu/i;
const LEAD_RE = /lead|cerere\s+ofert|contact\s+form|newsletter/i;
const LEARN_RE = /curs|course|lesson|e-?learning|academy/i;
const DELIVER_RE = /livrar|delivery|courier|dispatch/i;
const PORTFOLIO_RE = /portofoliu|portfolio/i;

const AUTH_RE = /auth|login|conturi|accounts?|oauth|sign[\s-]?in/i;
const PAY_RE = /stripe|plati|payments?|checkout|abonament|subscription/i;

const INDUSTRY_SIGNALS: Array<{ re: RegExp; industry: string }> = [
  { re: /\b(salon|frizerie|beauty|unghii|cosmet)/i, industry: "beauty" },
  { re: /\b(haine|fashion|imbracaminte|apparel)/i, industry: "fashion" },
  { re: /\b(restaurant|meniu|food|gastro)/i, industry: "food-service" },
  { re: /\b(fitness|gym|antrenament|workout)/i, industry: "fitness" },
  { re: /\b(curs|course|educa|academy|e-?learning)/i, industry: "education" },
  { re: /\b(ai\s+saas|inteligenta\s+artificial|artificial\s+intelligence)/i, industry: "ai-saas" },
  { re: /\b(saas|b2b|crm|analytics)/i, industry: "b2b-saas" },
  { re: /\b(livrar|delivery|logistic)/i, industry: "logistics" },
  { re: /\b(e-?commerce|magazin\s+online|shop)/i, industry: "ecommerce" },
];

const STYLE_SIGNALS: Array<{ re: RegExp; style: string }> = [
  { re: /\bpremium|luxury|luxe\b/i, style: "premium" },
  { re: /\bapple|minimal|clean\b/i, style: "minimal" },
  { re: /\bbold|vibrant|colorat\b/i, style: "bold" },
  { re: /\bplayful|fun|jucăuș\b/i, style: "playful" },
  { re: /\bdark\s*mode\b/i, style: "dark" },
];

const LOCALE_SIGNALS: Array<{ re: RegExp; tag: string }> = [
  { re: /\b(român|romania|ro-RO|limba\s+română)\b/i, tag: "ro" },
  { re: /\b(english|en-US|i18n|l10n|localizare)\b/i, tag: "en" },
];

function foldRo(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t");
}

function workspaceHintText(ctx?: string | ProductWorkspaceContext): string {
  if (!ctx) return "";
  if (typeof ctx === "string") return ctx;
  return [ctx.folderName, ...(ctx.fileHints ?? [])].filter(Boolean).join(" ");
}

function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;]+$/, "")))];
}

function detectCategory(text: string): {
  category: ProductCategory | null;
  secondary?: ProductCategory;
} {
  const mobile = MOBILE_RE.test(text);
  const market = MARKET_RE.test(text);
  if (market && mobile) return { category: "marketplace", secondary: "mobile-app" };
  if (market) return { category: "marketplace" };
  if (LANDING_RE.test(text)) return { category: "landing" };
  if (DASH_RE.test(text)) return { category: "dashboard" };
  if (WEB_APP_RE.test(text)) return { category: "web-app" };
  if (mobile) return { category: "mobile-app" };
  if (WEBSITE_RE.test(text)) return { category: "website" };
  if (/platforma/i.test(text)) return { category: "web-app" };
  if (/aplicatie|\bapp\b/i.test(text)) {
    return { category: /mobil/i.test(text) ? "mobile-app" : "web-app" };
  }

  const cats = detectSoftwareCategories(text);
  const web = cats.find((c) => c.category === "web");
  if (web?.facets.includes("landing")) return { category: "landing" };
  if (web?.facets.includes("dashboard")) return { category: "dashboard" };
  if (web?.facets.includes("web-app") || web?.facets.includes("ecommerce")) {
    return { category: web.facets.includes("ecommerce") ? "marketplace" : "web-app" };
  }
  if (web?.facets.includes("website")) return { category: "website" };
  if (cats[0]?.category === "mobile") return { category: "mobile-app" };
  return { category: null };
}

function detectGoal(text: string, category: ProductCategory | null): {
  goal: ProductGoal | null;
  explicit: boolean;
} {
  if (BOOKING_RE.test(text)) return { goal: "booking", explicit: true };
  if (CHECKOUT_RE.test(text) || /\be-?commerce|magazin\s+online\b/i.test(text)) {
    return { goal: "checkout", explicit: true };
  }
  if (ONBOARD_RE.test(text)) return { goal: "onboarding", explicit: true };
  if (DELIVER_RE.test(text)) return { goal: "delivery", explicit: true };
  if (LEARN_RE.test(text)) return { goal: "learning", explicit: true };
  if (PORTFOLIO_RE.test(text)) return { goal: "portfolio", explicit: true };
  if (LEAD_RE.test(text)) return { goal: "lead-gen", explicit: true };
  if (CATALOG_RE.test(text)) return { goal: "catalog", explicit: true };
  if (category === "dashboard") return { goal: "dashboard", explicit: false };
  if (category === "marketplace") return { goal: "catalog", explicit: false };
  if (category === "landing") return { goal: "lead-gen", explicit: false };
  return { goal: category ? "catalog" : null, explicit: false };
}

function detectPlatform(text: string, category: ProductCategory | null): ProductPlatform {
  const platforms = detectPlatforms(text);
  if (/\breact\s*native\b/i.test(text)) return "react-native";
  if (/\bflutter\b/i.test(text)) return "flutter";
  if (platforms.some((p) => p.platform === "ios") && platforms.some((p) => p.platform === "android")) {
    return "cross-platform";
  }
  if (platforms.some((p) => p.platform === "ios")) return "ios";
  if (platforms.some((p) => p.platform === "android")) return "android";
  if (category === "mobile-app") return "cross-platform";
  return "web";
}

function firstMatch(text: string, table: Array<{ re: RegExp; industry: string }>): string {
  return table.find((row) => row.re.test(text))?.industry ?? "";
}

function skipNonProduct(text: string): string | undefined {
  if (looksLikeChecklistOrAuditRequest(text)) return "audit-or-checklist";
  if (DEBUG_RE.test(text) && !LANDING_RE.test(text) && !MARKET_RE.test(text)) return "debug-or-fix";
  if (EXPLAIN_RE.test(text) && !looksLikeExplicitCreate(text)) return "explanation";
  if (SMALL_EDIT_RE.test(text) && !looksLikeExplicitCreate(text)) return "small-edit";
  return undefined;
}

function defaultPages(category: ProductCategory | null, goal: ProductGoal | null): string[] {
  if (category === "landing" && goal === "booking") {
    return ["home", "services", "gallery", "booking", "confirmation"];
  }
  if (category === "landing") return ["home", "features", "pricing", "contact"];
  if (category === "marketplace") return ["home", "catalog", "listing", "checkout"];
  if (category === "mobile-app") return ["home", "critical-flow"];
  if (category === "dashboard") return ["overview", "detail"];
  if (category === "web-app") return ["home", "app-shell"];
  if (category === "website") return ["home", "about", "contact"];
  return [];
}

function defaultFeatures(goal: ProductGoal | null, category: ProductCategory | null): string[] {
  const feats: string[] = [];
  if (goal === "booking") feats.push("booking", "confirmation");
  if (goal === "checkout") feats.push("catalog", "checkout");
  if (category === "landing") feats.push("hero-cta");
  if (category === "mobile-app") feats.push("minimal-navigation");
  return [...new Set(feats)];
}

export function isProductPromptClear(intent: ProductIntent): boolean {
  if (!intent.shouldResearch || !intent.category) return false;
  return Boolean(intent.industry || intent.audience || intent.goalExplicit);
}

export function detectProductIntentSync(
  prompt: string,
  activeWorkspaceContext?: string | ProductWorkspaceContext
): ProductIntent {
  const text = foldRo(`${prompt}\n${workspaceHintText(activeWorkspaceContext)}`.trim());
  const skipReason = skipNonProduct(foldRo(prompt.trim()));
  const { category, secondary } = detectCategory(text);
  const { goal: primaryGoal, explicit: goalExplicit } = detectGoal(text, category);
  const createLike = looksLikeExplicitCreate(prompt) || Boolean(category);
  const productLike = Boolean(category) && createLike && !skipReason;

  const industry = firstMatch(text, INDUSTRY_SIGNALS);
  const confidence: ProductIntent["confidence"] = skipReason
    ? "high"
    : category && (industry || goalExplicit)
      ? "high"
      : category
        ? "medium"
        : "low";

  const ambiguous = !skipReason && Boolean(category) && confidence !== "high";

  return {
    shouldResearch: productLike,
    category,
    secondaryCategory: secondary,
    platform: detectPlatform(text, category),
    industry,
    primaryGoal,
    goalExplicit,
    audience: "",
    style: STYLE_SIGNALS.find((s) => s.re.test(text))?.style ?? "",
    references: extractUrls(prompt),
    estimatedPages: defaultPages(category, primaryGoal),
    estimatedFeatures: defaultFeatures(primaryGoal, category),
    needsAuth: AUTH_RE.test(text),
    needsPayments: PAY_RE.test(text) || primaryGoal === "checkout",
    localization: LOCALE_SIGNALS.filter((s) => s.re.test(text)).map((s) => s.tag),
    confidence,
    ambiguous,
    classifiedBy: "rules",
    skipReason,
  };
}

function mergePartial(base: ProductIntent, extra: Partial<ProductIntent> | null): ProductIntent {
  if (!extra) return { ...base, classifiedBy: "llm" };
  return {
    ...base,
    ...extra,
    references: extra.references?.length ? extra.references : base.references,
    estimatedPages: extra.estimatedPages?.length ? extra.estimatedPages : base.estimatedPages,
    estimatedFeatures: extra.estimatedFeatures?.length ? extra.estimatedFeatures : base.estimatedFeatures,
    classifiedBy: "llm",
    ambiguous: false,
  };
}

export async function detectProductIntent(
  prompt: string,
  activeWorkspaceContext?: string | ProductWorkspaceContext,
  classify?: ProductIntentClassifier
): Promise<ProductIntent> {
  const rules = detectProductIntentSync(prompt, activeWorkspaceContext);
  if (!rules.ambiguous || !classify) return rules;
  try {
    const hint =
      typeof activeWorkspaceContext === "string"
        ? activeWorkspaceContext
        : workspaceHintText(activeWorkspaceContext);
    const extra = await classify({ prompt, workspaceHint: hint });
    return mergePartial(rules, extra);
  } catch {
    return rules;
  }
}
