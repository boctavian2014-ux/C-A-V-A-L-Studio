import { describe, expect, it } from 'vitest';

import {
  mergeArenaModelPlans,
  parseModelOrchestratorOutput,
} from '../../ai/composer/multi-agent/model-orchestrator-parser';
import { buildArenaModelPlan } from '../../ai/composer/multi-agent/arena-model-orchestrator';
import { ModelRotator } from '../../ai/composer/multi-agent/orchestrator';
import { patchMultiAgentSteps } from '../../ai/composer/chat-activity-types';

describe('model-orchestrator-parser', () => {
  const allowed = new Set(['stepfun-step-3-7-flash', 'nex-n2-pro', 'gemini-2.5-flash']);

  it('parses **Model Assignments** block', () => {
    const raw = `
**Model Assignments**
- coordinator: nex-n2-pro
- architect: nex-n2-pro
- implementer: stepfun-step-3-7-flash
- tester: gemini-2.5-flash
- refactorer: stepfun-step-3-7-flash
`;
    const map = parseModelOrchestratorOutput(raw, allowed, 'stepfun-step-3-7-flash');
    expect(map.coordinator).toBe('nex-n2-pro');
    expect(map.implementer).toBe('stepfun-step-3-7-flash');
    expect(map.tester).toBe('gemini-2.5-flash');
  });

  it('merges LLM map over heuristic plan', () => {
    const rotator = new ModelRotator();
    const heuristic = buildArenaModelPlan('stepfun-step-3-7-flash', rotator);
    const merged = mergeArenaModelPlans(heuristic, {
      architect: 'nex-n2-pro',
      implementer: 'gemini-2.5-flash',
    });
    expect(merged.roleModelMap.architect).toBe('nex-n2-pro');
    expect(merged.roleModelMap.implementer).toBe('gemini-2.5-flash');
    expect(merged.summary).toContain('architect=nex-n2-pro');
  });
});

describe('patchMultiAgentSteps per-model', () => {
  it('keeps separate subagent steps by stepId', () => {
    let steps = patchMultiAgentSteps(
      undefined,
      'subagent',
      'active',
      'api',
      'gemini-2.5-flash',
      'subagent-1.1'
    );
    steps = patchMultiAgentSteps(
      steps,
      'subagent',
      'done',
      'api',
      'gemini-2.5-flash',
      'subagent-1.1'
    );
    steps = patchMultiAgentSteps(
      steps,
      'subagent',
      'active',
      'ui',
      'stepfun-step-3-7-flash',
      'subagent-1.2'
    );
    expect(steps.filter((s) => s.stepId?.startsWith('subagent-'))).toHaveLength(2);
    expect(steps.find((s) => s.stepId === 'subagent-1.2')?.modelId).toBe('stepfun-step-3-7-flash');
  });
});
