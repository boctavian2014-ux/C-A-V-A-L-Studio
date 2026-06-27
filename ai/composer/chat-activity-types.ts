export type ChatActivityPhase =
  | 'prepare'
  | 'route'
  | 'connect'
  | 'think'
  | 'write';

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
  think: 'Gândesc',
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
