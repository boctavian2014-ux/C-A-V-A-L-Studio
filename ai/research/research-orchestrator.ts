import { hashResearchKey, readResearchCache, writeResearchCache } from "./research-cache";
import { detectProductIntent } from "./detect-product-intent";
import { offlineReferenceHits, userUrlHits } from "./offline-references";
import { buildProductResearchBrief } from "./product-brief";
import { recordResearchRun } from "./research-metrics";
import { dedupeResearchHits } from "./research-dedupe";
import { sanitizeResearchHits } from "./sanitize-research";
import { resolveDefaultWebProvider, type WebResearchHost } from "./web-research-provider";
import type {
  ProductIntent,
  ProductIntentClassifier,
  ProductResearchRun,
  ProductWorkspaceContext,
  ResearchSourceHit,
  ResearchStatus,
  WebResearchProvider,
} from "./types";
import { RESEARCH_MAX_SOURCES, RESEARCH_TIMEOUT_MS } from "./types";

export interface RunProductResearchInput {
  prompt: string;
  workspaceContext?: string | ProductWorkspaceContext;
  classify?: ProductIntentClassifier;
  provider?: WebResearchProvider | null;
  host?: WebResearchHost;
  now?: number;
  timeoutMs?: number;
}

function queriesFor(intent: ProductIntent): Array<{ query: string; kind: ResearchSourceHit["kind"] }> {
  const topic = [intent.industry, intent.category, intent.primaryGoal].filter(Boolean).join(" ");
  return [
    { query: `${topic} product examples 2026`, kind: "example" },
    { query: `${topic} modern UI template patterns`, kind: "template" },
    { query: `${topic} UX ${intent.primaryGoal ?? "conversion"} flow`, kind: "ux-pattern" },
    { query: `${topic} product design trends`, kind: "trend" },
  ];
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function runProductResearch(input: RunProductResearchInput): Promise<ProductResearchRun> {
  const started = Date.now();
  const intent = await detectProductIntent(input.prompt, input.workspaceContext, input.classify);
  if (!intent.shouldResearch) {
    const skipped: ProductResearchRun = {
      intent,
      brief: null,
      sources: [],
      status: "skipped",
      durationMs: Date.now() - started,
      cacheHit: false,
      resultCount: 0,
    };
    return skipped;
  }

  const key = hashResearchKey(intent);
  const cached = readResearchCache(key, input.now);
  if (cached) {
    recordResearchRun({
      durationMs: Date.now() - started,
      resultCount: cached.resultCount,
      cacheHit: true,
    });
    return { ...cached, intent, durationMs: Date.now() - started, cacheHit: true };
  }

  const timeoutMs = input.timeoutMs ?? RESEARCH_TIMEOUT_MS;
  let status: ResearchStatus = "ok";
  let live: ResearchSourceHit[] = [];

  try {
    live = await withTimeout(async (signal) => {
      const provider = input.provider === undefined
        ? await resolveDefaultWebProvider(input.host)
        : input.provider;
      if (!provider) {
        status = "unavailable";
        return [];
      }
      try {
        const found = await provider.search(queriesFor(intent), signal);
        if (signal.aborted) {
          status = "timeout";
          return [];
        }
        return found;
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          status = "timeout";
          return [];
        }
        status = "unavailable";
        return [];
      }
    }, timeoutMs);
  } catch {
    status = "timeout";
    live = [];
  }

  const offline = intent.category
    ? offlineReferenceHits(intent.category, intent.primaryGoal)
    : [];
  const merged = dedupeResearchHits(
    sanitizeResearchHits([...userUrlHits(intent.references), ...live, ...offline]),
    RESEARCH_MAX_SOURCES
  );
  if (merged.length === 0 && status === "ok") status = "empty";

  const brief = buildProductResearchBrief(intent, merged, status);
  const run: ProductResearchRun = {
    intent,
    brief,
    sources: merged,
    status,
    durationMs: Date.now() - started,
    cacheHit: false,
    resultCount: merged.length,
  };
  writeResearchCache(key, run, undefined, input.now);
  recordResearchRun({
    durationMs: run.durationMs,
    resultCount: run.resultCount,
    cacheHit: false,
  });
  return run;
}
