import { describe, expect, it } from 'vitest';
import { ModelRotator, planExecution } from '../../../ai/composer/multi-agent/orchestrator';

describe('orchestrator', () => {
  it('assigns models to each task in distribution map', async () => {
    const rotator = new ModelRotator();
    await rotator.init();
    const tasks = [
      { id: 'a1', module: 'core', purpose: 'p', description: 'd1', dependencies: [] },
      { id: 'a2', module: 'api', purpose: 'p', description: 'd2', dependencies: [] },
    ];
    const plan = planExecution('run-1', tasks, rotator);
    expect(plan.taskDistributionMap.a1).toBeTruthy();
    expect(plan.taskDistributionMap.a2).toBeTruthy();
    expect(plan.agentOrder).toContain('compose');
  });
});
