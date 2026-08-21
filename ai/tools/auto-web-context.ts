/**
 * Universal software project detection + offline "web context" injection for Caval AI.
 * Automatic — no UI. Uses curated 2026 trends + platform packs (no network dependency).
 * Pas 7h: when category is web/UI, also inject mandatory design contract + code snippets.
 */

import { formatDesignContractBlock } from "../data/design-contract";
import {
  formatDesignSnippetsBlock,
  selectDesignSnippets,
  type DesignSnippet,
} from "../data/design-snippets-2026";
import {
  SOFTWARE_TRENDS_2026,
  trendSearchDocuments,
  type CategoryTrendPack,
  type SoftwareCategory,
} from "../data/software-trends-2026";
import {
  detectPlatforms,
  formatPlatformContextBlock,
  type DetectedPlatform,
} from "./platform-context";

export type { SoftwareCategory };
export type { SoftwarePlatform, DetectedPlatform } from "./platform-context";

export interface DetectedSoftwareProject {
  category: SoftwareCategory;
  score: number;
  /** Sub-labels matched (landing, ecommerce, …). */
  facets: string[];
}

export interface CategorySearchHit {
  id: string;
  text: string;
  score: number;
}

export interface UniversalWebContext {
  detections: DetectedSoftwareProject[];
  primary: SoftwareCategory | null;
  platforms: DetectedPlatform[];
  searchHits: CategorySearchHit[];
  /** Design snippets injected for web UI (empty otherwise). */
  designSnippets: DesignSnippet[];
  /** True when the mandatory design contract was appended. */
  designContractApplied: boolean;
  /** Ready to append into projectContext. Empty if nothing useful. */
  contextBlock: string;
}

/** Keyword / phrase weights per category (and optional facet tags). */
const CATEGORY_SIGNALS: Record<
  SoftwareCategory,
  Array<{ re: RegExp; weight: number; facet?: string }>
> = {
  web: [
    { re: /\blanding\s*page\b/i, weight: 3, facet: "landing" },
    { re: /\b(website|web\s*site|site\s*web)\b/i, weight: 2.5, facet: "website" },
    { re: /\bweb\s*app(lication)?\b/i, weight: 3, facet: "web-app" },
    { re: /\bdashboard\b/i, weight: 2.5, facet: "dashboard" },
    { re: /\b(e-?commerce|online\s*store|shopify|magazin\s*online)\b/i, weight: 3, facet: "ecommerce" },
    { re: /\b(blog|cms)\b/i, weight: 2, facet: "blog" },
    { re: /\b(saas|frontend|next\.?js|vite\s*\+\s*react)\b/i, weight: 2 },
    { re: /\b(html|css|tailwind|react)\b/i, weight: 1 },
    { re: /\b(ui|ux|pagină|pagina)\b/i, weight: 1.5, facet: "ui" },
  ],
  mobile: [
    { re: /\b(ios|iphone|ipad|swiftui)\b/i, weight: 3, facet: "ios" },
    { re: /\b(android|jetpack\s*compose|kotlin\s*app)\b/i, weight: 3, facet: "android" },
    { re: /\breact\s*native\b/i, weight: 3, facet: "react-native" },
    { re: /\bflutter\b/i, weight: 3, facet: "flutter" },
    { re: /\bmobile\s*(app|ui|application)\b/i, weight: 3, facet: "mobile-ui" },
    { re: /\b(expo|app\s*store|play\s*store)\b/i, weight: 2 },
    { re: /\b(mobil|aplicație\s*mobilă)\b/i, weight: 2.5 },
  ],
  desktop: [
    { re: /\belectron\b/i, weight: 3.5, facet: "electron" },
    { re: /\b(tauri|desktop\s*app|native\s*app)\b/i, weight: 3, facet: "desktop" },
    { re: /\bcross-?platform\s*(desktop|app)\b/i, weight: 2.5 },
    { re: /\b(wpf|winui|qt\s*app|gtk\s*app)\b/i, weight: 2.5 },
    { re: /\baplicație\s*desktop\b/i, weight: 3 },
  ],
  cli: [
    { re: /\b(command\s*line|cli\s*app|cli\s*tool|terminal\s*app)\b/i, weight: 3.5, facet: "cli" },
    { re: /\b(shell\s*script|bash\s*script|powershell\s*script)\b/i, weight: 2.5, facet: "script" },
    { re: /\b(argv|stdin|stdout|tty)\b/i, weight: 2 },
    { re: /\b(tool\s*de\s*linie|linie\s*de\s*comandă)\b/i, weight: 3 },
  ],
  api: [
    { re: /\b(rest\s*api|graphql|microservice|micro-?service)\b/i, weight: 3.5, facet: "api" },
    { re: /\b(backend|server\s*api|http\s*api|openapi|swagger)\b/i, weight: 3 },
    { re: /\b(express|fastify|nestjs|koa)\b/i, weight: 2 },
    { re: /\b(endpoint|webhook)\b/i, weight: 1.5 },
  ],
  game: [
    { re: /\b(2d\s*game|3d\s*game|web\s*game|video\s*game)\b/i, weight: 3.5, facet: "game" },
    { re: /\b(unity|godot|unreal|phaser|three\.?js\s*game)\b/i, weight: 3.5 },
    { re: /\b(gameplay|game\s*engine|game\s*loop)\b/i, weight: 2.5 },
    { re: /\b(joc\s*(2d|3d|video)?)\b/i, weight: 3 },
  ],
  "ai-ml": [
    { re: /\b(machine\s*learning|deep\s*learning|neural\s*network)\b/i, weight: 3.5, facet: "ml" },
    { re: /\b(data\s*science|model\s*training|llm|rag\b|embedding)\b/i, weight: 3 },
    { re: /\b(pytorch|tensorflow|sklearn|huggingface)\b/i, weight: 2.5 },
    { re: /\b(ai\s*model|ml\s*pipeline)\b/i, weight: 2.5 },
  ],
  blockchain: [
    { re: /\b(smart\s*contract|solidity|web3|dapp|defi|nft)\b/i, weight: 3.5, facet: "web3" },
    { re: /\b(blockchain|ethereum|crypto\s*wallet|hardhat|foundry)\b/i, weight: 3 },
    { re: /\b(token\s*contract|erc-?20|erc-?721)\b/i, weight: 2.5 },
  ],
  iot: [
    { re: /\b(iot|internet\s*of\s*things|embedded)\b/i, weight: 3.5, facet: "iot" },
    { re: /\b(arduino|raspberry\s*pi|esp32|mqtt|sensor)\b/i, weight: 3 },
    { re: /\b(firmware|gpio|telemetry)\b/i, weight: 2 },
  ],
  database: [
    { re: /\b(database\s*design|schema\s*design|sql\s*migration|db\s*migration)\b/i, weight: 3.5, facet: "schema" },
    { re: /\b(postgresql|mysql|sqlite|mongodb|prisma|drizzle)\b/i, weight: 2.5 },
    { re: /\b(indexing|query\s*optimization|olap|oltp)\b/i, weight: 2 },
    { re: /\b(bază\s*de\s*date|migr(ație|are)\s*sql)\b/i, weight: 3 },
  ],
};

const CREATE_INTENT =
  /\b(create|build|make|generate|implement|scaffold|develop|creează|creaza|construiește|fa\s+un|fă\s+un|aplicatie|aplicație|project|proiect)\b/i;

const UI_WEB_FACETS = new Set([
  "landing",
  "website",
  "web-app",
  "dashboard",
  "ecommerce",
  "blog",
  "ui",
]);

/**
 * Detect software project categories from free-text (EN/RO keywords).
 * Returns sorted by score descending; empty if nothing matched.
 */
export function detectSoftwareCategories(userText: string): DetectedSoftwareProject[] {
  const text = userText.trim();
  if (text.length < 4) return [];

  const results: DetectedSoftwareProject[] = [];
  for (const category of Object.keys(CATEGORY_SIGNALS) as SoftwareCategory[]) {
    let score = 0;
    const facets = new Set<string>();
    for (const signal of CATEGORY_SIGNALS[category]) {
      if (signal.re.test(text)) {
        score += signal.weight;
        if (signal.facet) facets.add(signal.facet);
      }
    }
    if (score > 0) {
      results.push({ category, score, facets: [...facets] });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Lexical search over the category trend corpus (simulates context-specific web search). */
export function searchCategoryContext(
  category: SoftwareCategory,
  query: string,
  limit = 8
): CategorySearchHit[] {
  const q = query.toLowerCase();
  const tokens = q
    .split(/[^a-zăâîșț0-9+#.]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  const docs = trendSearchDocuments(category);
  const hits: CategorySearchHit[] = [];
  for (const doc of docs) {
    const hay = doc.text.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += doc.weight;
    }
    // Always keep strong trends even if query tokens miss
    if (score === 0 && doc.id.includes("-trend-")) score = doc.weight * 0.35;
    if (score > 0) hits.push({ id: doc.id, text: doc.text, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function formatCategoryPack(
  pack: CategoryTrendPack,
  hits: CategorySearchHit[],
  facets: string[]
): string {
  const lines: string[] = [
    `### ${pack.label}`,
    facets.length ? `Matched facets: ${facets.join(", ")}` : "",
    "Search focus:",
    ...pack.searchFocus.map((s) => `- ${s}`),
    "2026 trends / best practices:",
    ...hits.map((h) => `- ${h.text}`),
    "Preferred stacks (if unspecified):",
    ...pack.defaultStacks.map((s) => `- ${s}`),
    "Code patterns:",
    ...pack.codePatterns.map((s) => `- ${s}`),
  ].filter(Boolean);
  return lines.join("\n");
}

/** Whether this detection warrants the mandatory design contract (UI / landing / web app). */
export function shouldApplyDesignContract(
  primary: SoftwareCategory | null,
  detections: DetectedSoftwareProject[]
): boolean {
  if (primary !== "web") return false;
  const web = detections.find((d) => d.category === "web");
  if (!web) return false;
  if (web.facets.some((f) => UI_WEB_FACETS.has(f))) return true;
  // High-confidence web create even without a named facet (e.g. "saas frontend")
  return web.score >= 2;
}

const MAX_CONTEXT_CHARS = 9000;

function emptyContext(
  detections: DetectedSoftwareProject[],
  platforms: DetectedPlatform[]
): UniversalWebContext {
  return {
    detections,
    primary: null,
    platforms,
    searchHits: [],
    designSnippets: [],
    designContractApplied: false,
    contextBlock: "",
  };
}

/**
 * Build automatic universal software context for a user prompt.
 * Returns empty contextBlock when confidence is too low or ask-only without create intent.
 */
export function buildUniversalWebContext(
  userText: string,
  opts?: { force?: boolean; maxCategories?: number }
): UniversalWebContext {
  const detections = detectSoftwareCategories(userText);
  const platforms = detectPlatforms(userText);
  const maxCategories = opts?.maxCategories ?? 2;

  const createLike = CREATE_INTENT.test(userText) || opts?.force === true;
  const primary = detections[0]?.category ?? null;
  const uiWebIntent = detections.some(
    (d) => d.category === "web" && d.facets.some((f) => UI_WEB_FACETS.has(f))
  );
  // Landing / website facets count as product intent even without "create/build".
  const confident =
    detections.length > 0 &&
    detections[0]!.score >= (createLike || uiWebIntent ? 2 : 3.5);

  if (!confident || !primary) {
    return emptyContext(detections, platforms);
  }

  const chosen = detections.slice(0, maxCategories);
  const searchHits: CategorySearchHit[] = [];
  const sections: string[] = [
    "Universal software context (auto-detected — offline 2026 corpus, not live web):",
    `Primary category: ${primary} (score ${detections[0]!.score.toFixed(1)})`,
  ];

  for (const det of chosen) {
    const pack = SOFTWARE_TRENDS_2026[det.category];
    const hits = searchCategoryContext(det.category, userText, 6);
    searchHits.push(...hits);
    sections.push(formatCategoryPack(pack, hits, det.facets));
  }

  const platformBlock = formatPlatformContextBlock(platforms, 2);
  if (platformBlock) sections.push(platformBlock);

  const designContractApplied = shouldApplyDesignContract(primary, chosen);
  let designSnippets: DesignSnippet[] = [];
  if (designContractApplied) {
    designSnippets = selectDesignSnippets(userText, 3);
    // Contract + snippets first so truncation keeps enforcement rules.
    sections.unshift(formatDesignContractBlock(), formatDesignSnippetsBlock(designSnippets));
  }

  let contextBlock = sections.filter(Boolean).join("\n\n");
  if (contextBlock.length > MAX_CONTEXT_CHARS) {
    contextBlock = `${contextBlock.slice(0, MAX_CONTEXT_CHARS)}\n…[truncated]`;
  }

  return {
    detections: chosen,
    primary,
    platforms,
    searchHits,
    designSnippets,
    designContractApplied,
    contextBlock,
  };
}

/** Merge into existing projectContext string (no-op if empty). */
export function mergeProjectContextWithWebContext(
  projectContext: string,
  web: UniversalWebContext
): string {
  const block = web.contextBlock.trim();
  if (!block) return projectContext;
  if (!projectContext.trim()) return block;
  return `${projectContext}\n\n---\n\n${block}`;
}
