// ──────────────────────────────────────────────────────────────
//  Robotics AI ULTRA — generator (markdown pipeline)
// ──────────────────────────────────────────────────────────────

import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import type { ApiKeys } from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { completeViaChatStream } from './engineering-stream';
import {
  ROBOTICS_AI_ULTRA_RETRY_SUFFIX,
  ROBOTICS_AI_ULTRA_SYSTEM_PROMPT,
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

const ROBOTICS_INTENT = 'deep_thinking' as const;

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
  | { ok: true; text: string; resolvedModel?: string; streamingMode: 'streaming' | 'fallback' }
  | { ok: false; error: string }
> {
  const userContent = params.retryIncomplete
    ? `${params.prompt.trim()}${ROBOTICS_AI_ULTRA_RETRY_SUFFIX}`
    : params.prompt.trim();

  const messages = [
    { role: 'system' as const, content: ROBOTICS_AI_ULTRA_SYSTEM_PROMPT },
    { role: 'user' as const, content: userContent },
  ];

  const caval = (window as unknown as { caval?: { aiComplete?: CavalAiComplete } }).caval;

  params.onStreamingMode?.('streaming');
  const streamResult = await completeViaChatStream({
    model: params.modelId,
    messages,
    workspaceRoot: params.workspaceRoot,
    signal: params.signal,
    onDelta: params.onDelta,
    onStreamStart: params.onStreamStart,
    onReasoningActivity: params.onReasoningActivity,
  });

  // Stream path: document text is delta-only (never reasoning-merged).
  if (streamResult.ok) {
    return {
      ok: true,
      text: streamResult.text,
      resolvedModel: streamResult.resolvedModel,
      streamingMode: 'streaming',
    };
  }

  // Non-stream fallback: explicit mode, no fake live section progress.
  if (caval?.aiComplete) {
    params.onStreamingMode?.('fallback');
    const completeResult = await caval.aiComplete({
      model: params.modelId,
      intent: ROBOTICS_INTENT,
      capability: 'planning',
      workspaceRoot: params.workspaceRoot ?? undefined,
      maxTokens: 16384,
      temperature: 0.2,
      timeoutMs: 180_000,
      messages,
    });

    if (completeResult.ok) {
      return {
        ok: true,
        text: completeResult.text,
        resolvedModel: completeResult.resolvedModel,
        streamingMode: 'fallback',
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
    assertRendererChatAllowed({
      prompt: prompt.trim(),
      system: ROBOTICS_AI_ULTRA_SYSTEM_PROMPT,
      workspaceRoot: workspaceRoot ?? undefined,
      capability: 'chat',
      intent: 'kilocode',
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

  const warnings = [recommendedWarning, bomWarning].filter(Boolean);

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
