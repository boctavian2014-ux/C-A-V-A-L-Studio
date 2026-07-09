import type { ComposerContext } from "../types";
import type { ZLCacheEntry, ZLPartialPlan } from "./zl-types";
import { createHash } from "node:crypto";

function hashObjective(objectiveDraft: string): string {
  const normalized = objectiveDraft.trim().toLowerCase();
  if (normalized.length <= 512) return normalized;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export class ZeroLatencyCache {
  private readonly entries = new Map<string, ZLCacheEntry>();

  key(workspaceRoot: string, objectiveDraft = ""): string {
    return `${workspaceRoot}::${hashObjective(objectiveDraft)}`;
  }

  get(workspaceRoot: string, objectiveDraft = ""): ZLCacheEntry | undefined {
    return this.entries.get(this.key(workspaceRoot, objectiveDraft));
  }

  upsert(input: {
    workspaceRoot: string;
    objectiveDraft?: string;
    context?: ComposerContext;
    partialPlan?: ZLPartialPlan;
    warmedModels?: string[];
  }): ZLCacheEntry {
    const key = this.key(input.workspaceRoot, input.objectiveDraft);
    const existing = this.entries.get(key);
    const entry: ZLCacheEntry = {
      key,
      workspaceRoot: input.workspaceRoot,
      context: input.context ?? existing?.context,
      partialPlan: input.partialPlan ?? existing?.partialPlan,
      warmedModels: Array.from(new Set([...(existing?.warmedModels ?? []), ...(input.warmedModels ?? [])])),
      updatedAt: Date.now(),
    };
    this.entries.set(key, entry);
    return entry;
  }

  list(): ZLCacheEntry[] {
    return Array.from(this.entries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  clearWorkspace(workspaceRoot: string): void {
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(`${workspaceRoot}::`)) this.entries.delete(key);
    }
  }
}

export const zeroLatencyCache = new ZeroLatencyCache();
