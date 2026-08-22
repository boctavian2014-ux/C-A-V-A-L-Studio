/**
 * Pas 7d.1 — walk workspace and build WorkspaceIndex (no glob dependency).
 */

import fs from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_INDEX_DIR_EXCLUDES,
  WORKSPACE_INDEX_EXTENSIONS,
  WORKSPACE_INDEX_FILE_EXCLUDES,
  WORKSPACE_INDEX_MAX_FILE_BYTES,
  WORKSPACE_INDEX_MAX_FILES,
  emptyWorkspaceIndex,
  normalizeIndexRelativePath,
  type IndexedFile,
  type WorkspaceIndex,
} from "../../shared/workspace-index-contract";
import { parseIndexedFile } from "./workspace-indexer";

const SECRET_NAME_RE = /^\.env(\..+)?$/i;
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".pdf",
  ".zip",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".wasm",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".node",
]);

export function shouldSkipDirName(name: string): boolean {
  return WORKSPACE_INDEX_DIR_EXCLUDES.has(name) || name === "release" || name === "release-fixed";
}

export function isIndexableRelativePath(relativePath: string): boolean {
  const rel = normalizeIndexRelativePath(relativePath);
  if (!rel || rel.includes("\0")) return false;
  const parts = rel.split("/");
  if (parts.some((p) => shouldSkipDirName(p))) return false;
  const base = parts[parts.length - 1] ?? "";
  if (SECRET_NAME_RE.test(base)) return false;
  if (WORKSPACE_INDEX_FILE_EXCLUDES.has(base)) return false;
  const ext = path.extname(base).toLowerCase();
  if (BINARY_EXT.has(ext)) return false;
  return WORKSPACE_INDEX_EXTENSIONS.has(ext);
}

export async function indexSingleFile(
  workspaceRoot: string,
  relativePath: string
): Promise<IndexedFile | null> {
  const rel = normalizeIndexRelativePath(relativePath);
  if (!isIndexableRelativePath(rel)) return null;
  const absolute = path.join(workspaceRoot, ...rel.split("/"));
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile() || stat.size > WORKSPACE_INDEX_MAX_FILE_BYTES) return null;
    const content = await fs.readFile(absolute, "utf8");
    return parseIndexedFile(rel, content, stat.size);
  } catch {
    return null;
  }
}

export async function scanWorkspace(
  workspaceRoot: string,
  options?: { maxFiles?: number; maxFileBytes?: number }
): Promise<WorkspaceIndex> {
  const root = path.resolve(workspaceRoot);
  const maxFiles = options?.maxFiles ?? WORKSPACE_INDEX_MAX_FILES;
  const maxFileBytes = options?.maxFileBytes ?? WORKSPACE_INDEX_MAX_FILE_BYTES;
  const indexed: IndexedFile[] = [];

  async function walk(dir: string): Promise<void> {
    if (indexed.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (indexed.length >= maxFiles) return;
      if (entry.name === "." || entry.name === "..") continue;
      if (entry.isDirectory()) {
        if (shouldSkipDirName(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;

      const absolute = path.join(dir, entry.name);
      const rel = normalizeIndexRelativePath(path.relative(root, absolute));
      if (!isIndexableRelativePath(rel)) continue;

      try {
        const stat = await fs.stat(absolute);
        if (stat.size > maxFileBytes) continue;
        const content = await fs.readFile(absolute, "utf8");
        indexed.push(parseIndexedFile(rel, content, stat.size));
      } catch {
        /* unreadable / encoding */
      }
    }
  }

  await walk(root);

  return {
    files: indexed,
    lastFullScan: Date.now(),
    totalFiles: indexed.length,
  };
}

export function upsertIndexedFile(
  index: WorkspaceIndex,
  file: IndexedFile
): WorkspaceIndex {
  const files = index.files.filter((f) => f.path !== file.path);
  files.push(file);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    lastFullScan: index.lastFullScan,
    totalFiles: files.length,
  };
}

export function removeIndexedFile(
  index: WorkspaceIndex,
  relativePath: string
): WorkspaceIndex {
  const rel = normalizeIndexRelativePath(relativePath);
  const files = index.files.filter((f) => f.path !== rel);
  return {
    files,
    lastFullScan: index.lastFullScan,
    totalFiles: files.length,
  };
}

export function createEmptyIndex(): WorkspaceIndex {
  return emptyWorkspaceIndex();
}
