import { FallbackOpenSourceProvider } from "./providers/fallback-open-source";
import { ModelFallbackPlanner } from "./model-fallback";
import { ModelLogger } from "./model-logger";
import { getModelProfile, type ModelProfile, type ModelProviderId } from "./model-profiles";
import { ModelRetryPolicy } from "./model-retry";
import { ModelScorer, type ModelScoreBreakdown } from "./model-scorer";
import { ModelTimeouts } from "./model-timeouts";
import { NvidiaProvider } from "./providers/nvidia";
import { NorthProvider } from "./providers/north";
import { OpenRouterProvider } from "./providers/openrouter";
import { PoolsideProvider } from "./providers/poolside";
import type { ModelCapability, ModelDescriptor, ModelProvider, ModelRequest, ModelResponse, ModelStreamChunk } from "./types";
import type { AITaskDescriptor } from "./models/model-types";
import { preloadModel } from "./models/model-preload";

export interface RouterOptions {
  maxAttempts: number;
  fallbackEnabled: boolean;
  timeoutMs?: number;
}

export interface RankedModel {
  model: ModelProfile;
  score: number;
  breakdown: ModelScoreBreakdown;
  reasons: string[];
}

export interface ModelSelection {
  provider: ModelProviderId;
  model: string;
  reason: string;
  score: number;
}

export class ModelRouter {
  private readonly providers: ModelProvider[];
  private readonly options: RouterOptions;
  private readonly scorer: ModelScorer;
  private readonly fallback: ModelFallbackPlanner;
  private readonly retry: ModelRetryPolicy;
  private readonly timeouts: ModelTimeouts;
  private readonly logger: ModelLogger;

  constructor(providers: ModelProvider[] = [
    new PoolsideProvider(),
    new OpenRouterProvider(),
    new NvidiaProvider(),
    new NorthProvider(),
    new FallbackOpenSourceProvider()
  ], options: Partial<RouterOptions> = {}, dependencies: {
    scorer?: ModelScorer;
    fallback?: ModelFallbackPlanner;
    retry?: ModelRetryPolicy;
    timeouts?: ModelTimeouts;
    logger?: ModelLogger;
  } = {}) {
    this.providers = providers;
    this.options = {
      maxAttempts: 3,
      fallbackEnabled: true,
      ...options
    };
    this.scorer = dependencies.scorer ?? new ModelScorer();
    this.fallback = dependencies.fallback ?? new ModelFallbackPlanner();
    this.retry = dependencies.retry ?? new ModelRetryPolicy(this.options.maxAttempts);
    this.timeouts = dependencies.timeouts ?? new ModelTimeouts();
    this.logger = dependencies.logger ?? new ModelLogger();
  }

  listModels(capability?: ModelCapability): ModelDescriptor[] {
    return this.providers
      .flatMap((provider) => provider.models())
      .filter((model) => !capability || model.capabilities.includes(capability))
      .sort((a, b) => b.priority - a.priority);
  }

  rank(request: ModelRequest): RankedModel[] {
    const preferred = request.metadata?.preferredModel as string | undefined;
    const ranked = this.fallback.candidatesFor(request).candidates
      .filter((model) => model.capabilities.includes(request.capability))
      .filter((model) => this.options.fallbackEnabled || model.provider !== "open_source")
      .map((model) => {
        const breakdown = this.scorer.score(model, request);
        const ranked = {
          model,
          score: breakdown.finalScore,
          breakdown,
          reasons: breakdown.reasons
        };
        this.logger.score({
          provider: model.provider,
          model: model.id,
          score: ranked.score,
          reason: ranked.reasons.join("; "),
          requestId: request.metadata?.requestId,
          metadata: { breakdown }
        });
        return ranked;
      })
      .sort((a, b) => b.score - a.score);

    if (preferred) {
      const pinned = ranked.find((r) => r.model.id === preferred);
      if (pinned) {
        return [pinned, ...ranked.filter((r) => r.model.id !== preferred)];
      }
      const profile = getModelProfile(preferred);
      if (profile && profile.capabilities.includes(request.capability)) {
        const breakdown = this.scorer.score(profile, request);
        const pinnedRanked = {
          model: profile,
          score: breakdown.finalScore + 1000,
          breakdown,
          reasons: [`Pinned model: ${preferred}`, ...breakdown.reasons]
        };
        return [pinnedRanked, ...ranked.filter((r) => r.model.id !== preferred)];
      }
    }

    return ranked;
  }

  select(request: ModelRequest): ModelSelection {
    const [best] = this.rank(request);
    if (!best) {
      throw new Error(`No Caval model profile can satisfy capability: ${request.capability}`);
    }

    const selection = this.selectionFromRanked(best);
    this.logger.selected({
      provider: selection.provider,
      model: selection.model,
      score: selection.score,
      reason: selection.reason,
      requestId: request.metadata?.requestId
    });
    return selection;
  }

  /**
   * Predict the best model for a task and preload it in the background.
   * Non-blocking — safe to call from UI or pipeline hooks.
   */
  predictModelForTask(task: AITaskDescriptor | ModelRequest): ModelSelection {
    const request: ModelRequest =
      "prompt" in task
        ? task
        : {
            prompt: "",
            capability: task.capability,
            intent: task.intent as ModelRequest["intent"],
            metadata: task.preferredModel ? { preferredModel: task.preferredModel } : undefined,
          };

    const selection = this.select(request);
    preloadModel(selection.model, { background: true, skipIfReady: true, priority: 80 });
    return selection;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const candidates = this.rank(request);
    const errors: Error[] = [];
    const failedModels: string[] = [];

    for (const ranked of candidates) {
      const { model } = ranked;
      const provider = this.providerFor(model.provider);
      if (!provider) {
        this.logger.error({
          provider: model.provider,
          model: model.id,
          reason: "No provider registered for selected model.",
          requestId: request.metadata?.requestId
        });
        continue;
      }

      this.logger.selected({
        provider: model.provider,
        model: model.id,
        score: ranked.score,
        reason: ranked.reasons.join("; "),
        requestId: request.metadata?.requestId
      });

      for (let attempt = 0; attempt < this.retry.attempts(); attempt += 1) {
        await this.delay(this.timeouts.backoffForAttempt(attempt));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeouts.timeoutForProvider(model.provider, request.timeoutMs ?? this.options.timeoutMs));

        try {
          return await provider.complete(request, model, { signal: controller.signal });
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          errors.push(normalized);
          const decision = this.retry.decide(normalized, attempt);
          this.logger.retry({
            provider: model.provider,
            model: model.id,
            reason: decision.reason,
            requestId: request.metadata?.requestId,
            metadata: { attempt, switchModel: decision.switchModel, switchProvider: decision.switchProvider }
          });

          if (!decision.retrySameModel) {
            failedModels.push(model.id);
          }

          if (decision.switchModel || decision.switchProvider) {
            break;
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    const fallbackProfiles = this.fallback.candidatesFor(request, failedModels).candidates
      .filter((model) => !failedModels.includes(model.id))
      .filter((model) => !candidates.some((ranked) => ranked.model.id === model.id));

    for (const model of fallbackProfiles) {
      const provider = this.providerFor(model.provider);
      if (!provider) {
        continue;
      }

      this.logger.fallback({
        provider: model.provider,
        model: model.id,
        reason: "Primary candidates failed; trying fallback candidate.",
        requestId: request.metadata?.requestId
      });

      for (let attempt = 0; attempt < this.retry.attempts(); attempt += 1) {
        await this.delay(this.timeouts.backoffForAttempt(attempt));
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.timeouts.timeoutForProvider(model.provider, request.timeoutMs ?? this.options.timeoutMs)
        );

        try {
          return await provider.complete(request, model, { signal: controller.signal });
        } catch (error) {
          const normalized = error instanceof Error ? error : new Error(String(error));
          errors.push(normalized);
          const decision = this.retry.decide(normalized, attempt);
          this.logger.retry({
            provider: model.provider,
            model: model.id,
            reason: decision.reason,
            requestId: request.metadata?.requestId,
            metadata: { attempt, switchModel: decision.switchModel, switchProvider: decision.switchProvider, fallback: true }
          });
          if (!decision.retrySameModel) {
            failedModels.push(model.id);
            break;
          }
        } finally {
          clearTimeout(timeout);
        }
      }
    }

    throw new AggregateError(errors, `No Caval AI model could satisfy capability: ${request.capability}`);
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    const candidates = this.rank({ ...request, stream: true }).filter(({ model }) => model.supportsStreaming);
    const errors: Error[] = [];

    for (const { model } of candidates) {
      const provider = this.providerFor(model.provider);
      if (!provider?.stream) {
        continue;
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.timeouts.timeoutForProvider(model.provider, request.timeoutMs ?? this.options.timeoutMs)
      );

      try {
        this.logger.selected({
          provider: model.provider,
          model: model.id,
          reason: "Streaming model selected.",
          requestId: request.metadata?.requestId,
        });
        yield* provider.stream(request, model, { signal: controller.signal });
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        errors.push(normalized);
        this.logger.error({
          provider: model.provider,
          model: model.id,
          reason: normalized.message,
          requestId: request.metadata?.requestId,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    if (errors.length > 0) {
      try {
        const response = await this.complete({ ...request, stream: false });
        if (response.content) {
          yield { kind: "content", text: response.content };
        }
        return;
      } catch (completeError) {
        errors.push(completeError instanceof Error ? completeError : new Error(String(completeError)));
      }
    }

    const detail = errors.map((e) => e.message).join("; ");
    throw new Error(detail || `No streaming model available for capability: ${request.capability}`);
  }

  logs() {
    return this.logger.snapshot();
  }

  private providerFor(providerId: ModelProviderId): ModelProvider | undefined {
    return this.providers.find((provider) => provider.name === providerId);
  }

  private selectionFromRanked(ranked: RankedModel): ModelSelection {
    return {
      provider: ranked.model.provider,
      model: ranked.model.id,
      reason: ranked.reasons.join("; "),
      score: ranked.score
    };
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
