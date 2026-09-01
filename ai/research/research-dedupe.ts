import type { ResearchSourceHit } from "./types";
import { RESEARCH_NOTE_MAX_CHARS } from "./types";

const WEAK_HOSTS = new Set([
  "pastebin.com",
  "paste.ee",
  "justpaste.it",
  "localhost",
  "127.0.0.1",
]);

export function canonicalizeResearchUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    if (WEAK_HOSTS.has(host)) return null;
    url.searchParams.forEach((_, key) => {
      if (/^(utm_|fbclid|gclid|ref|mc_)/i.test(key)) url.searchParams.delete(key);
    });
    url.hash = "";
    url.hostname = host;
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
}

export function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function clipResearchNote(note: string): string {
  const clean = note.replace(/\s+/g, " ").trim();
  if (clean.length <= RESEARCH_NOTE_MAX_CHARS) return clean;
  return `${clean.slice(0, RESEARCH_NOTE_MAX_CHARS - 1).trimEnd()}…`;
}

export function isWeakResearchHit(hit: ResearchSourceHit): boolean {
  if (!hit.title.trim() || !hit.url.trim()) return true;
  if (hit.title.length < 3) return true;
  if (/lorem ipsum|untitled|home page/i.test(hit.title)) return true;
  const canon = canonicalizeResearchUrl(hit.url);
  return !canon;
}

export function dedupeResearchHits(hits: ResearchSourceHit[], max = 6): ResearchSourceHit[] {
  const seenHost = new Set<string>();
  const seenCanon = new Set<string>();
  const out: ResearchSourceHit[] = [];
  for (const hit of hits) {
    if (isWeakResearchHit(hit)) continue;
    const canon = canonicalizeResearchUrl(hit.url);
    if (!canon) continue;
    const host = hostOfUrl(canon);
    if (seenCanon.has(canon) || seenHost.has(host)) continue;
    seenCanon.add(canon);
    seenHost.add(host);
    out.push({
      ...hit,
      url: canon,
      title: hit.title.trim().slice(0, 120),
      note: clipResearchNote(hit.note),
    });
    if (out.length >= max) break;
  }
  return out;
}

export function looksLikeCopiedHtml(text: string): boolean {
  return /<\/?(html|body|div|section|script|style)\b/i.test(text) || text.includes("<!DOCTYPE");
}
