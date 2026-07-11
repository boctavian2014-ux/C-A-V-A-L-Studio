import { describe, expect, it } from 'vitest';
import { buildArenaModelPlan } from '../../ai/composer/multi-agent/arena-model-orchestrator';
import { ModelRotator } from '../../ai/composer/multi-agent/orchestrator';

describe('arena-model-orchestrator', () => {
  it('assigns role models', async () => {
    const rotator = new ModelRotator();
    await rotator.init();
    const plan = buildArenaModelPlan('stepfun-step-3-7-flash', rotator);
    expect(plan.roleModelMap.implementer).toBe('stepfun-step-3-7-flash');
    expect(plan.roleModelMap.architect).toBeTruthy();
  });
});
