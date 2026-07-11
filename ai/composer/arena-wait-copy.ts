import type { MultiAgentPhase } from './chat-activity-types';
import type { MultiAgentStepRecord } from './chat-activity-types';
import { MULTI_AGENT_LABELS } from './chat-activity-types';

/** Fixed compose wait line (animated dots appended in UI). */
export const COMPOSE_WAIT_LABEL = 'Scriu codul în editor';

const PHASE_MESSAGES: Record<MultiAgentPhase, string[]> = {
  memory: [
    'Calul își amintește proiectele tale…',
    'Încarc context din run-uri trecute…',
    'Sincronizez memoria persistentă…',
  ],
  integrate: [
    'Pornesc Full Integration Agent…',
    'Conectez Memory, DevTools și agenții…',
    'Construiesc graful de orchestrare…',
  ],
  context: [
    'Analizez workspace-ul deschis…',
    'Extrag context relevant din proiect…',
    'Pregăt terenul pentru agenți…',
  ],
  modelOrch: [
    'Orchestrez modelele AI per agent…',
    'Selectez modelul optim pentru fiecare task…',
    'Construiesc pipeline multi-model…',
  ],
  orchestrator: [
    'Planific ordinea agenților…',
    'Distribui task-urile pe modele…',
    'Orchestratorul aliniază pipeline-ul…',
  ],
  decompose: [
    'Descompun task-ul în module…',
    'Planific arhitectura high-level…',
    'Definesc Goal și pașii tehnici…',
  ],
  subagent: [
    'Agenții lucrează în paralel…',
    'Fiecare modul primește un specialist…',
    'Sub-agenții scriu soluții pe bucăți…',
  ],
  merge: [
    'Unific output-urile sub-agenților…',
    'Reconciliez modulele într-un singur plan…',
  ],
  supervisor: [
    'Supervisor verifică consistența…',
    'Review arhitectură înainte de compose…',
  ],
  compose: [
    'Scriu codul în editor…',
    'Asamblez proiectul final…',
    'Generez fișiere complete în workspace…',
  ],
  userSim: [
    'Simulez utilizatorul real…',
    'Verific fluxuri și UX…',
    'Testez răspunsul aplicației…',
  ],
  security: [
    'Scanez vulnerabilități…',
    'Verific pattern-uri nesigure…',
    'Analizez securitatea codului…',
  ],
  performance: [
    'Profilez performanța…',
    'Identific bottleneck-uri…',
    'Planific optimizări…',
  ],
};

const DEFAULT_MESSAGES = [
  'Cavallo lucrează — nu e blocat…',
  'Pipeline Full Integration activ…',
  'Agenții sunt pe treabă, stai liniștit…',
  'Calul aleargă prin codebase…',
];

export function getWaitMessagesForPhase(phase: MultiAgentPhase): string[] {
  return PHASE_MESSAGES[phase] ?? DEFAULT_MESSAGES;
}

export function getWaitMessage(phase?: MultiAgentPhase, tick = 0): string {
  const pool = phase ? getWaitMessagesForPhase(phase) : DEFAULT_MESSAGES;
  if (pool.length === 0) return DEFAULT_MESSAGES[0]!;
  return pool[Math.abs(tick) % pool.length]!;
}

/** Last active step in multi-agent pipeline (for wait copy). */
export function activePhaseFromSteps(
  steps?: MultiAgentStepRecord[]
): MultiAgentPhase | undefined {
  if (!steps?.length) return undefined;
  const active = [...steps].reverse().find((s) => s.status === 'active');
  if (active) return active.phase;
  return steps[steps.length - 1]?.phase;
}

/** Resolve pipeline phase from steps, falling back to status label text. */
export function resolveWaitPhase(
  steps?: MultiAgentStepRecord[],
  statusLabel?: string
): MultiAgentPhase | undefined {
  const fromSteps = activePhaseFromSteps(steps);
  if (fromSteps) return fromSteps;
  if (!statusLabel) return undefined;
  const lower = statusLabel.toLowerCase();
  const entries = (Object.entries(MULTI_AGENT_LABELS) as [MultiAgentPhase, string][]).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [phase, label] of entries) {
    if (lower.includes(label.toLowerCase())) return phase;
  }
  return undefined;
}

const DEFAULT_GLOW_RGB = '0, 200, 255';

function buildGlowFilter(rgb: string, hueRotate = 0): string {
  return [
    `hue-rotate(${hueRotate}deg)`,
    'saturate(1.4)',
    `drop-shadow(0 10px 28px rgba(${rgb}, 0.72))`,
    `drop-shadow(0 4px 14px rgba(${rgb}, 0.55))`,
    `drop-shadow(0 0 12px rgba(${rgb}, 0.45))`,
  ].join(' ');
}

const PHASE_GLOW_RGB: Record<MultiAgentPhase, string> = {
  memory: '168, 85, 247',
  integrate: '217, 70, 239',
  context: '59, 130, 246',
  modelOrch: '139, 92, 246',
  orchestrator: '245, 158, 11',
  decompose: '251, 146, 60',
  subagent: '34, 211, 238',
  merge: '20, 184, 166',
  supervisor: '234, 179, 8',
  compose: '34, 197, 94',
  userSim: '56, 189, 248',
  security: '239, 68, 68',
  performance: '16, 185, 129',
};

const PHASE_HUE_ROTATE: Record<MultiAgentPhase, number> = {
  memory: -35,
  integrate: -15,
  context: 0,
  modelOrch: -25,
  orchestrator: 35,
  decompose: 55,
  subagent: 0,
  merge: 25,
  supervisor: 45,
  compose: 85,
  userSim: 10,
  security: 60,
  performance: 40,
};

/** CSS filter stack for arena horse glow — tints horse + colored shadow per phase. */
export function getWaitGlowFilter(phase?: MultiAgentPhase): string {
  const rgb = phase ? PHASE_GLOW_RGB[phase] : DEFAULT_GLOW_RGB;
  const hue = phase ? PHASE_HUE_ROTATE[phase] : 0;
  return buildGlowFilter(rgb, hue);
}

/** Wrapper halo for arena horse mark. */
export function getWaitGlowBoxShadow(phase?: MultiAgentPhase): string {
  const rgb = phase ? PHASE_GLOW_RGB[phase] : DEFAULT_GLOW_RGB;
  return `0 0 18px rgba(${rgb}, 0.55), 0 0 8px rgba(${rgb}, 0.35)`;
}
