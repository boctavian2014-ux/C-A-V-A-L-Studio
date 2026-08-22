/**
 * Pas 7d.1 — orchestrates load/scan/watch for the workspace structure index.
 * Read-only toward project sources; writes only workspace-index.json under .cavalo/ai.
 */

import {
  emptyWorkspaceIndex,
  type WorkspaceIndex,
  type WorkspaceIndexSummary,
} from "../../shared/workspace-index-contract";
import { watchWorkspace, type StopWorkspaceWatch } from "./file-watcher";
import {
  loadWorkspaceIndex,
  saveWorkspaceIndex,
} from "./workspace-index-store";
import {
  indexSingleFile,
  removeIndexedFile,
  scanWorkspace,
  upsertIndexedFile,
} from "./workspace-scan";

export class WorkspaceIndexService {
  private root: string | null = null;
  private index: WorkspaceIndex = emptyWorkspaceIndex();
  private indexing = false;
  private stopWatch: StopWorkspaceWatch | null = null;
  private scanGeneration = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  getSummary(): WorkspaceIndexSummary {
    return {
      totalFiles: this.index.totalFiles,
      lastFullScan: this.index.lastFullScan,
      indexing: this.indexing,
      workspaceRoot: this.root,
    };
  }

  getIndex(): WorkspaceIndex {
    return this.index;
  }

  /**
   * Bind to a workspace: load cache, start watcher, kick off non-blocking full scan.
   */
  async openWorkspace(workspaceRoot: string): Promise<WorkspaceIndexSummary> {
    await this.close();
    const root = workspaceRoot.trim();
    if (!root) return this.getSummary();

    this.root = root;
    const cached = await loadWorkspaceIndex(root);
    this.index = cached ?? emptyWorkspaceIndex();

    this.stopWatch = watchWorkspace(root, {
      onUpsert: (rel) => {
        void this.reindexPath(rel);
      },
      onRemove: (rel) => {
        this.index = removeIndexedFile(this.index, rel);
        this.schedulePersist();
      },
    });

    void this.refreshFull();
    return this.getSummary();
  }

  async close(): Promise<void> {
    this.scanGeneration += 1;
    this.stopWatch?.();
    this.stopWatch = null;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.root && this.index.totalFiles > 0) {
      try {
        await saveWorkspaceIndex(this.root, this.index);
      } catch {
        /* best effort */
      }
    }
    this.root = null;
    this.index = emptyWorkspaceIndex();
    this.indexing = false;
  }

  async refreshFull(): Promise<WorkspaceIndex> {
    const root = this.root;
    if (!root) return this.index;
    const gen = ++this.scanGeneration;
    this.indexing = true;
    try {
      const next = await scanWorkspace(root);
      if (gen !== this.scanGeneration || this.root !== root) return this.index;
      this.index = next;
      await saveWorkspaceIndex(root, this.index);
      return this.index;
    } finally {
      if (gen === this.scanGeneration) this.indexing = false;
    }
  }

  async reindexPath(relativePath: string): Promise<void> {
    const root = this.root;
    if (!root) return;
    const file = await indexSingleFile(root, relativePath);
    if (!file) {
      this.index = removeIndexedFile(this.index, relativePath);
    } else {
      this.index = upsertIndexedFile(this.index, file);
    }
    this.schedulePersist();
  }

  /** Test helper: wait until a full scan is not in flight (or timeout). */
  async waitUntilIdle(timeoutMs = 15_000): Promise<WorkspaceIndex> {
    const started = Date.now();
    while (this.indexing && Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 25));
    }
    return this.index;
  }

  private schedulePersist(): void {
    const root = this.root;
    if (!root) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void saveWorkspaceIndex(root, this.index).catch(() => undefined);
    }, 400);
  }
}

/** Process-wide singleton used by Electron main. */
export const workspaceIndexService = new WorkspaceIndexService();
