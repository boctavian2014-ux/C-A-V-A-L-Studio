import fs from "node:fs/promises";
import path from "node:path";

import type { PreloadStage, PreloadStrategyName } from "./preload-events";

export type PreloadEntryStatus = "idle" | "warming" | "ready" | "failed" | "evicted";

export interface PreloadCacheEntry {
  modelId: string;
  provider: string;
  stage: PreloadStage;
  status: PreloadEntryStatus;
  warmedAt: number;
  lastUsed: number;
  lastAccessed: number;
  priority: number;
  strategy: PreloadStrategyName;
  hitCount: number;
  missCount: number;
  latencyMs?: number;
  error?: string;
}

export interface PreloadHistoryRecord {
  modelId: string;
  stage: PreloadStage;
  intent?: string;
  timestamp: number;
  hit: boolean;
}

export interface PreloadCacheSnapshot {
  entries: PreloadCacheEntry[];
  history: PreloadHistoryRecord[];
  adaptiveWeights: Record<string, number>;
}

const MAX_ENTRIES = 6;
const MAX_HISTORY = 200;
const DEFAULT_TTL_MS = 15 * 60_000;

export class PreloadCache {
  private readonly entries = new Map<string, PreloadCacheEntry>();
  private history: PreloadHistoryRecord[] = [];
  private adaptiveWeights: Record<string, number> = {};
  private workspaceRoot: string | null = null;

  configure(workspaceRoot: string | null): void {
    this.workspaceRoot = workspaceRoot;
  }

  private cacheKey(modelId: string, stage: PreloadStage): string {
    return `${modelId}::${stage}`;
  }

  get(modelId: string, stage: PreloadStage): PreloadCacheEntry | undefined {
    const entry = this.entries.get(this.cacheKey(modelId, stage));
    if (!entry) return undefined;
    entry.lastAccessed = Date.now();
    return entry;
  }

  isReady(modelId: string, stage: PreloadStage): boolean {
    const entry = this.get(modelId, stage);
    if (!entry || entry.status !== "ready") return false;
    if (Date.now() - entry.warmedAt > DEFAULT_TTL_MS) {
      entry.status = "idle";
      return false;
    }
    return true;
  }

  setWarming(
    modelId: string,
    provider: string,
    stage: PreloadStage,
    strategy: PreloadStrategyName,
    priority: number
  ): PreloadCacheEntry {
    const key = this.cacheKey(modelId, stage);
    const existing = this.entries.get(key);
    const entry: PreloadCacheEntry = {
      modelId,
      provider,
      stage,
      status: "warming",
      warmedAt: Date.now(),
      lastUsed: existing?.lastUsed ?? 0,
      lastAccessed: Date.now(),
      priority,
      strategy,
      hitCount: existing?.hitCount ?? 0,
      missCount: existing?.missCount ?? 0,
    };
    this.entries.set(key, entry);
    this.enforceCapacity();
    return entry;
  }

  markReady(modelId: string, stage: PreloadStage, latencyMs?: number): PreloadCacheEntry | undefined {
    const entry = this.entries.get(this.cacheKey(modelId, stage));
    if (!entry) return undefined;
    entry.status = "ready";
    entry.warmedAt = Date.now();
    entry.lastAccessed = Date.now();
    if (latencyMs !== undefined) entry.latencyMs = latencyMs;
    entry.error = undefined;
    return entry;
  }

  markFailed(modelId: string, stage: PreloadStage, error: string): void {
    const entry = this.entries.get(this.cacheKey(modelId, stage));
    if (!entry) return;
    entry.status = "failed";
    entry.error = error;
    entry.lastAccessed = Date.now();
  }

  touch(modelId: string, stage: PreloadStage, hit: boolean): void {
    const entry = this.entries.get(this.cacheKey(modelId, stage));
    if (entry) {
      entry.lastUsed = Date.now();
      entry.lastAccessed = Date.now();
      if (hit) entry.hitCount += 1;
      else entry.missCount += 1;
    }
    this.recordHistory({ modelId, stage, timestamp: Date.now(), hit });
    this.updateAdaptiveWeight(modelId, hit);
  }

  list(): PreloadCacheEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => b.priority - a.priority);
  }

  listEvictable(excludeModelIds: string[] = []): PreloadCacheEntry[] {
    const exclude = new Set(excludeModelIds);
    return this.list().filter(
      (e) =>
        !exclude.has(e.modelId) &&
        (e.status === "ready" || e.status === "failed") &&
        Date.now() - e.lastUsed > 60_000
    );
  }

  evict(modelId: string, stage: PreloadStage): boolean {
    const key = this.cacheKey(modelId, stage);
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.status = "evicted";
    this.entries.delete(key);
    return true;
  }

  getAdaptiveWeight(modelId: string): number {
    return this.adaptiveWeights[modelId] ?? 1;
  }

  getHistory(): PreloadHistoryRecord[] {
    return [...this.history];
  }

  getSnapshot(): PreloadCacheSnapshot {
    return {
      entries: this.list(),
      history: this.getHistory(),
      adaptiveWeights: { ...this.adaptiveWeights },
    };
  }

  async persist(): Promise<void> {
    if (!this.workspaceRoot) return;
    const dir = path.join(this.workspaceRoot, ".caval");
    const file = path.join(dir, "preload-cache.json");
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(this.getSnapshot(), null, 2), "utf8");
    } catch {
      // disk cache is best-effort
    }
  }

  async restore(): Promise<void> {
    if (!this.workspaceRoot) return;
    const file = path.join(this.workspaceRoot, ".caval", "preload-cache.json");
    try {
      const raw = await fs.readFile(file, "utf8");
      const snapshot = JSON.parse(raw) as PreloadCacheSnapshot;
      this.history = snapshot.history?.slice(-MAX_HISTORY) ?? [];
      this.adaptiveWeights = snapshot.adaptiveWeights ?? {};
      for (const entry of snapshot.entries ?? []) {
        if (entry.status === "warming") entry.status = "idle";
        this.entries.set(this.cacheKey(entry.modelId, entry.stage), entry);
      }
    } catch {
      // no cache yet
    }
  }

  private recordHistory(record: PreloadHistoryRecord): void {
    this.history.push(record);
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }
  }

  private updateAdaptiveWeight(modelId: string, hit: boolean): void {
    const current = this.adaptiveWeights[modelId] ?? 1;
    this.adaptiveWeights[modelId] = hit
      ? Math.min(2, current + 0.05)
      : Math.max(0.25, current - 0.03);
  }

  private enforceCapacity(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const sorted = this.list().sort((a, b) => {
      const scoreA = a.priority + a.hitCount * 2 - (Date.now() - a.lastUsed) / 600_000;
      const scoreB = b.priority + b.hitCount * 2 - (Date.now() - b.lastUsed) / 600_000;
      return scoreA - scoreB;
    });
    while (this.entries.size > MAX_ENTRIES && sorted.length > 0) {
      const victim = sorted.shift();
      if (!victim) break;
      this.evict(victim.modelId, victim.stage);
    }
  }
}
