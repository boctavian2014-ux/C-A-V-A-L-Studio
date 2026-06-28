import type { ComposerContext, ComposerPlan } from "../types";

export type ZLPriority = "HIGH" | "MEDIUM" | "LOW";
export type ZLTaskType = "context" | "model" | "preplan" | "warm-cache";

export interface ZLCancellationToken {
  id: string;
  cancelled: boolean;
}

export interface ZLSignals {
  workspaceRoot: string;
  objectiveDraft?: string;
  activeFile?: string;
  openFiles?: string[];
  language?: string;
  projectType?: string;
  selectedModel?: string;
}

export type DraftPlanStatus = 'draft' | 'accepted' | 'replaced' | 'discarded';

export interface ZLPartialPlan {
  planId: string;
  objective: string;
  plan: ComposerPlan;
  confidence: number;
  createdAt: number;
  status: DraftPlanStatus;
  source: 'stub' | 'fast-llm' | 'frontier-llm';
}

export interface ZLCacheEntry {
  key: string;
  workspaceRoot: string;
  context?: ComposerContext;
  partialPlan?: ZLPartialPlan;
  warmedModels: string[];
  updatedAt: number;
}

export interface ZLScheduledTask {
  id: string;
  type: ZLTaskType;
  priority: ZLPriority;
  run: () => Promise<void>;
  tokenId?: string;
}

export interface ZLComposerSnapshot {
  entries: ZLCacheEntry[];
  queued: number;
  running: number;
}

export const ZL_LOG_PREFIX = "[ZL-COMPOSER]";
