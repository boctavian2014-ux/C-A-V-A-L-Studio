import { ContextExpander } from "../context/context-expander";
import { warmCacheManager } from "../../context/warm-cache/warm-cache-manager";
import { zeroLatencyCache, type ZeroLatencyCache } from "./zl-cache";
import type { ZLSignals } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";

export class ZLContextPreloader {
  constructor(
    private readonly expander = new ContextExpander(),
    private readonly cache: ZeroLatencyCache = zeroLatencyCache
  ) {}

  async preload(signals: ZLSignals): Promise<void> {
    console.log(`${ZL_LOG_PREFIX} preload context`);
    warmCacheManager.predictAndWarm({
      activeFile: signals.activeFile,
      openFiles: signals.openFiles,
      userAction: "zl.context",
      objectiveDraft: signals.objectiveDraft,
    });

    if (!signals.objectiveDraft?.trim()) return;
    const context = await this.expander.expand(signals.objectiveDraft, signals.workspaceRoot, 12);
    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: signals.objectiveDraft,
      context,
    });
  }
}

export const zlContextPreloader = new ZLContextPreloader();
