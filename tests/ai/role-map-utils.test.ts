import { describe, expect, it } from 'vitest';
import {
  buildRoleMapEntries,
  hasModelOrchSteps,
  ROLE_DISPLAY_ORDER,
} from '../../ai/composer/role-map-utils';
import type { PipelineRecapMeta } from '../../ai/composer/multi-agent/types';
import type { MultiAgentStepRecord } from '../../ai/composer/chat-activity-types';

describe('role-map-utils', () => {
  it('builds entries from roleModelMap in display order', () => {
    const meta: PipelineRecapMeta = {
      taskCount: 3,
      fastPipeline: true,
      pendingIssues: [],
      roleModelMap: {
        implementer: 'caval-auto/balanced',
        architect: 'nex-n2-pro',
        coordinator: 'gemini-2.5-flash',
        tester: 'stepfun/step-3.5-flash',
      },
    };
    const entries = buildRoleMapEntries(meta, undefined, 'caval-auto/balanced');
    expect(entries.map((e) => e.role)).toEqual(
      ROLE_DISPLAY_ORDER.filter((r) => meta.roleModelMap![r as keyof typeof meta.roleModelMap])
    );
    expect(entries.find((e) => e.role === 'implementer')?.isUserPrimary).toBe(true);
    expect(entries.find((e) => e.role === 'architect')?.modelId).toBe('nex-n2-pro');
  });

  it('falls back to modelOrch steps when meta is missing', () => {
    const steps: MultiAgentStepRecord[] = [
      {
        phase: 'modelOrch',
        status: 'done',
        stepId: 'modelOrch-architect',
        modelId: 'arch-model/v1',
        at: Date.now(),
      },
      {
        phase: 'modelOrch',
        status: 'done',
        stepId: 'modelOrch-implementer',
        modelId: 'code-model/v2',
        at: Date.now(),
      },
    ];
    const entries = buildRoleMapEntries(undefined, steps, 'code-model/v2');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.role).toBe('architect');
    expect(entries[1]?.role).toBe('implementer');
    expect(entries[1]?.isUserPrimary).toBe(true);
  });

  it('returns empty when meta and steps are absent', () => {
    expect(buildRoleMapEntries(undefined, undefined)).toEqual([]);
    expect(buildRoleMapEntries(null, [])).toEqual([]);
  });

  it('prefers meta over steps when both exist', () => {
    const meta: PipelineRecapMeta = {
      taskCount: 1,
      fastPipeline: false,
      pendingIssues: [],
      roleModelMap: { implementer: 'from-meta' },
    };
    const steps: MultiAgentStepRecord[] = [
      {
        phase: 'modelOrch',
        status: 'done',
        stepId: 'modelOrch-implementer',
        modelId: 'from-steps',
        at: Date.now(),
      },
    ];
    expect(buildRoleMapEntries(meta, steps)[0]?.modelId).toBe('from-meta');
  });

  it('hasModelOrchSteps detects orchestrator step ids', () => {
    expect(hasModelOrchSteps([{ phase: 'context', status: 'done', at: 0 }])).toBe(false);
    expect(
      hasModelOrchSteps([
        { phase: 'modelOrch', status: 'done', stepId: 'modelOrch-tester', at: 0 },
      ])
    ).toBe(true);
  });
});
