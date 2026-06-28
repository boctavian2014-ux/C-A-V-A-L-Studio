import { randomUUID } from 'node:crypto';

import { completeModelText } from '../../pipeline/model-completion';
import type { ComposerPlan } from '../types';
import { zeroLatencyCache, type ZeroLatencyCache } from './zl-cache';
import type { ZeroLatencyDraftPlanMode } from './zl-config';
import type { ZLPartialPlan, ZLSignals } from './zl-types';
import { ZL_LOG_PREFIX } from './zl-types';

type CompleteTextFn = typeof completeModelText;

function parseDraftJson(raw: string): { goal?: string; steps?: string[] } | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as { goal?: string; steps?: string[] };
  } catch {
    return null;
  }
}

export class ZLPreplanner {
  constructor(
    private readonly cache: ZeroLatencyCache = zeroLatencyCache,
    private readonly completeText: CompleteTextFn = completeModelText
  ) {}

  preplan(signals: ZLSignals): ZLPartialPlan | null {
    const objective = signals.objectiveDraft?.trim();
    if (!objective) return null;

    const cached = this.cache.get(signals.workspaceRoot, objective);
    const relevantFiles = cached?.context?.relevantFiles ?? signals.openFiles ?? [];
    const symbols = cached?.context?.symbols.map((symbol) => symbol.name) ?? [];

    const plan: ComposerPlan = {
      objective,
      steps: [
        {
          id: 'zl-step-1',
          title: 'Load relevant context and symbols',
          rationale: 'Zero Latency Composer preloads the likely context before the full Composer request.',
          files: relevantFiles.slice(0, 8),
          symbols: symbols.slice(0, 12),
          risk: 'low',
        },
        {
          id: 'zl-step-2',
          title: 'Draft implementation plan',
          rationale: 'Use cached context as a starter plan; final Composer can replace this with model output.',
          files: relevantFiles.slice(0, 8),
          symbols: symbols.slice(0, 12),
          risk: relevantFiles.length > 8 ? 'medium' : 'low',
        },
      ],
      risks: relevantFiles.length === 0 ? ['Context is not warm yet.'] : [],
      validation: ['typecheck', 'build'],
    };

    const partial: ZLPartialPlan = {
      planId: `draft_${randomUUID().slice(0, 8)}`,
      objective,
      plan,
      confidence: relevantFiles.length > 0 ? 0.72 : 0.42,
      createdAt: Date.now(),
      status: 'draft',
      source: 'stub',
    };

    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: objective,
      partialPlan: partial,
    });
    console.log(`${ZL_LOG_PREFIX} partial plan ready (${partial.confidence})`);
    return partial;
  }

  async preplanAsync(
    signals: ZLSignals,
    mode: ZeroLatencyDraftPlanMode = 'fast-then-frontier'
  ): Promise<ZLPartialPlan | null> {
    const base = this.preplan(signals);
    if (!base || mode === 'off' || mode === 'stub') return base;

    const objective = signals.objectiveDraft?.trim() ?? '';
    const fastModel = mode === 'fast-then-frontier' ? 'stepfun-step-3-7-flash' : 'stepfun-step-3-7-flash';

    const result = await this.completeText({
      model: fastModel,
      intent: 'planning',
      capability: 'planning',
      maxTokens: 220,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Return ONLY JSON: {"goal":"...","steps":["step1","step2",...]} with 3-5 concise implementation steps in Romanian or English.',
        },
        {
          role: 'user',
          content: `Objective: ${objective}\nRelevant files: ${(signals.openFiles ?? []).slice(0, 6).join(', ') || 'unknown'}`,
        },
      ],
    });

    if (!result.ok) return base;

    const parsed = parseDraftJson(result.text);
    if (!parsed?.steps?.length) return base;

    const upgraded: ZLPartialPlan = {
      planId: base.planId,
      objective: parsed.goal ?? objective,
      confidence: Math.min(0.88, base.confidence + 0.1),
      createdAt: Date.now(),
      status: 'draft',
      source: 'fast-llm',
      plan: {
        objective: parsed.goal ?? objective,
        steps: parsed.steps.slice(0, 6).map((title, index) => ({
          id: `zl-llm-${index + 1}`,
          title,
          rationale: 'Fast draft from warm cache context',
          files: base.plan.steps[0]?.files ?? [],
          symbols: base.plan.steps[0]?.symbols ?? [],
          risk: 'low',
        })),
        risks: base.plan.risks,
        validation: base.plan.validation,
      },
    };

    this.cache.upsert({
      workspaceRoot: signals.workspaceRoot,
      objectiveDraft: objective,
      partialPlan: upgraded,
    });
    console.log(`${ZL_LOG_PREFIX} LLM partial plan ready (${upgraded.confidence})`);
    return upgraded;
  }
}

export const zlPreplanner = new ZLPreplanner();
