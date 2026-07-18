import type { MultiAgentStepRecord } from './chat-activity-types';
import type { PipelineRecapMeta } from './multi-agent/types';
import type { ArenaAgentRole } from './multi-agent/types';

export type RoleMapRoleId = ArenaAgentRole | 'architect' | 'coordinator';

export interface RoleMapEntry {
  role: RoleMapRoleId;
  label: string;
  modelId: string;
  isUserPrimary?: boolean;
}

export const ROLE_DISPLAY_ORDER: RoleMapRoleId[] = [
  'coordinator',
  'architect',
  'implementer',
  'tester',
  'refactorer',
  'implementer-fix',
  'implementer-perf',
];

export const ROLE_LABELS: Record<RoleMapRoleId, string> = {
  coordinator: 'Coordinator',
  architect: 'Architect',
  implementer: 'Implementer',
  tester: 'Tester',
  refactorer: 'Refactorer',
  'implementer-fix': 'Implementer (fix)',
  'implementer-perf': 'Implementer (perf)',
};

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function modelsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = normalizeModelId(a);
  const nb = normalizeModelId(b);
  if (na === nb) return true;
  const ta = na.split('/').pop() ?? na;
  const tb = nb.split('/').pop() ?? nb;
  return ta === tb;
}

function entriesFromRoleModelMap(
  map: Partial<Record<RoleMapRoleId, string>>,
  userModel?: string
): RoleMapEntry[] {
  const entries: RoleMapEntry[] = [];
  for (const role of ROLE_DISPLAY_ORDER) {
    const modelId = map[role]?.trim();
    if (!modelId) continue;
    entries.push({
      role,
      label: ROLE_LABELS[role],
      modelId,
      isUserPrimary: role === 'implementer' && modelsMatch(modelId, userModel),
    });
  }
  return entries;
}

function entriesFromSteps(steps: MultiAgentStepRecord[], userModel?: string): RoleMapEntry[] {
  const byRole = new Map<RoleMapRoleId, string>();
  for (const step of steps) {
    if (!step.stepId?.startsWith('modelOrch-') || !step.modelId?.trim()) continue;
    const roleKey = step.stepId.slice('modelOrch-'.length).replace(/_/g, '-') as RoleMapRoleId;
    if (!ROLE_LABELS[roleKey]) continue;
    if (!byRole.has(roleKey)) {
      byRole.set(roleKey, step.modelId.trim());
    }
  }
  return entriesFromRoleModelMap(Object.fromEntries(byRole) as Partial<Record<RoleMapRoleId, string>>, userModel);
}

/** Build ordered role → model entries for recap panel (meta first, timeline fallback). */
export function buildRoleMapEntries(
  meta?: PipelineRecapMeta | null,
  steps?: MultiAgentStepRecord[] | null,
  userModel?: string
): RoleMapEntry[] {
  const fromMeta = meta?.roleModelMap ? entriesFromRoleModelMap(meta.roleModelMap, userModel) : [];
  if (fromMeta.length > 0) return fromMeta;
  if (steps?.length) return entriesFromSteps(steps, userModel);
  return [];
}

export function hasModelOrchSteps(steps?: MultiAgentStepRecord[] | null): boolean {
  return Boolean(steps?.some((s) => s.stepId?.startsWith('modelOrch-')));
}
