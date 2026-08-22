/**
 * Pas 7d.1 — recursive fs.watch with debounce (no chokidar dependency).
 */

import fs from "node:fs";
import path from "node:path";

import {
  WORKSPACE_INDEX_WATCH_DEBOUNCE_MS,
  normalizeIndexRelativePath,
} from "../../shared/workspace-index-contract";
import { isIndexableRelativePath, shouldSkipDirName } from "./workspace-scan";

export type WorkspaceWatchHandlers = {
  onUpsert: (relativePath: string) => void;
  onRemove: (relativePath: string) => void;
};

export type StopWorkspaceWatch = () => void;

function pathLooksRemoved(workspaceRoot: string, relativePath: string): boolean {
  const absolute = path.join(workspaceRoot, ...relativePath.split("/"));
  return !fs.existsSync(absolute);
}

/**
 * Watch a workspace for indexable file changes.
 * Uses Node `fs.watch({ recursive: true })` — supported on Windows/macOS;
 * on platforms without recursive watch, falls back to root-only (full rescan trigger via onUpsert("*")).
 */
export function watchWorkspace(
  workspaceRoot: string,
  handlers: WorkspaceWatchHandlers,
  options?: { debounceMs?: number }
): StopWorkspaceWatch {
  const root = path.resolve(workspaceRoot);
  const debounceMs = options?.debounceMs ?? WORKSPACE_INDEX_WATCH_DEBOUNCE_MS;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const schedule = (relativePath: string): void => {
    const rel = normalizeIndexRelativePath(relativePath);
    if (!rel || !isIndexableRelativePath(rel)) return;
    const parts = rel.split("/");
    if (parts.some((p) => shouldSkipDirName(p))) return;

    const existing = timers.get(rel);
    if (existing) clearTimeout(existing);
    timers.set(
      rel,
      setTimeout(() => {
        timers.delete(rel);
        if (pathLooksRemoved(root, rel)) {
          handlers.onRemove(rel);
        } else {
          handlers.onUpsert(rel);
        }
      }, debounceMs)
    );
  };

  let watcher: fs.FSWatcher | null = null;
  try {
    watcher = fs.watch(root, { recursive: true }, (_eventType, filename) => {
      if (filename == null || filename === "") return;
      const rel = typeof filename === "string" ? filename : String(filename);
      schedule(rel);
    });
  } catch {
    // recursive unsupported — no live watch; caller may rely on full scan
    watcher = null;
  }

  return () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    try {
      watcher?.close();
    } catch {
      /* already closed */
    }
    watcher = null;
  };
}
