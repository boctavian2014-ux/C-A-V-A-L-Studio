import { clipResearchNote, canonicalizeResearchUrl } from "./research-dedupe";
import type { ResearchSourceHit, WebResearchProvider, WebResearchQuery } from "./types";

type McpServerLite = {
  id?: string;
  running?: boolean;
  tools?: string[];
};

export interface WebResearchHost {
  mcpEnsureReady?: () => Promise<{ ok?: boolean; servers?: McpServerLite[] }>;
  toolExecute?: (input: { name: string; arguments: Record<string, unknown> }) => Promise<{
    ok: boolean;
    output?: unknown;
    error?: string;
  }>;
}

function firecrawlReady(servers: McpServerLite[] | undefined): boolean {
  return Boolean(
    servers?.some(
      (s) =>
        (s.id === "firecrawl" || s.id === "fetch") &&
        s.running &&
        (s.tools?.length ?? 0) > 0
    )
  );
}

function hitsFromUnknown(output: unknown, kind: WebResearchQuery["kind"]): ResearchSourceHit[] {
  if (!output || typeof output !== "object") return [];
  const rec = output as Record<string, unknown>;
  const list = Array.isArray(rec.data)
    ? rec.data
    : Array.isArray(rec.results)
      ? rec.results
      : Array.isArray(rec.web)
        ? rec.web
        : [];
  const hits: ResearchSourceHit[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : typeof row.link === "string" ? row.link : "";
    const title = typeof row.title === "string" ? row.title : "";
    const canon = canonicalizeResearchUrl(url);
    if (!canon || !title) continue;
    hits.push({
      url: canon,
      title: title.slice(0, 120),
      kind,
      note: clipResearchNote("Relevant public example — extract structure, never copy."),
    });
  }
  return hits;
}

export function createMcpWebResearchProvider(host: WebResearchHost): WebResearchProvider {
  return {
    async search(queries, signal) {
      if (signal.aborted) return [];
      const ready = await host.mcpEnsureReady?.();
      if (!firecrawlReady(ready?.servers)) return [];
      if (!host.toolExecute) return [];
      const hits: ResearchSourceHit[] = [];
      for (const query of queries.slice(0, 3)) {
        if (signal.aborted) break;
        const name = "mcp:firecrawl:firecrawl_search";
        try {
          const res = await host.toolExecute({
            name,
            arguments: { query: query.query, limit: 3 },
          });
          if (!res.ok) continue;
          hits.push(...hitsFromUnknown(res.output, query.kind));
        } catch {
          /* provider failure is non-blocking */
        }
      }
      return hits;
    },
  };
}

export async function resolveDefaultWebProvider(
  host?: WebResearchHost
): Promise<WebResearchProvider | null> {
  if (!host?.mcpEnsureReady) return null;
  try {
    const ready = await host.mcpEnsureReady();
    if (!firecrawlReady(ready.servers)) return null;
    return createMcpWebResearchProvider(host);
  } catch {
    return null;
  }
}
