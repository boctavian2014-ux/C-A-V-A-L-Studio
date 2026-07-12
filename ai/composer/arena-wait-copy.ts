import type { MultiAgentPhase } from './chat-activity-types';
import type { MultiAgentStepRecord } from './chat-activity-types';
import { MULTI_AGENT_LABELS } from './chat-activity-types';

/** Fixed compose wait line (animated dots appended in UI). */
export const COMPOSE_WAIT_LABEL = 'Scriu codul în editor';

const PHASE_MESSAGES: Record<MultiAgentPhase, string[]> = {
  memory: [
    'Calul își amintește unde ai ascuns acel TODO din 2019…',
    'Răsfoiesc amintirile — nu judec, doar notez…',
    'Memoria persistentă: ca un coleg care nu uită niciodată greșelile…',
    'Caut în arhivă varianta în care mergea din prima…',
    'Sincronizez creierul calului cu proiectele tale…',
    'Am găsit 3 commit-uri emoționale. Le păstrăm…',
    'Încarc contextul — fără spoilere pentru bug-urile viitoare…',
    'Calul își amintește: tu ai zis „rapid și simplu”…',
  ],
  integrate: [
    'Leg agenții între ei ca niște prieteni care chiar comunică…',
    'Full Integration: puzzle-ul începe să arate ca o aplicație…',
    'Conectez Memory, DevTools și optimismul…',
    'Orchestrarea începe — fără dramă, doar cabluri logice…',
    'Pun laolaltă piesele — niciuna nu e „piesa de rezervă”…',
    'Integrez totul. Da, inclusiv acel fișier numit final_v2_REALLY_FINAL…',
    'Agenții fac shake hands virtual. E awkward, dar merge…',
    'Construiesc graful — nodurile nu se ceartă (încă)…',
  ],
  context: [
    'Citesc proiectul ca o carte bună — cu plot twist-uri în config…',
    'Mapez fișierele. Una se numește „temp” de 4 ani…',
    'Analizez workspace-ul. Nu e haos, e „organizare creativă”…',
    'Extrag context relevant. Ignor comentariul „// fix later”…',
    'Număr dependențele. Respir adânc…',
    'Pregăt terenul pentru agenți — trag buruieni din importuri…',
    'Citesc fișierele deschise. Editorul știe lucruri…',
    'Structura proiectului: mai complexă decât IKEA, dar rezolvăm…',
    'Context loading… ca pozele de vacanță, dar util…',
    'Descopăr că ai 47 de fișiere index. Calul nu e surprins…',
  ],
  modelOrch: [
    'Aleg modelul potrivit — ca un DJ, dar pentru cod…',
    'Orchestrez AI-urile: unul gândește, altul tastează…',
    'Negociez între modele cine face munca grea…',
    'Pipeline multi-model: echipa visurilor (și token-urilor)…',
    'Rutez task-uri către creierele potrivite…',
    'Calibrăm modelele — fără ego, doar throughput…',
    'Un model pentru plan, altul pentru magie. Tu ai cerut magie…',
    'Orchestrare: dirijorul invizibil al haosului productiv…',
  ],
  orchestrator: [
    'Orchestratorul face lista — tu ai zis „surpriză”, eu fac plan…',
    'Distribui task-uri: fiecare agent primește o misiune epică…',
    'Planific ordinea. Spoiler: compose e la final, ca în filme…',
    'Aloc roluri: cineva trebuie să fie responsabil de CSS…',
    'Pipeline alignment — sună corporate, dar chiar funcționează…',
    'Coordonez agenții ca un antrenor la halftime…',
    'Ordinea operațiilor: 1. Gândim 2. Facem 3. Ne mirăm că merge…',
    'Orchestratorul zice „go” — agenții zic „on it”…',
  ],
  decompose: [
    'Architectul taie task-ul în bucăți digerabile…',
    'Descompun cererea — fără drama unui monolit de 3000 linii…',
    'Plan high-level: Goal clar, pași mai clari, cafea implicită…',
    'Împart totul în module. Modularitatea e sexy…',
    'Schițez arhitectura — fundația ține, promitem…',
    'Task splitting: din „fă-mi o app” în „ok, 12 pași”…',
    'Architectul gândește. Tu relaxat. Echilibru…',
    'Definesc modulele — fiecare cu personalitate proprie…',
    'Decompose mode: transform „imposibil” în „doar mult”…',
    'Plan de livrare: mai bun decât „vedem noi”…',
  ],
  subagent: [
    'Agenții lucrează în paralel — ca un open space, dar productiv…',
    'Fiecare specialist atacă modulul lui preferat…',
    'Sub-agenții codează. Calul supervizează cu stoicism…',
    'Implementări simultane — niciun agent nu doarme (sunt AI)…',
    'Echipa e pe treabă. Breslele medievale, dar pentru TypeScript…',
    'Module by module — Rome wasn’t built in one prompt…',
    'Specialiștii scriu. Merge-ul va uni totul ca un final de sezon…',
    'Paralel = rapid. Rapid = tu fericit. Logică impecabilă…',
    'Un agent pe frontend, unul pe logică — tu pe cafenea…',
    'Sub-agenții: mici, focusați, periculoși de eficienți…',
  ],
  merge: [
    'Unific output-urile — ca un edit de film, dar pentru cod…',
    'Merge time: împăcăm agenții care au numit variabile diferit…',
    'Reconciliez modulele. Conflict? Negotiem…',
    'Pun laolaltă bucățile — puzzle-ul aproape e complet…',
    'Merge agent: avocatul păcii între fișiere…',
    'Un singur plan din multe voci. Democrație tehnică…',
  ],
  supervisor: [
    'Supervisorul verifică — cu ochi de prof care corectează…',
    'Review arhitectură: „merge, dar hai să fie elegant”…',
    'Quality check înainte de compose. Standardele Calului…',
    'Supervisor zice da sau „încă o tură”…',
    'Consistență check — nimeni nu vrea surprize la deploy…',
    'Ultimul filtru înainte de codul care te face fericit…',
  ],
  compose: [
    'Tastez cod ca la examen — repede, dar cu stil…',
    'Scriu în editor. Caracterele cad la locul lor…',
    'Compose mode: de la plan la fișiere reale. Magie? Aproape…',
    'Generez fișiere — workspace-ul prinde viață…',
    'Livrez patch-uri. Tu vezi rezultatul, eu văd linii verzi…',
    'Asamblez proiectul final — montaj IKEA, dar merge din prima…',
    'Codul curge în editor ca un râu… un râu structurat…',
    'Completez implementarea — save-ul e aproape…',
    'Fișiere noi, bug-uri vechi mutate. Progres…',
    'Scriu codul. Promitem indentare corectă (în mare parte)…',
  ],
  userSim: [
    'Simulez userul real — click, scroll, „de ce nu merge?”…',
    'Testez UX-ul. Dacă mă pierd, și userul se va pierde…',
    'User simulator: încerc să stric lucrurile ca un om…',
    'Verific fluxurile — butonul mare chiar face ceva?…',
    'QA invizibil: apăs tot ce se poate apăsa…',
    'Mă pun în pielea userului. E confuz, dar constructiv…',
  ],
  security: [
    'Scanez vulnerabilități — paranoia productivă…',
    'Security pass: niciun `eval` suspect nu scapă…',
    'Caut pattern-uri nesigure. Spoiler: le găsim uneori…',
    'Analizez codul ca un hacker etic cu cafea…',
    'Lock down mode: securitate fără panică…',
    'Verific ușile virtuale. Toate încuiate? Aproape…',
  ],
  performance: [
    'Profilez performanța — cine mănâncă CPU-ul?…',
    'Caut bottleneck-uri ca un detectiv al lag-ului…',
    'Optimizări planificate. Viteza e un lux accesibil…',
    'Performance scan: de la „merge” la „zboară”…',
    'Măsor totul. Ce nu se măsoară, se ghicește prost…',
    'Planific tuning — calul vrea sprint, nu maraton…',
  ],
};

const DEFAULT_MESSAGES = [
  'CAVALLO aleargă — nu e blocat, doar gândește profund…',
  'Pipeline activ. Respiră. Calul controlează situația…',
  'Agenții sunt pe treabă. Tu poți clipi fără griji…',
  'Nu e lag, e dramă tehnică în desfășurare…',
  'Procesez cererea — cu eleganță ecvină…',
  'Conectez modelele. WiFi-ul e stabil, promitem…',
  'Calul nu doarme. Doar optimizează în tăcere…',
  'Full Integration în curs — popcorn opțional…',
  'Încă puțin. Rome, apps și prompt-uri bune iau timp…',
  'Sistemul lucrează. Tu ești încă preferatul pipeline-ului…',
  'Loading… dar cu personalitate și glow cyan…',
  'Așteptarea e scurtă. Glumele, mai puțin…',
  'Backend-ul transpiră logică. Normal la efort intelectual…',
  'Calul verifică: totul sub control? Aproape totul…',
  'Încă procesez. Perfecțiunea nu are shortcut…',
  'Momente ca astea separă „merge” de „wow”…',
];

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function buildShuffledBag(pool: string[], avoidFirst?: string): string[] {
  if (pool.length === 0) return [...DEFAULT_MESSAGES];
  if (pool.length === 1) return [...pool];
  const bag = shuffleArray(pool);
  if (avoidFirst && bag[0] === avoidFirst) {
    const swapAt = bag.findIndex((m, i) => i > 0 && m !== avoidFirst);
    if (swapAt > 0) {
      [bag[0], bag[swapAt]] = [bag[swapAt]!, bag[0]!];
    }
  }
  return bag;
}

export interface WaitMessagePicker {
  next(): string;
  reset(nextPhase?: MultiAgentPhase): void;
}

export function createWaitMessagePicker(initialPhase?: MultiAgentPhase): WaitMessagePicker {
  let phase = initialPhase;
  let bag: string[] = [];
  let index = 0;
  let lastShown = '';

  const poolFor = (p?: MultiAgentPhase): string[] =>
    p ? [...getWaitMessagesForPhase(p)] : [...DEFAULT_MESSAGES];

  const refill = (avoidLast?: string) => {
    bag = buildShuffledBag(poolFor(phase), avoidLast);
    index = 0;
  };

  const reset = (nextPhase?: MultiAgentPhase) => {
    phase = nextPhase;
    lastShown = '';
    refill();
  };

  const next = (): string => {
    if (bag.length === 0 || index >= bag.length) {
      refill(lastShown || undefined);
    }
    const msg = bag[index] ?? poolFor(phase)[0] ?? DEFAULT_MESSAGES[0]!;
    index += 1;
    lastShown = msg;
    return msg;
  };

  refill();

  return { next, reset };
}

export function formatWaitElapsed(seconds: number, phase?: MultiAgentPhase): string {
  const label = phase ? MULTI_AGENT_LABELS[phase] : 'Pipeline';
  return `${seconds}s · ${label}`;
}

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
