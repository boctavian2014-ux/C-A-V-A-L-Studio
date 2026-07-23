/**
 * Semantic decomposer + standard/custom classifier for Robotics Chat.
 */

import type { ApiKeys } from '../multi-model/provider';
import type { ModelSelectionId } from '../models/model-catalog';
import { assertRendererChatAllowed } from '../safety/renderer-chat-guard';
import {
  extractJsonObject,
  parseRoboticsComponentBom,
  type RoboticsBomComponent,
  type RoboticsComponentBom,
} from './robotics-components-schema';
import {
  classifyAgainstCatalog,
  formatCatalogKeysForPrompt,
  type RoboticsCatalogEntry,
} from './robotics-standard-catalog';

export const ROBOTICS_DECOMPOSE_SYSTEM = `You are the Cavallo Robotics Component Decomposer.
Given a robot / mechanism description (and optional hardware plan excerpt), output ONLY valid JSON:

{
  "components": [
    {
      "id": "servo_bracket_mg996r",
      "name": "MG996R servo bracket",
      "category": "mechanical",
      "mode": "standard",
      "standardKey": "mg996r_servo_bracket",
      "dimensions": { "width": 40, "height": 20, "depth": 3, "unit": "mm" },
      "material": "PLA",
      "qty": 12,
      "notes": "optional"
    }
  ],
  "assemblyHints": "short assembly tip"
}

Rules:
- Decompose into printable / fabricate-able parts (frame, brackets, mounts, holders, hubs, covers). Do NOT list purchased electronics as STL parts (MCU, battery cells, raw servos) unless a printable mount/holder is needed.
- mode=standard ONLY when standardKey matches a known catalog key (list provided in user message).
- mode=custom for chassis, unique enclosures, articulated links, one-off mounts.
- dimensions in mm when known.
- qty >= 1.
- Prefer 4–20 components for a typical robot; expand for hexapods etc.
- Output JSON only, no markdown commentary.`;

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

function reclassifyBom(
  bom: RoboticsComponentBom,
  catalog: Record<string, RoboticsCatalogEntry>
): RoboticsComponentBom {
  return {
    ...bom,
    components: bom.components.map((c) => classifyAgainstCatalog(c, catalog)),
  };
}

export async function decomposeRoboticsComponents(params: {
  prompt: string;
  planMarkdown?: string;
  modelId: ModelSelectionId;
  apiKeys: ApiKeys;
  workspaceRoot?: string | null;
  signal?: AbortSignal;
  catalog?: Record<string, RoboticsCatalogEntry>;
}): Promise<
  | { ok: true; bom: RoboticsComponentBom; raw?: string }
  | { ok: false; error: string }
> {
  if (params.signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  const catalogKeys = formatCatalogKeysForPrompt(params.catalog);
  const userContent = [
    `User request:\n${params.prompt.trim()}`,
    params.planMarkdown
      ? `Hardware plan excerpt:\n${params.planMarkdown.slice(0, 6_000)}`
      : '',
    `Known standard catalog keys (use as standardKey when applicable):\n${catalogKeys}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    assertRendererChatAllowed({
      prompt: userContent,
      system: ROBOTICS_DECOMPOSE_SYSTEM,
      workspaceRoot: params.workspaceRoot ?? undefined,
      capability: 'planning',
      intent: 'planning',
    });
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const caval = (window as unknown as { caval?: { aiComplete?: CavalAiComplete } }).caval;
  if (!caval?.aiComplete) {
    return { ok: false, error: 'aiComplete indisponibil pentru decompose.' };
  }

  const result = await caval.aiComplete({
    model: params.modelId,
    intent: 'planning',
    capability: 'planning',
    workspaceRoot: params.workspaceRoot ?? undefined,
    apiKeys: params.apiKeys,
    jsonMode: true,
    maxTokens: 4096,
    temperature: 0.15,
    timeoutMs: 90_000,
    messages: [
      { role: 'system', content: ROBOTICS_DECOMPOSE_SYSTEM },
      { role: 'user', content: userContent },
    ],
  });

  if (params.signal?.aborted) {
    return { ok: false, error: 'Generare anulată.' };
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const parsed = parseRoboticsComponentBom(extractJsonObject(result.text));
  if (!parsed) {
    return { ok: false, error: 'Decomposer: JSON componente invalid.', };
  }

  const bom = reclassifyBom(parsed, params.catalog ?? {});
  return { ok: true, bom, raw: result.text };
}

export function summarizeBomModes(components: RoboticsBomComponent[]): string {
  const std = components.filter((c) => c.mode === 'standard').length;
  const custom = components.filter((c) => c.mode === 'custom').length;
  return `${std} standard din librărie · ${custom} custom OpenSCAD`;
}
