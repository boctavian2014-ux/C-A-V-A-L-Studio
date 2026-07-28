import { getAutoBalancedModelCandidates, FAST_CHAT_MODEL_ID } from '../../models/auto-router';
import type { ModelSelectionId } from '../../models/model-catalog';
import type { ArenaAgentRole, ExecutionPlan } from './types';
import type { ModelRotator } from './orchestrator';

/** Roles that can receive an explicit model in the Arena mix map. */
export type ArenaModelRole =
  | ArenaAgentRole
  | 'architect'
  | 'coordinator'
  | 'merge'
  | 'supervisor'
  | 'compose'
  | 'userSim'
  | 'security'
  | 'performance';

export type ArenaPromptComplexity = 'simple' | 'complex';

export interface ArenaModelPlan {
  primaryModel: string;
  roleModelMap: Partial<Record<ArenaModelRole, string>>;
  summary: string;
  complexity: ArenaPromptComplexity;
}

/** Prefer flash / low-latency ids for scan and light roles. */
export function getFastModelCandidates(): string[] {
  const coding = getAutoBalancedModelCandidates('kilocode');
  const analysis = getAutoBalancedModelCandidates('analysis');
  const flashLike = (id: string) =>
    /flash|mini|haiku|lite|fast|step-3\.7|step-3-7/i.test(id);
  const merged = [FAST_CHAT_MODEL_ID, ...coding, ...analysis];
  const preferred = merged.filter(flashLike);
  const rest = merged.filter((id) => !flashLike(id));
  return [...new Set([...preferred, ...rest])];
}

export function pickFromPool(
  pool: string[],
  fallback: string,
  rotator?: ModelRotator,
  exclude?: string
): string {
  const first = pool.find((id) => id && id !== exclude);
  if (first) return first;
  if (rotator) {
    const rotated = rotator.next(exclude ?? fallback);
    if (rotated) return rotated;
  }
  return fallback;
}

export function buildArenaModelPlan(
  primaryModel: ModelSelectionId,
  rotator: ModelRotator,
  opts?: { complexity?: ArenaPromptComplexity }
): ArenaModelPlan {
  const complexity: ArenaPromptComplexity = opts?.complexity ?? 'simple';
  const coding = getAutoBalancedModelCandidates('kilocode');
  const planning = getAutoBalancedModelCandidates('planning');
  const fast = getFastModelCandidates();

  const powerFallback = primaryModel;
  const fastModel = pickFromPool(fast, FAST_CHAT_MODEL_ID, rotator, primaryModel);
  const planningModel = pickFromPool(planning, powerFallback, rotator);
  const codingBalanced = pickFromPool(coding, primaryModel, rotator);

  // Power roles: keep primary on implement; planning pool on architect when complex.
  const architectModel =
    complexity === 'complex'
      ? pickFromPool(
          planning.filter((id) => id !== fastModel),
          planningModel,
          rotator,
          fastModel
        )
      : pickFromPool(planning, planningModel, rotator);

  const roleModelMap: ArenaModelPlan['roleModelMap'] = {
    coordinator: architectModel,
    architect: architectModel,
    implementer: primaryModel,
    'implementer-fix': primaryModel,
    'implementer-perf': primaryModel,
    // Balanced refactor on complex; flash-leaning on simple
    refactorer:
      complexity === 'complex'
        ? codingBalanced
        : pickFromPool(fast, codingBalanced, rotator),
    tester: pickFromPool(fast, codingBalanced, rotator),
    merge:
      complexity === 'complex'
        ? architectModel
        : pickFromPool(fast, architectModel, rotator),
    supervisor:
      complexity === 'complex'
        ? architectModel
        : pickFromPool(fast, architectModel, rotator),
    compose: primaryModel,
    // Scans always prefer fast/cheap
    userSim: fastModel,
    security: fastModel,
    performance: fastModel,
  };

  return {
    primaryModel,
    roleModelMap,
    complexity,
    summary:
      `Mix(${complexity}): arch=${roleModelMap.architect}, impl=${primaryModel}, ` +
      `scan=${roleModelMap.security}, test=${roleModelMap.tester}`,
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

/** Map pipeline config after complexity overrides → simple vs complex mix. */
export function complexityFromFastPipeline(fastPipeline: boolean): ArenaPromptComplexity {
  return fastPipeline ? 'simple' : 'complex';
}
