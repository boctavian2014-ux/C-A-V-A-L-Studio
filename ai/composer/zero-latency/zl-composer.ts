import { createHash } from "node:crypto";
import { warmCacheManager } from "../../context/warm-cache/warm-cache-manager";
import { zeroLatencyCache, type ZeroLatencyCache } from "./zl-cache";
import { loadZeroLatencyConfig } from "./zl-config";
import { zlContextPreloader, type ZLContextPreloader } from "./zl-context-preloader";
import { zlModelPreloader, type ZLModelPreloader } from "./zl-model-preloader";
import { zlPreplanner, type ZLPreplanner } from "./zl-preplanner";
import { zlScheduler, type ZLScheduler } from "./zl-scheduler";
import type { ZLComposerSnapshot, ZLSignals } from "./zl-types";
import { ZL_LOG_PREFIX } from "./zl-types";

export class ZeroLatencyComposer {
  private lastPrepareKey = "";
  private lastPrepareAt = 0;

  constructor(
    private readonly scheduler: ZLScheduler = zlScheduler,
    private readonly contextPreloader: ZLContextPreloader = zlContextPreloader,
    private readonly modelPreloader: ZLModelPreloader = zlModelPreloader,
    private readonly preplanner: ZLPreplanner = zlPreplanner,
    private readonly cache: ZeroLatencyCache = zeroLatencyCache
  ) {}

  /** Called while the user is typing or focusing Composer. */
  prepare(signals: ZLSignals): string {
    const cfg = loadZeroLatencyConfig(signals.workspaceRoot);
    if (!cfg.enabled) return this.scheduler.createToken();

    const draft = signals.objectiveDraft?.trim() ?? "";
    const prepareKey = createHash("sha256")
      .update(`${signals.workspaceRoot}::${draft}`)
      .digest("hex")
      .slice(0, 20);
    const now = Date.now();
    const debounceMs = Math.max(cfg.typingDebounceMs, 300);
    if (prepareKey === this.lastPrepareKey && now - this.lastPrepareAt < debounceMs * 2) {
      return this.scheduler.createToken();
    }
    this.lastPrepareKey = prepareKey;
    this.lastPrepareAt = now;

    const tokenId = this.scheduler.createToken();
    console.log(`${ZL_LOG_PREFIX} prepare ${signals.workspaceRoot}`);

    this.scheduler.schedule({
      type: "warm-cache",
      priority: "HIGH",
      tokenId,
      run: async () => {
        await warmCacheManager.ensureWarm({
          workspaceRoot: signals.workspaceRoot,
          files: signals.openFiles?.map((file) => ({ path: file })),
          activeFile: signals.activeFile,
          reason: "predictive",
          tokenId,
        });
      },
    });

    this.scheduler.schedule({
      type: "context",
      priority: "HIGH",
      tokenId,
      run: () => this.contextPreloader.preload(signals),
    });

    this.scheduler.schedule({
      type: "model",
      priority: "MEDIUM",
      tokenId,
      run: async () => this.modelPreloader.preload(signals),
    });

    this.scheduler.schedule({
      type: "preplan",
      priority: "LOW",
      tokenId,
      run: async () => {
        if (cfg.draftPlan === 'off') return;
        if (cfg.draftPlan === 'stub') {
          this.preplanner.preplan(signals);
          return;
        }
        await this.preplanner.preplanAsync(signals, cfg.draftPlan);
      },
    });

    return tokenId;
  }

  cancel(tokenId: string): void {
    this.scheduler.cancel(tokenId);
  }

  getCached(workspaceRoot: string, objectiveDraft = "") {
    return this.cache.get(workspaceRoot, objectiveDraft);
  }

  snapshot(): ZLComposerSnapshot {
    return {
      entries: this.cache.list(),
      ...this.scheduler.stats(),
    };
  }
}

export const zeroLatencyComposer = new ZeroLatencyComposer();
