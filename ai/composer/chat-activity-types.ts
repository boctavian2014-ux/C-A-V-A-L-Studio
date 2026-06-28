export type ChatActivityPhase =
  | 'prepare'
  | 'route'
  | 'connect'
  | 'think'
  | 'write';

export type MultiAgentPhase =
  | 'memory'
  | 'integrate'
  | 'context'
  | 'orchestrator'
  | 'decompose'
  | 'subagent'
  | 'merge'
  | 'supervisor'
  | 'compose';

export const MULTI_AGENT_LABELS: Record<MultiAgentPhase, string> = {
  memory: 'Memory',
  integrate: 'Integrate',
  context: 'Context',
  orchestrator: 'Orchestrator',
  decompose: 'Decompose',
  subagent: 'Sub-Agents',
  merge: 'Merge',
  supervisor: 'Review',
  compose: 'Compose',
};

export function formatMultiAgentStatus(phase: MultiAgentPhase, detail?: string): string {
  const label = MULTI_AGENT_LABELS[phase] ?? phase;
  return detail ? `${label} · ${detail}` : `${label}…`;
}

export type ChatActivityStepStatus = 'pending' | 'active' | 'done';

export interface ChatActivityStep {
  id: ChatActivityPhase;
  label: string;
  status: ChatActivityStepStatus;
  detail?: string;
}

export const CHAT_ACTIVITY_LABELS: Record<ChatActivityPhase, string> = {
  prepare: 'Pregătesc context',
  route: 'Aleg modelul',
  connect: 'Conectez',
  think: 'Reasoning',
  write: 'Scriu răspunsul',
};

export function createInitialActivitySteps(
  prepDone = false,
  connectDone = false,
  routeHint?: string
): ChatActivityStep[] {
  const routeDone = prepDone && Boolean(routeHint);
  return [
    {
      id: 'prepare',
      label: CHAT_ACTIVITY_LABELS.prepare,
      status: prepDone ? 'done' : 'active',
    },
    {
      id: 'route',
      label: CHAT_ACTIVITY_LABELS.route,
      status: routeDone ? 'done' : prepDone ? 'active' : 'pending',
      detail: routeHint,
    },
    {
      id: 'connect',
      label: CHAT_ACTIVITY_LABELS.connect,
      status: connectDone ? 'done' : routeDone || prepDone ? 'active' : 'pending',
    },
    {
      id: 'think',
      label: CHAT_ACTIVITY_LABELS.think,
      status: connectDone ? 'active' : 'pending',
    },
    {
      id: 'write',
      label: CHAT_ACTIVITY_LABELS.write,
      status: 'pending',
    },
  ];
}

export function patchActivityStep(
  steps: ChatActivityStep[],
  phase: ChatActivityPhase,
  status: 'active' | 'done',
  detail?: string
): ChatActivityStep[] {
  const idx = steps.findIndex((s) => s.id === phase);
  if (idx < 0) return steps;

  const next = steps.map((s) => ({ ...s }));
  next[idx] = {
    ...next[idx]!,
    status: status === 'done' ? 'done' : 'active',
    detail: detail ?? next[idx]!.detail,
  };

  if (status === 'done') {
    const nextPending = next.findIndex((s, i) => i > idx && s.status === 'pending');
    if (nextPending >= 0) {
      next[nextPending] = { ...next[nextPending]!, status: 'active' };
    }
  }

  return next;
}

export function markAllActivityDone(steps: ChatActivityStep[]): ChatActivityStep[] {
  return steps.map((s) => ({ ...s, status: 'done' as const }));
}

export interface MultiAgentStepRecord {
  phase: MultiAgentPhase;
  status: 'active' | 'done';
  detail?: string;
  at: number;
}

/** Accumulate multi-agent pipeline steps for Arena timeline UI. */
export function patchMultiAgentSteps(
  steps: MultiAgentStepRecord[] | undefined,
  phase: MultiAgentPhase,
  status: 'active' | 'done',
  detail?: string
): MultiAgentStepRecord[] {
  const next = [...(steps ?? [])];
  const now = Date.now();
  const idx = next.findIndex((s) => s.phase === phase);

  if (status === 'active') {
    for (let i = 0; i < next.length; i++) {
      if (next[i]!.status === 'active' && next[i]!.phase !== phase) {
        next[i] = { ...next[i]!, status: 'done' };
      }
    }
    if (idx >= 0) {
      next[idx] = { ...next[idx]!, status: 'active', detail: detail ?? next[idx]!.detail, at: now };
    } else {
      next.push({ phase, status: 'active', detail, at: now });
    }
    return next;
  }

  if (idx >= 0) {
    next[idx] = { ...next[idx]!, status: 'done', detail: detail ?? next[idx]!.detail, at: now };
  } else {
    next.push({ phase, status: 'done', detail, at: now });
  }
  return next;
}
