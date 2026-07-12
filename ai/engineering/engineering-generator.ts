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
  missingRoboticsSections,
  parseRoboticsPlan,
  roboticsPlanToEngProject,
  extractScadBlock,
  type ParsedRoboticsPlan,
} from './robotics-format';

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
  error?: string;
  warning?: string;
  raw?: string;
  resolvedModel?: string;
}

const ROBOTICS_INTENT = 'deep_thinking' as const;

type CavalAiComplete = (input: {
  model: string;
  intent?: string;
  capability?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  workspaceRoot?: string;
  apiKeys?: ApiKeys;
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
  apiKeys: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  retryIncomplete?: boolean;
}): Promise<
  | { ok: true; text: string; resolvedModel?: string }
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

  const streamResult = await completeViaChatStream({
    model: params.modelId,
    messages,
    workspaceRoot: params.workspaceRoot,
    signal: params.signal,
  });

  if (streamResult.ok) return streamResult;

  if (caval?.aiComplete) {
    const completeResult = await caval.aiComplete({
      model: params.modelId,
      intent: ROBOTICS_INTENT,
      capability: 'planning',
      workspaceRoot: params.workspaceRoot ?? undefined,
      apiKeys: params.apiKeys,
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
      };
    }
  }

  return streamResult;
}

export async function generateEngineering(params: {
  prompt: string;
  modelId: ModelSelectionId;
  apiKeys: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
}): Promise<GenerateResult> {
  const { prompt, modelId, apiKeys, workspaceRoot, signal } = params;

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
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
    apiKeys,
    workspaceRoot,
    signal,
  });

  if (signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  let plan = parseRoboticsPlan(result.text);
  let missing = missingRoboticsSections(plan);

  if (missing.length > 0) {
    const retry = await runRoboticsCompletion({
      prompt,
      modelId,
      apiKeys,
      workspaceRoot,
      signal,
      retryIncomplete: true,
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
    };
  }

  if (missing.length > 0) {
    const hasUsableContent =
      Boolean(extractScadBlock(plan.rawMarkdown)) ||
      plan.partsListRows.length > 0 ||
      plan.rawMarkdown.trim().length > 600;

    if (hasUsableContent) {
      const project = roboticsPlanToEngProject(plan);
      return {
        ok: true,
        project,
        plan,
        raw: result.text,
        resolvedModel: result.resolvedModel,
        warning: `Plan parțial — lipsesc: ${missing.join(', ')}. Poți regenera sau completa manual în tab-uri.`,
      };
    }

    return {
      ok: false,
      error: `Plan incomplet — lipsesc secțiunile: ${missing.join(', ')}. Încearcă Auto Frontier sau un model mai capabil.`,
      raw: result.text,
      plan,
    };
  }

  const project = roboticsPlanToEngProject(plan);

  return {
    ok: true,
    project,
    plan,
    raw: result.text,
    resolvedModel: result.resolvedModel,
  };
}
