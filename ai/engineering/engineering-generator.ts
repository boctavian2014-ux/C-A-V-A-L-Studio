// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — generator (markdown pipeline)
// ──────────────────────────────────────────────────────────────

import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import type { ApiKeys } from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { completeViaChatStream } from './engineering-stream';
import {
  describeRoboticsStreamRoute,
  resolveRoboticsDeepCompleteRoute,
  resolveRoboticsLiveStreamRoute,
  roboticsRetryUserSuffix,
} from './robotics-stream-routing';
import {
  ROBOTICS_AI_ULTRA_RETRY_SUFFIX,
} from '../prompts/robotics-ai-ultra';
import {
  CAVALLO_MODES_TEST_ROBOTICS_FIXTURE,
  isCavalloModesTestRequest,
} from '../prompts/cavallo-mode-protocol';
import {
  missingRoboticsSections,
  missingRecommendedRoboticsSections,
  parseRoboticsPlan,
  roboticsPlanToEngProject,
  extractScadBlock,
  type ParsedRoboticsPlan,
} from './robotics-format';
import { decomposeRoboticsComponents } from './robotics-decompose';
import { ROBOTICS_STANDARD_CATALOG } from './robotics-standard-catalog';
import type { RoboticsComponentBom } from './robotics-components-schema';

export interface SpecData {
  title: string;
  summary: string;
  dimensions: string;
  weight: string;
  materials: string[];
  tolerances: string;
}

export interface SchemaNode {
  id: string;
  label: string;
  role: 'mcu' | 'sensor' | 'power' | 'actuator' | 'io';
}

export interface SchemaData {
  nodes: SchemaNode[];
  connections: { from: string; to: string; label: string }[];
  powerBudget: string;
  protocols: string[];
}

export interface PartItem {
  name: string;
  qty: number;
  unitPrice: number;
  currency: string;
  shop: string;
  shopUrl: string;
  substitute?: string;
}

export interface BuildFile {
  name: string;
  kind: 'stl' | 'firmware' | 'wiring' | 'doc';
  note: string;
  content?: string;
}

export interface EngProject {
  spec: SpecData;
  schema: SchemaData;
  parts: PartItem[];
  build: BuildFile[];
}

export interface GenerateResult {
  ok: boolean;
  project?: EngProject;
  plan?: ParsedRoboticsPlan;
  bom?: RoboticsComponentBom;
  error?: string;
  warning?: string;
  raw?: string;
  resolvedModel?: string;
  /** How the completion was obtained — fallback must not fake live section progress. */
  streamingMode?: 'streaming' | 'fallback';
}

type CavalAiComplete = (input: {
  model: string;
  intent?: string;
  capability?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  workspaceRoot?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}) => Promise<
  | { ok: true; text: string; resolvedModel: string; provider: string }
  | { ok: false; error: string }
>;

async function runRoboticsCompletion(params: {
  prompt: string;
  modelId: ModelSelectionId;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  retryIncomplete?: boolean;
  onDelta?: (chunk: string) => void;
  onStreamStart?: (streamId: string) => void;
  onReasoningActivity?: () => void;
  onStreamingMode?: (mode: 'streaming' | 'fallback') => void;
}): Promise<
  | {
      ok: true;
      text: string;
      resolvedModel?: string;
      streamingMode: 'streaming' | 'fallback';
      warning?: string;
    }
  | { ok: false; error: string; aborted?: boolean }
> {
  const live = resolveRoboticsLiveStreamRoute(params.modelId);
  console.log(describeRoboticsStreamRoute(live, params.modelId));

  const userContent = params.retryIncomplete
    ? `${params.prompt.trim()}${roboticsRetryUserSuffix(live.promptProfile)}`
    : params.prompt.trim();

  const streamMessages = [
    { role: 'system' as const, content: live.systemPrompt },
    { role: 'user' as const, content: userContent },
  ];

  const caval = (window as unknown as { caval?: { aiComplete?: CavalAiComplete } }).caval;

  params.onStreamingMode?.('streaming');
  let streamResult = await completeViaChatStream({
    model: live.modelId,
    intent: live.intent,
    maxTokens: live.maxTokens,
    messages: streamMessages,
    workspaceRoot: params.workspaceRoot,
    signal: params.signal,
    onDelta: params.onDelta,
    onStreamStart: params.onStreamStart,
    onReasoningActivity: params.onReasoningActivity,
    retryAttempt: 0,
  });

  // Retry at most once, and only before the first document delta.
  // After deltas started, idle/watchdog is an interrupted stream — retry would duplicate content.
  const canRetryBeforeFirstToken =
    !streamResult.ok &&
    !streamResult.aborted &&
    !params.signal?.aborted &&
    (streamResult.deltaChars ?? 0) === 0;

  if (canRetryBeforeFirstToken) {
    console.warn(
      '[robotics] chatStream attempt 1 failed before first token, retrying once:',
      streamResult.error ?? 'unknown'
    );
    streamResult = await completeViaChatStream({
      model: live.modelId,
      intent: live.intent,
      maxTokens: live.maxTokens,
      messages: streamMessages,
      workspaceRoot: params.workspaceRoot,
      signal: params.signal,
      onDelta: params.onDelta,
      onStreamStart: params.onStreamStart,
      onReasoningActivity: params.onReasoningActivity,
      retryAttempt: 1,
    });
  }

  // Stream path: document text is delta-only (never reasoning-merged).
  if (streamResult.ok) {
    return {
      ok: true,
      text: streamResult.text,
      resolvedModel: streamResult.resolvedModel,
      streamingMode: 'streaming',
    };
  }

  // Interrupted after deltas: keep partial document, do not retry or aiComplete.
  if (!streamResult.aborted && (streamResult.deltaChars ?? 0) > 0) {
    const partial = streamResult.partialText?.trim() ?? '';
    console.warn(
      '[robotics] stream interrupted after deltas — keeping partial, no retry/fallback',
      streamResult.error ?? 'unknown'
    );
    return {
      ok: true,
      text: partial,
      resolvedModel: undefined,
      streamingMode: 'streaming',
      warning: streamResult.error,
    };
  }

  // Last-resort non-stream fallback: ULTRA + caller model (deep path).
  if (caval?.aiComplete && !streamResult.aborted) {
    const reason = streamResult.error ?? 'unknown';
    const deep = resolveRoboticsDeepCompleteRoute(params.modelId);
    console.warn(
      '[robotics] chatStream failed before first token ×2 → aiComplete fallback:',
      reason,
      `deep model=${deep.modelId} prompt=${deep.promptProfile}`
    );
    params.onStreamingMode?.('fallback');
    const deepUser = params.retryIncomplete
      ? `${params.prompt.trim()}${ROBOTICS_AI_ULTRA_RETRY_SUFFIX}`
      : params.prompt.trim();
    const completeResult = await caval.aiComplete({
      model: deep.modelId,
      intent: deep.intent,
      capability: 'planning',
      workspaceRoot: params.workspaceRoot ?? undefined,
      maxTokens: deep.maxTokens,
      temperature: 0.2,
      timeoutMs: 180_000,
      messages: [
        { role: 'system', content: deep.systemPrompt },
        { role: 'user', content: deepUser },
      ],
    });

    if (completeResult.ok && completeResult.text.trim()) {
      return {
        ok: true,
        text: completeResult.text,
        resolvedModel: completeResult.resolvedModel,
        streamingMode: 'fallback',
        warning: `Stream indisponibil (${reason}) — răspuns livrat fără progres live.`,
      };
    }
  }

  return streamResult;
}

export async function generateEngineering(params: {
  prompt: string;
  modelId: ModelSelectionId;
  /** @deprecated Ignored — keys live only in main process. */
  apiKeys?: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  onDelta?: (chunk: string) => void;
  onStreamStart?: (streamId: string) => void;
  onReasoningActivity?: () => void;
  onStreamingMode?: (mode: 'streaming' | 'fallback') => void;
  /** Fired when markdown plan is ready, before BOM decompose (so UI can end loading). */
  onPlanReady?: (partial: GenerateResult) => void;
}): Promise<GenerateResult> {
  const {
    prompt,
    modelId,
    workspaceRoot,
    signal,
    onDelta,
    onStreamStart,
    onReasoningActivity,
    onStreamingMode,
    onPlanReady,
  } = params;

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  if (isCavalloModesTestRequest(prompt)) {
    const plan = parseRoboticsPlan(CAVALLO_MODES_TEST_ROBOTICS_FIXTURE);
    const project = roboticsPlanToEngProject(plan);
    const partial: GenerateResult = {
      ok: true,
      plan,
      project,
      raw: CAVALLO_MODES_TEST_ROBOTICS_FIXTURE,
      resolvedModel: 'cavallo-modes-test',
    };
    onPlanReady?.(partial);
    return partial;
  }

  try {
    const liveGuard = resolveRoboticsLiveStreamRoute(modelId);
    assertRendererChatAllowed({
      prompt: prompt.trim(),
      system: liveGuard.systemPrompt,
      workspaceRoot: workspaceRoot ?? undefined,
      capability: 'chat',
      intent: liveGuard.intent,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }

  let result = await runRoboticsCompletion({
    prompt,
    modelId,
    workspaceRoot,
    signal,
    onDelta,
    onStreamStart,
    onReasoningActivity,
    onStreamingMode,
  });

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  if (!result.ok) {
    return { ok: false, error: result.error, streamingMode: 'streaming' };
  }

  if (!result.text.trim()) {
    return {
      ok: false,
      error:
        'Modelul a răspuns fără document markdown (doar raționament sau gol). Încearcă din nou sau alt model.',
      streamingMode: result.streamingMode,
    };
  }

  let plan = parseRoboticsPlan(result.text);
  let missing = missingRoboticsSections(plan);

  if (missing.length > 0) {
    // Retry is a new stream — panel resets collector on onStreamStart.
    const retry = await runRoboticsCompletion({
      prompt,
      modelId,
      workspaceRoot,
      signal,
      retryIncomplete: true,
      onDelta,
      onStreamStart,
      onReasoningActivity,
      onStreamingMode,
    });

    if (signal?.aborted) {
      return { ok: false, error: 'Generare anulată.' };
    }

    if (retry.ok && retry.text.trim().length > result.text.trim().length) {
      result = retry;
      plan = parseRoboticsPlan(retry.text);
      missing = missingRoboticsSections(plan);
    }
  }

  if (!plan.rawMarkdown.trim()) {
    return {
      ok: false,
      error: 'Modelul nu a returnat un plan markdown valid.',
      raw: result.text,
      streamingMode: result.streamingMode,
    };
  }

  if (missing.length > 0) {
    const hasUsableContent =
      Boolean(extractScadBlock(plan.rawMarkdown)) ||
      plan.partsListRows.length > 0 ||
      plan.rawMarkdown.trim().length > 600;

    if (hasUsableContent) {
      const project = roboticsPlanToEngProject(plan);
      const partialWarning = `Plan parțial — lipsesc: ${missing.join(', ')}. Poți regenera sau completa manual în tab-uri.`;
      onPlanReady?.({
        ok: true,
        project,
        plan,
        raw: result.text,
        resolvedModel: result.resolvedModel,
        warning: partialWarning,
        streamingMode: result.streamingMode,
      });
      let bom: RoboticsComponentBom | undefined;
      try {
        const decomp = await decomposeRoboticsComponents({
          prompt,
          planMarkdown: plan.rawMarkdown,
          modelId,
          workspaceRoot,
          signal,
          catalog: ROBOTICS_STANDARD_CATALOG,
        });
        if (decomp.ok) bom = decomp.bom;
      } catch {
        /* soft */
      }
      return {
        ok: true,
        project,
        plan,
        bom,
        raw: result.text,
        resolvedModel: result.resolvedModel,
        warning: partialWarning,
        streamingMode: result.streamingMode,
      };
    }

    return {
      ok: false,
      error: `Plan incomplet — lipsesc secțiunile: ${missing.join(', ')}. Încearcă Auto Frontier sau un model mai capabil.`,
      raw: result.text,
      plan,
      streamingMode: result.streamingMode,
    };
  }

  const project = roboticsPlanToEngProject(plan);

  // Soft-warning tier: all hard-required sections are present, but the model
  // may have silently dropped recommended sections (simulation, collision,
  // animation, etc.). Surface them instead of letting them vanish.
  const missingRecommended = missingRecommendedRoboticsSections(plan);
  const recommendedWarning =
    missingRecommended.length > 0
      ? `Secțiuni recomandate lipsă: ${missingRecommended.join(', ')}. Planul e utilizabil, dar poți regenera pentru acoperire completă.`
      : undefined;

  onPlanReady?.({
    ok: true,
    project,
    plan,
    raw: result.text,
    resolvedModel: result.resolvedModel,
    warning: recommendedWarning,
    streamingMode: result.streamingMode,
  });

  let bom: RoboticsComponentBom | undefined;
  let bomWarning: string | undefined;
  try {
    const decomp = await decomposeRoboticsComponents({
      prompt,
      planMarkdown: plan.rawMarkdown,
      modelId,
      workspaceRoot,
      signal,
      catalog: ROBOTICS_STANDARD_CATALOG,
    });
    if (decomp.ok) {
      bom = decomp.bom;
    } else {
      bomWarning = `Decompose componente: ${decomp.error}`;
    }
  } catch (err) {
    bomWarning = err instanceof Error ? err.message : String(err);
  }

  const warnings = [
    result.ok ? result.warning : undefined,
    recommendedWarning,
    bomWarning,
  ].filter(Boolean);

  return {
    ok: true,
    project,
    plan,
    bom,
    raw: result.text,
    resolvedModel: result.resolvedModel,
    warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    streamingMode: result.streamingMode,
  };
}
