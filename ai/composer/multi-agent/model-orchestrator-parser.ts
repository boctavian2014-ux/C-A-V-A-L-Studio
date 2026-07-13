import type { ArenaAgentRole } from './types';
import type { ArenaModelPlan } from './arena-model-orchestrator';

const ROLE_ALIASES: Record<string, ArenaAgentRole | 'architect' | 'coordinator'> = {
  coordinator: 'coordinator',
  architect: 'architect',
  implementer: 'implementer',
  tester: 'tester',
  refactorer: 'refactorer',
  'implementer-fix': 'implementer-fix',
  implementer_fix: 'implementer-fix',
  'implementer-perf': 'implementer-perf',
  implementer_perf: 'implementer-perf',
  merge: 'coordinator',
  supervisor: 'coordinator',
  compose: 'implementer',
  decompose: 'architect',
};

const ASSIGNMENT_LINE =
  /^\s*[-*•]?\s*(coordinator|architect|implementer|tester|refactorer|implementer-fix|implementer-perf|merge|supervisor|compose|decompose)\s*[:=→\-–>]\s*([^\s,;]+)/gim;

function normalizeModelId(raw: string): string {
  return raw.trim().replace(/^["'`]|["'`]$/g, '');
}

/** Parse LLM model orchestrator output into role → modelId map. */
export function parseModelOrchestratorOutput(
  raw: string,
  _allowedIds: Set<string>,
  primaryModel: string
): Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>> {
  const map: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>> = {};

  const jsonBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) {
        const role = ROLE_ALIASES[key.toLowerCase()];
        const mid = normalizeModelId(String(value));
        if (role && mid) map[role] = mid;
      }
    } catch {
      /* fall through to line parser */
    }
  }

  let match: RegExpExecArray | null;
  ASSIGNMENT_LINE.lastIndex = 0;
  while ((match = ASSIGNMENT_LINE.exec(raw)) !== null) {
    const roleKey = match[1]!.toLowerCase().replace(/_/g, '-');
    const role = ROLE_ALIASES[roleKey];
    const mid = normalizeModelId(match[2]!);
    if (role && mid) map[role] = mid;
  }

  const assignmentsSection = raw.match(
    /\*\*Model Assignments\*\*\s*([\s\S]*?)(?=\*\*|$)/i
  )?.[1];
  if (assignmentsSection) {
    for (const line of assignmentsSection.split('\n')) {
      const parts = line.split(/[:=→\-–>]/);
      if (parts.length < 2) continue;
      const role = ROLE_ALIASES[parts[0]!.trim().toLowerCase().replace(/_/g, '-')];
      const mid = normalizeModelId(parts.slice(1).join(':').trim());
      if (role && mid) map[role] = mid;
    }
  }

  for (const [role, mid] of Object.entries(map)) {
    if (!mid || !/^[@\w][\w@./:+-]*$/.test(mid)) {
      delete map[role as keyof typeof map];
    }
  }

  if (!map.implementer) map.implementer = primaryModel;
  if (!map.architect) map.architect = map.coordinator ?? primaryModel;
  if (!map.coordinator) map.coordinator = map.architect ?? primaryModel;

  return map;
}

export function mergeArenaModelPlans(
  heuristic: ArenaModelPlan,
  llmMap: Partial<Record<ArenaAgentRole | 'architect' | 'coordinator', string>>
): ArenaModelPlan {
  const roleModelMap = { ...heuristic.roleModelMap, ...llmMap };
  const parts = Object.entries(roleModelMap)
    .slice(0, 6)
    .map(([r, m]) => `${r}=${m?.split('/').pop() ?? m}`)
    .join(', ');
  return {
    primaryModel: heuristic.primaryModel,
    roleModelMap,
    summary: `Models: ${parts}`,
  };
}
