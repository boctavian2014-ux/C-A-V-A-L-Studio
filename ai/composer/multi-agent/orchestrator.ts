import { getAutoBalancedModelCandidates } from '../../models/auto-router';
import type { ExecutionPlan, PipelineTask } from './types';

export class ModelRotator {
  private candidates: string[] = [];
  private index = 0;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.candidates = getAutoBalancedModelCandidates('kilocode');
    if (this.candidates.length === 0) {
      this.candidates = ['stepfun-step-3-7-flash'];
    }
    this.initialized = true;
  }

  next(exclude?: string): string {
    if (!this.initialized || this.candidates.length === 0) {
      return 'stepfun-step-3-7-flash';
    }
    for (let i = 0; i < this.candidates.length; i++) {
      const model = this.candidates[this.index % this.candidates.length]!;
      this.index += 1;
      if (model !== exclude) return model;
    }
    return this.candidates[0]!;
  }
}

export function planExecution(
  runId: string,
  tasks: PipelineTask[],
  rotator: ModelRotator
): ExecutionPlan {
  const taskDistributionMap: Record<string, string> = {};
  for (const task of tasks) {
    taskDistributionMap[task.id] = rotator.next();
  }

  return {
    runId,
    agentOrder: [
      'memory',
      'integrate',
      'context',
      'orchestrator',
      'decompose',
      'subagent',
      'merge',
      'supervisor',
      'compose',
      'integrate',
    ],
    taskDistributionMap,
    createdAt: Date.now(),
  };
}
