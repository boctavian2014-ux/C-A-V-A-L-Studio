import { randomUUID } from 'node:crypto';

import { preloadManager } from '../../preload/preload-manager';
import { resolveModelSelection } from '../../models/auto-router';
import type { ModelSelectionId } from '../../models/model-catalog';
import { zeroLatencyCache, type ZeroLatencyCache } from './zl-cache';
import { isFrontierSelection, loadZeroLatencyConfig } from './zl-config';
import type { ZLSignals } from './zl-types';
import { ZL_LOG_PREFIX } from './zl-types';

export class ZLModelPreloader {
  constructor(private readonly cache: ZeroLatencyCache = zeroLatencyCache) {}

  async preload(signals: ZLSignals): Promise<void> {
    const cfg = loadZeroLatencyConfig(signals.workspaceRoot);
    if (!cfg.enabled) return;

    const models = new Set<string>(['stepfun-step-3-7-flash']);

    if (signals.selectedModel) {
      try {
        const resolved = await resolveModelSelection(
          signals.selectedModel as ModelSelectionId,
          'fallback'
        );
        models.add(resolved.modelId);
        if (cfg.frontierPrewarm && isFrontierSelection(signals.selectedModel)) {
          models.add('nex-n2-pro');
        }
      } catch {
        /* ignore */
      }
    }

    for (const model of models) {
      console.log(`${ZL_LOG_PREFIX} preload model ${model}`);
      void preloadManager.warmModel(model, 'chat');
    }

    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: signals.objectiveDraft,
      warmedModels: Array.from(models),
    });
  }

  /** Models pre-warmed for this workspace/objective (Zero-Latency Fusion API). */
  getModelBundle(workspaceRoot: string, objectiveDraft = ''): string[] {
    const cached = this.cache.get(workspaceRoot, objectiveDraft);
    return cached?.warmedModels ?? [];
  }
}

export const zlModelPreloader = new ZLModelPreloader();
