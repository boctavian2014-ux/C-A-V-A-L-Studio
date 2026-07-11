import { getAutoBalancedModelCandidates } from '../../models/auto-router';
import type { ModelSelectionId } from '../../models/model-catalog';
import type { ArenaAgentRole, ExecutionPlan } from './types';
import type { ModelRotator } from './orchestrator';

export interface ArenaModelPlan {
  primaryModel: string;
  roleModelMap: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>>;
  summary: string;
}

export function buildArenaModelPlan(
  primaryModel: ModelSelectionId,
  rotator: ModelRotator
): ArenaModelPlan {
  const coding = getAutoBalancedModelCandidates('kilocode');
  const planning = getAutoBalancedModelCandidates('planning');
  const analysis = getAutoBalancedModelCandidates('analysis');

  const pick = (pool: string[], fallback: string) => pool[0] ?? rotator.next(fallback) ?? fallback;

  const roleModelMap: ArenaModelPlan['roleModelMap'] = {
    coordinator: pick(planning, primaryModel),
    architect: pick(planning, primaryModel),
    implementer: primaryModel,
    tester: pick(coding, primaryModel),
    refactorer: pick(coding, primaryModel),
    'implementer-fix': primaryModel,
    'implementer-perf': primaryModel,
  };

  return {
    primaryModel,
    roleModelMap,
    summary: `Models: architect=${roleModelMap.architect}, implementer=${primaryModel}`,
  };
}

export function applyRoleModelsToPlan(
  plan: ExecutionPlan,
  tasks: Array<{ id: string; role?: ArenaAgentRole }>,
  roleModelMap: ArenaModelPlan['roleModelMap'],
  rotator: ModelRotator
): ExecutionPlan {
  const taskDistributionMap = { ...plan.taskDistributionMap };
  for (const task of tasks) {
    const role = task.role ?? 'implementer';
    taskDistributionMap[task.id] =
      roleModelMap[role] ?? roleModelMap.implementer ?? rotator.next();
  }
  return { ...plan, taskDistributionMap, roleModelMap };
}
