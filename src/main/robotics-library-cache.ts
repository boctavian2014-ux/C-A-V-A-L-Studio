/**
 * Online robotics standard library: CDN fetch + local cache (Electron main).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { ROBOTICS_STANDARD_CATALOG } from "../../ai/engineering/robotics-standard-catalog";

const DEFAULT_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/boctavian2014-ux/C-A-V-A-L-Studio@main/libraries/robotics-standard";

export function getRoboticsLibraryCdnBase(): string {
  const env = process.env.ROBOTICS_LIBRARY_CDN_BASE?.trim();
  if (env) return env.replace(/\/+$/, "");
  return DEFAULT_CDN_BASE;
}

function cacheRoot(): string {
  return path.join(app.getPath("userData"), "robotics-library");
}

function safeRelPath(rel: string): string | null {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) return null;
  return cleaned;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function getCatalogFromCacheOrCdn(): Promise<{
  ok: boolean;
  catalog?: Record<string, { path: string; format: "scad" | "stl"; tags: string[]; label?: string }>;
  source?: "cdn" | "bundled" | "cache";
  error?: string;
}> {
  const rel = "metadata/components.json";
  const cached = await ensureCachedFile(rel);
  if (cached.ok && cached.localPath) {
    try {
      const text = await fs.readFile(cached.localPath, "utf8");
      const catalog = JSON.parse(text) as Record<
        string,
        { path: string; format: "scad" | "stl"; tags: string[]; label?: string }
      >;
      return { ok: true, catalog, source: cached.fromCache ? "cache" : "cdn" };
    } catch (err) {
      return {
        ok: true,
        catalog: ROBOTICS_STANDARD_CATALOG,
        source: "bundled",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { ok: true, catalog: ROBOTICS_STANDARD_CATALOG, source: "bundled" };
}

export async function ensureCachedFile(relPath: string): Promise<{
  ok: boolean;
  localPath?: string;
  fromCache?: boolean;
  etag?: string | null;
  error?: string;
}> {
  const rel = safeRelPath(relPath);
  if (!rel) return { ok: false, error: "Invalid library path." };

  const localPath = path.join(cacheRoot(), rel);
  const metaPath = `${localPath}.meta.json`;

  try {
    await fs.access(localPath);
    let etag: string | null = null;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as { etag?: string };
      etag = meta.etag ?? null;
    } catch {
      /* no meta */
    }
    // Soft refresh in background if etag known — sync path returns cache hit.
    void softRefresh(rel, localPath, metaPath, etag);
    return { ok: true, localPath, fromCache: true, etag };
  } catch {
    /* miss */
  }

  return downloadToCache(rel, localPath, metaPath);
}

async function softRefresh(
  rel: string,
  localPath: string,
  metaPath: string,
  etag: string | null
): Promise<void> {
  try {
    const url = `${getRoboticsLibraryCdnBase()}/${rel}`;
    const headers: Record<string, string> = {};
    if (etag) headers["If-None-Match"] = etag;
    const res = await fetch(url, { headers });
    if (res.status === 304) return;
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir(path.dirname(localPath));
    await fs.writeFile(localPath, buf);
    const newEtag = res.headers.get("etag");
    await fs.writeFile(metaPath, JSON.stringify({ etag: newEtag, fetchedAt: Date.now() }));
  } catch {
    /* ignore background refresh errors */
  }
}

async function downloadToCache(
  rel: string,
  localPath: string,
  metaPath: string
): Promise<{
  ok: boolean;
  localPath?: string;
  fromCache?: boolean;
  etag?: string | null;
  error?: string;
}> {
  const url = `${getRoboticsLibraryCdnBase()}/${rel}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Dev fallback: read from repo checkout if present
      const repoLocal = path.join(process.cwd(), "libraries", "robotics-standard", rel);
      try {
        await fs.access(repoLocal);
        await ensureDir(path.dirname(localPath));
        await fs.copyFile(repoLocal, localPath);
        return { ok: true, localPath, fromCache: false, etag: null };
      } catch {
        return { ok: false, error: `CDN ${res.status} for ${rel}` };
      }
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir(path.dirname(localPath));
    await fs.writeFile(localPath, buf);
    const etag = res.headers.get("etag");
    await fs.writeFile(metaPath, JSON.stringify({ etag, fetchedAt: Date.now() }));
    return { ok: true, localPath, fromCache: false, etag };
  } catch (err) {
    const repoLocal = path.join(process.cwd(), "libraries", "robotics-standard", rel);
    try {
      await fs.access(repoLocal);
      await ensureDir(path.dirname(localPath));
      await fs.copyFile(repoLocal, localPath);
      return { ok: true, localPath, fromCache: false };
    } catch {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export async function resolveStandardComponent(standardKey: string): Promise<{
  ok: boolean;
  key?: string;
  path?: string;
  format?: "scad" | "stl";
  localPath?: string;
  contentText?: string;
  contentBase64?: string;
  error?: string;
}> {
  const catalogResult = await getCatalogFromCacheOrCdn();
  const catalog = catalogResult.catalog ?? ROBOTICS_STANDARD_CATALOG;
  const entry = catalog[standardKey] ?? ROBOTICS_STANDARD_CATALOG[standardKey];
  if (!entry) {
    return { ok: false, error: `Unknown standard key: ${standardKey}` };
  }

  const cached = await ensureCachedFile(entry.path);
  if (!cached.ok || !cached.localPath) {
    return { ok: false, error: cached.error ?? "Cache miss" };
  }

  if (entry.format === "scad") {
    const contentText = await fs.readFile(cached.localPath, "utf8");
    return {
      ok: true,
      key: standardKey,
      path: entry.path,
      format: "scad",
      localPath: cached.localPath,
      contentText,
    };
  }

  const buf = await fs.readFile(cached.localPath);
  return {
    ok: true,
    key: standardKey,
    path: entry.path,
    format: "stl",
    localPath: cached.localPath,
    contentBase64: buf.toString("base64"),
  };
}
