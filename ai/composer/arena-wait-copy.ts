import type { MultiAgentPhase } from './chat-activity-types';
import type { MultiAgentStepRecord } from './chat-activity-types';
import { MULTI_AGENT_LABELS, shortModelLabel } from './chat-activity-types';

/** Fixed compose wait line (animated dots appended in UI). */
export const COMPOSE_WAIT_LABEL = 'Scriu codul în editor';

const SESSION_KEY = 'caval-arena-wait-recent';
const MAX_RECENT = 40;
const MIN_POOL_BEFORE_TRIM = 3;
const KEEP_AFTER_TRIM = 10;

const PHASE_MESSAGES: Record<MultiAgentPhase, string[]> = {
  memory: [
    'Caut în memorie commit-ul „fix final de data asta chiar ultimul”',
    'Am găsit 7 variante ale aceluiași TODO. Toate din 2021.',
    'Memoria persistentă îmi spune că ai zis „rapid și simplu”. Râd politicos.',
    'Indexez conversațiile — spoiler: ai mai cerut același feature de 3 ori',
    'Răsfoiesc arhiva. Un fișier se numește backup_backup_REAL.',
    'Sincronizez contextul: tu, proiectul și speranța de deploy vineri',
    'Îmi amintesc că ai promis refactor „după release”. Clasic.',
    'Extrag lecții din bug-uri trecute ca un terapeut pentru cod',
    'Nota mentală: userul preferă butoane mari și erori mici',
    'Caut varianta în care mergea pe laptopul tău. E mitologică.',
    'Memoria îmi șoptește unde ai ascuns API key-ul în comentarii',
    'Reîncarc snapshot-ul: 412 de „// fix later” și zero panică',
    'Un cal cu RAM infinit ar fi overkill. Mă descurc și așa.',
    'Verific dacă am mai văzut acest pattern. Da. De 9 ori.',
    'Context istoric: de la „hello world” la „de ce e production roșu”',
    'Arhivez amintiri utile. Restul le etichetez „experiență de viață”',
    'Legătura cu sesiunile vechi: 68% cod, 32% optimism',
    'Memoria zice că ultima dată ai zis „nu schimba nimic”. Schimbăm tot.',
    'Reconstitui timeline-ul: idee → plan → „stai puțin” → refactor',
    'Pregătesc creierul ecvin pentru deja-vu tehnic productiv',
  ],
  integrate: [
    'Leg modulele ca un electrician zen — fără scântei, doar importuri',
    'Full Integration: de la haos frumos la aplicație care seamănă cu ceva',
    'Conectez Memory cu DevTools. Prietenie forțată, dar funcțională.',
    'Puzzle-ul capătă margini. Încă mai sunt piese din alt puzzle.',
    'Unific canalele între agenți — fără spam în Slack imaginar',
    'Integrez totul, inclusiv fișierul „copy (2) (final).tsx”',
    'Graful de dependențe arată ca metroul la ora de vârf. Rezolvăm.',
    'Handshake virtual între agenți. Unul a uitat parola. Normal.',
    'Cabluri logice, zero dramă — dramă doar în package.json',
    'Orchestrarea începe: fiecare agent primește rol și anxietate utilă',
    'Leg output-urile parțiale într-un tot care nu se prăbușește imediat',
    'Sincronizez stările: 3 agenți, 1 adevăr, 0 consens',
    'Pipeline-ul devine simfonic. Uneori atonal, dar merge.',
    'Conectez punctele. Unele puncte erau virgule. Le iert.',
    'Integrare: transform „merge separat” în „merge împreună, probabil”',
    'Un singur flux de date — nu șapte surse de adevăr paralele',
    'Agenții își dau tag-uri. Git blame e mândru.',
    'Montez podul între „am idee” și „am fișiere”',
    'Verific că toate piesele vorbesc aceeași limbă. TypeScript, sper.',
    'Full stack integration: frontend, backend și speranță',
  ],
  context: [
    'Citesc proiectul. Plot twist în config: totul e hardcodat.',
    'Mapez fișierele. Una e „temp” de 4 ani. Respect.',
    'Analizez workspace-ul: organizare creativă, nu haos.',
    'Ignor comentariul „// nu șterge” de la 2018. Poate mâine.',
    'Număr dependențele. node_modules e un oraș.',
    'Extrag context din fișierele deschise. Editorul știe tot.',
    'Structura proiectului: mai complexă decât manualul ANAF, dar clară',
    'Descopăr 47 de index.ts. Normal pentru proiect ambițios.',
    'Context loading — ca pozele de vacanță, dar cu ROI',
    'Caut unde e definit tipul. E în 3 locuri diferite. Clasic.',
    'Scanez importurile circulare. Un mic carusel emoțional.',
    'Citesc README-ul. Are 2 linii. Onest.',
    'Workspace map: 200 fișiere, 3 explicații, 0 documentație',
    'Pregăt terenul: trag buruieni din dead code',
    'Identific pattern-ul arhitectural: „merge la mine”',
    'Context pack gata — suficient să nu inventăm folderul greșit',
    'Verific .env.example. Lipsesc 12 variabile. Standard.',
    'Înțeleg stack-ul: React, Node și încredere în linter',
    'Fișiere cheie localizate. Cheia e metaforică, dar utilă.',
    'Rezumat context: tu vrei X, codul are Y, noi negociem Z',
  ],
  modelOrch: [
    'Aleg modelul potrivit — DJ pentru token-uri, nu pentru beat',
    'Un model gândește, altul tastează. Echipă de vis sau coșmar productiv',
    'Negociez între LLM-uri cine face munca grea. Toți vor planul.',
    'Rutez task-uri către creierul cu cel mai mic ego',
    'OpenRouter pe fir. Latența e emoție, nu statistică.',
    'Calibrăm temperatura: creativ dar nu haotic ca vineri seara',
    'Orchestrare multi-model: throughput peste dramă',
    'Model A pentru logică, Model B pentru stil. Tu pentru decizii.',
    'Pipeline de modele: ca o relay, dar cu API keys',
    'Aleg fallback-ul. Plan B e mereu undeva în cloud.',
    'Distribuție inteligentă: scump unde contează, rapid unde nu',
    'Modelele fac queue. Nu ca la ghișeu, mai repede.',
    'Router AI: intenție → model → speranță → răspuns',
    'Un cal, mai multe creiere. Metaforă, dar funcțională.',
    'Optimizez cost vs calitate. Bugetul tău respiră ușurat.',
    'Schimb modelul mid-flight. Pilot automat cu bun simț',
    'Orchestrator de modele: fără monolog de 40 de minute',
    'Match task complexity cu model capability. Fără tunuri pe țânțari',
    'Latency check: mai rapid decât refresh-ul tău nervos',
    'Echipa de modele e pe poziții. Fluierul e virtual.',
  ],
  orchestrator: [
    'Fac lista — tu ai zis „surpriză”, eu fac plan cu backup',
    'Distribui misiuni: fiecare agent primește task și deadline imaginar',
    'Ordinea e sacră: gândim, facem, ne mirăm, deployăm (poate)',
    'Aloc CSS-ul cuiva curajos. Erou necunoscut.',
    'Pipeline alignment — sună corporate, chiar ajută',
    'Coordonez ca antrenor la pauză: motivație + pași clari',
    'Plan: 1. Context 2. Build 3. „Stai, am uitat ceva”',
    'Orchestratorul dă „go”. Agenții răspund „on it” sincron',
    'Prioritizez: critic acum, nice-to-have după prima cafea',
    'Task board invizibil. Sticky notes virtuale peste tot.',
    'Sincronizez cei 5 agenți. 5 opinii, 1 orchestrator stăpân.',
    'Timeline realist: optimist în slide-uri, onest în cod',
    'Roluri clare: cine scrie, cine verifică, cine regretă',
    'Orchestrare: dirijor fără baghetă, doar logică',
    'Spoiler: compose e la final. Ca credits în film.',
    'Delegare inteligentă — nu „fă ceva cu asta”',
    'Verific dependențele între pași. Graf aciclic, emotional linear',
    'Stand-up de 0 secunde. Direct la treabă.',
    'Orchestrator mode: haos organizat cu deadline',
    'Ultima verificare înainte să las echipa pe teren',
  ],
  decompose: [
    'Împart monolitul în 12 microservicii emoționale',
    'Architectul desenează cutii. Cutiile desenează înapoi.',
    'Din „fă-mi o app” în „ok, 14 pași și 2 excepții”',
    'Task splitting fără drama unui fișier de 3000 linii',
    'Plan high-level: obiectiv clar, pași mai clari, scope realist',
    'Modularitate: sexy pe hârtie, util în cod',
    'Schițez arhitectura — fundația ține pe hârtie. Testăm în cod.',
    'Decompose: transform „imposibil” în „doar mult”',
    'Fiecare modul primește nume bun și responsabilități clare',
    'Architectul gândește. Tu respiri. Echilibru.',
    'Plan de livrare mai bun decât „vedem noi cum iese”',
    'Taie feature-ul în felii digerabile, nu în haos',
    'Dependency graph: cine depinde de cine și de ce',
    'Scope guard activ: nu construim Netflix din greșeală',
    'Microservicii? Poate. Module? Sigur. Haos? Nu.',
    'Arhitectura zâmbește. Linter-ul e precaut.',
    'Estimare: optimist 2h, realist 2 zile, onest „depinde”',
    'Separ frontend de backend ca prieteni care comunică',
    'Blueprint gata. Constructorii sunt agenții.',
    'Un pas mic pentru agent, un salt pentru proiect',
  ],
  subagent: [
    'Agenții în paralel — open space productiv, fără meeting de 2 ore',
    'Fiecare specialist atacă modulul lui preferat',
    'Implementări simultane. Nimeni nu doarme — sunt AI.',
    'Echipa medievală pentru TypeScript: bresle și PR-uri',
    'Rome wasn’t built in one prompt. Dar încercăm eficient.',
    'Un agent pe UI, unul pe logică, tu pe validare',
    'Sub-agenți mici, focusați, periculos de eficienți',
    'Paralel = rapid. Rapid = tu fericit. QED.',
    'Module by module. Merge-ul e finalul de sezon.',
    'Codul curge din 4 direcții. Unificarea vine după.',
    'Specialistul de API nu atinge CSS-ul. Regulă de aur.',
    'Sprint virtual: toți commit-uiesc în același timp',
    'Concurrency fără race conditions emoționale',
    'Fiecare agent cu task clar. Zero „figure it out” vag',
    'Factory line de cod. Calitate controlată.',
    'Lucrez în paralel ca un studio de animație',
    'Output parțial din 3 colțuri. Curios ce iese.',
    'Echipa nu se ceartă pe naming. Aproape.',
    'Build simultan: frontend dansează, backend calculează',
    'Sub-agent mode: divide et impera, dar prietenos',
  ],
  merge: [
    'Unific output-urile — edit de film pentru cod',
    'Împăc variabilele: `data` vs `items` vs `stuff`',
    'Reconciliez modulele. Conflict? Git merge, dar cu zâmbet',
    'Puzzle aproape complet. Lipsește o piesă. O inventăm.',
    'Merge agent: avocatul păcii între fișiere',
    'Un singur plan din multe voci. Democrație tehnică',
    'Combin 4 implementări într-una care compilează',
    'Rezolv duplicatele. DRY sau die trying.',
    'Unific stilul: 2 spații vs tabs — alegem pacea',
    'Patch-uri unite. Diff-ul e poezie.',
    'Merge time: momentul adevărului pentru naming',
    'Integrare output: de la 4 adevăruri la 1 release',
    'Consolidare fără a pierde ce e bun din fiecare variantă',
    'Aliniez interfețele. Tipurile sunt prieteni acum.',
    'Un singur arbore de fișiere. Sfârșitul wild west-ului',
    'Rezolv conflictul: ambele variante aveau dreptate parțial',
    'Stitch modules: cusătură invizibilă, cod vizibil',
    'Plan unificat gata pentru supervisor. Degete încrucișate.',
    'Merge reușit. Compilerul nu plânge.',
    'De la „multe drafturi” la „un singur adevăr”',
  ],
  supervisor: [
    'Review cu ochi de prof: „merge, dar hai elegant”',
    'Quality check înainte de compose. Standarde ridicate.',
    'Supervisor zice da sau „încă o tură”. Fără dramă.',
    'Consistență: nimeni nu vrea surprize la deploy',
    'Ultimul filtru înainte de codul care te face fericit',
    'Verific arhitectura. Fundația ține? Probabil.',
    'Scan pentru anti-pattern-uri. Am găsit 2. Le notăm.',
    'Supervisor mode: bun, mai bun, ship',
    'Checklist mental: securitate, stil, logică, cafea',
    'Peer review intern. Fără ego, doar issues',
    'Validare plan: scope OK, riscuri notate, go compose',
    'Nu trec bug-uri evidente. E regulă, nu sugestie.',
    'Arhitectura aprobată cu rezerve minore. Onorabil.',
    'Supervisorul e strict dar corect. Ca un linter cu suflet.',
    'Verific că nu am uitat edge case-ul de la 2 noaptea',
    'Green light sau feedback constructiv. Nu ambele.',
    'Audit rapid: ce merge, ce trebuie refăcut, ce ignorăm',
    'Gate keeper înainte de editor. Poarta e deschisă sau nu.',
    'Review final: 8/10. Suficient pentru compose.',
    'Supervisor semnează. Agenții aplaudă virtual.',
  ],
  compose: [
    'Salvez fișierul înainte să apară regretul',
    'Tastez atât de repede încât tastatura cere concediu',
    'Compose mode: de la plan la fișiere reale. Aproape magie.',
    'Generez fișiere — workspace-ul prinde viață',
    'Livrez patch-uri. Tu vezi rezultatul, eu linii verzi',
    'Codul curge în editor ca un râu structurat',
    'Completez implementarea. Save-ul e aproape.',
    'Fișiere noi, bug-uri vechi mutate. Progres.',
    'Scriu cod. Indentare corectă în 87% din cazuri.',
    'Tastez ca la examen: repede, cu stil, fără șters',
    'Editorul primește conținut. Istoria se rescrie.',
    'De la markdown la TypeScript. Transformare digitală.',
    'Compose wave: prima salvare e cea mai emoționantă',
    'Scriu componente. Props-uri cu nume decente.',
    'Livrez codul. Tu dai refresh cu emoție.',
    'Fișiere create. Git status devine interesant.',
    'Implementare finală: mâinile virtuale pe tastatură',
    'Cod fresh, smell-uri vechi eliminate (unele)',
    'Scriu în editor. Caracterele cad la locul lor.',
    'Aproape gata. Ultimele linii sunt cele mai satisfăcătoare.',
  ],
  userSim: [
    'Simulez userul: click, scroll, „de ce nu merge?”',
    'Dacă mă pierd în UI, și userul se va pierde',
    'User simulator: stric lucruri ca un om obosit',
    'Verific butonul mare. Face ceva? Trebuie să facă.',
    'QA invizibil: apăs tot ce e apăsabil',
    'Mă pun în pielea userului. Confuz, dar constructiv',
    'Testez flow-ul fericit. Apoi cel nefericit.',
    'User journey: de la „wow” la „unde e butonul?”',
    'Simulez double-click acolo unde nu trebuie',
    'UX check: 3 click-uri sau prea multe?',
    'Comportament uman: grăbit, distras, curios',
    'Încerc să sparg UI-ul cu bună credință',
    'User sim: „am apăsat Enter de 5 ori”. Normal.',
    'Validare: mesajele de eroare sunt pentru oameni?',
    'Testez pe telefon imaginar. Responsive sau nu?',
    'Flux critic: login → acțiune → succes. Sau nu.',
    'Simulez abandon la checkout. Dureros dar util.',
    'User real nu citește manualul. Nici eu.',
    'Click storm pe butonul de submit. Rezistență?',
    'Feedback simulat: „e ok” sau „nu înțeleg nimic”',
  ],
  security: [
    'Scanez vulnerabilități. Paranoia productivă activată.',
    'Niciun `eval` suspect nu trece neobservat',
    'Caut pattern-uri nesigure. Uneori le găsim. Onest.',
    'Hacker etic virtual. Fără cafea, cu principii.',
    'Lock down: securitate fără panică inutilă',
    'Verific ușile virtuale. Majoritatea încuiate.',
    'SQL injection? Nu pe watch-ul meu.',
    'XSS scan: input sanitizat sau regret viitor',
    'Secrets în cod? Îi găsesc și îi judec.',
    'Security pass: OWASP în minte, pragmatism în cod',
    'Auth flow verificat. Token-ul e unde trebuie.',
    'Dependency audit: vulnerabilități cunoscute semnalate',
    'CORS, CSP, HTTPS — checklist mental activ',
    'Nu lăsăm ușa deschisă pentru script kiddies',
    'Scan rapid: surface attack redusă',
    'Security agent: mai strict decât mama ta pe Facebook',
    'Validare input: trust nobody, sanitize everything',
    'Raport securitate: 2 medium, 0 critical. Respirăm.',
    'Pen test light. Fără dramă, cu rezultate.',
    'Siguranță înainte de ship. Non-negociabil.',
  ],
  performance: [
    'Profilez: cine mănâncă CPU-ul? Vinovat găsit.',
    'Detectiv al lag-ului pe urmele bottleneck-ului',
    'De la „merge” la „zboară” — plan de tuning',
    'Ce nu se măsoară, se ghicește prost. Măsor tot.',
    'Sprint, nu maraton. Viteza contează.',
    'Bundle size check. node_modules plânge ușor.',
    'Lazy load unde se poate. Eager doar unde trebuie.',
    'N+1 queries? Le număr și le elimin.',
    'Memory leak hunt. Coșul de gunoi e plin.',
    'Performance scan: 60 FPS sau scuze',
    'Optimizare: 20% efort, 80% câștig. Pareto.',
    'Cache strategy: hit rate sau regret',
    'Render count: prea multe? Le reducem.',
    'API latency: sub 200ms sau explicații',
    'Profiling done. Lista de „de ce e lent” e clară.',
    'Tuning plan: quick wins first, refactor later',
    'Performance budget: nu depășim fără motiv',
    'Main thread liber. Worker-ii muncesc.',
    'Lighthouse în cap. Scor verde visat.',
    'Optimizări aplicate. Senzația de viteză e reală.',
  ],
};

const DEFAULT_MESSAGES = [
  'CAVALLO aleargă — nu e blocat, gândește profund',
  'Pipeline activ. Respiră. Situația e sub control (aprox.)',
  'Nu e lag, e dramă tehnică în desfășurare',
  'Procesez cu eleganță ecvină și zero pană de cai',
  'Agenții sunt pe treabă. Tu poți clipi',
  'Conectez modelele. WiFi-ul supraviețuiește',
  'Încă puțin. Rome, apps și prompt-uri bune iau timp',
  'Tu ești încă preferatul pipeline-ului. Statistic.',
  'Loading cu personalitate și glow cyan',
  'Backend-ul transpiră logică. Normal la efort intelectual',
  'Perfecțiunea nu are shortcut. Nici butonul magic.',
  'Momente ca astea separă „merge” de „wow”',
  'Token-urile zboară. Bugetul tău speră în optimizare',
  'Nu e eroare, e caracter în dezvoltare',
  'Calul verifică checklist-ul. 11 din 10 bifate',
  'Așteptarea construiește anticipare. Sau nervi. Ambele.',
  'Procesare: 99% muncă, 1% glumă internă',
  'Sistemul lucrează. Tu ești product managerul involuntar',
  'Între click și răspuns există magie. Și API calls.',
  'Deploy-ul e viitorul. Acum e prezentul cu spinner',
  'node_modules e mare. Răbdarea ta, și ea.',
  'git status va deveni interesant curând',
  'OpenRouter pe fir. Latența e o emoție.',
  'Încă procesez. Calitatea nu se grăbește',
];

/** Live IDE + pipeline snapshot for contextual wait jokes. */
export interface WaitSceneContext {
  project?: string;
  file?: string;
  module?: string;
  task?: string;
  model?: string;
  files?: number;
}

const PLACEHOLDER_RE = /\{(project|file|module|task|model|files)\}/g;
const MAX_LABEL_LEN = 28;

const PHASE_CONTEXT_TEMPLATES: Record<MultiAgentPhase, string[]> = {
  memory: [
    'Memorie pentru {project}: caut ce am mai promis data trecută',
    'În {project} am găsit deja-vu. {file} sună cunoscut.',
    'Snapshot {project}: lecții vechi, optimism nou',
    'Îmi amintesc de {project}. Și de „fix later” din {file}',
    'Context istoric {project} — {files} fișiere deja pe disc',
    'Memoria zice: {project} merită un plan, nu panică',
  ],
  integrate: [
    'Integrez {project}: modulele se țin de mână (aproape)',
    'Full Integration pe {project} — {module} intră în joc',
    'Leg piesele din {project}. {task}',
    'Unific fluxul în {project}. {file} e pe radar',
    'Handshake în {project}: agenți + {model}',
    'Pod între idee și fișiere în {project}',
  ],
  context: [
    'Citesc {project}. Fișierul deschis: {file}',
    'Mapez {project} — {file} e pe ecran, restul e mister',
    'Context pack pentru {project}. {module} e pe listă',
    'Scanez {project}. Editorul ține {file} deschis ca un indiciu',
    'Workspace {project}: structură creativă, focus pe {file}',
    'Înțeleg stack-ul din {project} înainte să inventez folderul greșit',
  ],
  modelOrch: [
    'Aleg creierul pentru {project} → {model}',
    'Orchestrare modele pe {project}. Candidat: {model}',
    'Rutez task-ul din {project} către {model}',
    'Match complexity ↔ model pentru {project}',
    'DJ de token-uri: {project} pe {model}',
    'Fallback gata — {project} nu rămâne fără creier ({model})',
  ],
  orchestrator: [
    'Coordonez {project}: {task}',
    'Plan pentru {project} — {module} e pe tablă',
    'Distribuie misiuni în {project}. Tu ai zis surpriză, eu fac listă',
    'Orchestrator pe {project}: {file} e în vizor',
    'Timeline {project}: gândim → facem → ne mirăm',
    'Roluri clare în {project}. {model} pe fir',
  ],
  decompose: [
    'Sparg {project} în module. {module} e primul suspect',
    'Architect pe {project}: {task}',
    'Decompose {project} — {file} sugerează unde tăiem',
    'Task-uri atomice pentru {project}. Fără „fă tot”',
    'Harta modulelor din {project} prinde contur',
    'Împart {project} ca un puzzle cu instrucțiuni (aproape)',
  ],
  subagent: [
    'Agent pe {module}: {task}',
    'Sub-agent în {project} — lucrează la {module}',
    'Implementare {module} în {project}. {model} tastează',
    'Task activ: {task} · proiect {project}',
    'Un agent, un modul ({module}), zero scuze',
    'Cod pentru {module} — ții {file} deschis ca martor',
  ],
  merge: [
    'Merge în {project}: unific output-urile fără dramă',
    'Consolidez {project}. {module} trebuie să se potrivească',
    'Un singur adevăr pentru {project}. {task}',
    'Merge pass: {project} + {files} fișiere pe drum',
    'Lipesc piesele din {project}. Importuri, nu scântei',
    'Reconciliere în {project} — {file} poate fi pe listă',
  ],
  supervisor: [
    'Review pe {project}. {task}',
    'Supervisor uită-se la {project} ca un QA cu cafea',
    'Checklist {project}: {module} trece sau se întoarce',
    'QA pe {project} — {files} fișiere merită o privire',
    'Aprobare condiționată pentru {project}. Detalii: {task}',
    'Review: {project} pe {model} — zero monolog, doar issues',
  ],
  compose: [
    'Scriu în {project} — {file} prinde viață',
    'Compose {project}: fence-uri spre editor',
    'Livrez fișiere în {project}. Acum: {task}',
    'Composer pe {project} ({model}) — {module} pe val',
    'Editorul așteaptă {project}. {files} deja scrise',
    'Scriu cod în {project}. Ții {file} deschis? Perfect timing',
  ],
  userSim: [
    'Simulez userul pe {project}. Click mental pe {file}',
    'User sim {project}: ce se sparge prima dată?',
    'Perspectiva userului în {project} — {module} pe bancă',
    'Test mental {project}: {task}',
    'User simulator pe {project}. Zero clickbait, doar flow',
    'Parcurs user în {project} — {file} e pe drum',
  ],
  security: [
    'Security scan pe {project}. {file} e pe listă',
    'Caut secrete în {project}. Spoiler: nu în commit',
    'Hardening {project} — {module} sub lupă',
    'Security pass: {project} · {task}',
    'Scan {project}: auth, paths, și optimism periculos',
    'Checklist securitate {project} ({model})',
  ],
  performance: [
    'Tuning {project}: caut lag, nu scuze',
    'Performance pe {project} — {file} merită un profil',
    'Măsor {project}. {module} e suspectul nr. 1',
    'Viteza în {project}: {task}',
    'Optimizare {project} — {files} fișiere, zero panică',
    'Perf scan {project} pe {model}',
  ],
};

const DEFAULT_CONTEXT_TEMPLATES = [
  'Lucrez la {project}. Tu respiri, eu procesez',
  'Focus IDE: {file} · proiect {project}',
  'Pipeline pe {project} — {model} pe fir',
  '{project}: încă puțin, apoi vezi diferența',
  'Context live: {project} / {file}',
  'CAVALLO pe {project}. {files} fișiere deja pe disc',
];

export function shortenWaitLabel(
  raw: string | undefined,
  max = MAX_LABEL_LEN,
  opts?: { asPath?: boolean }
): string | undefined {
  if (!raw?.trim()) return undefined;
  let base = raw.trim();
  if (opts?.asPath) {
    base = base.replace(/\\/g, '/').split('/').pop() ?? base;
  }
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1)}…`;
}

export function waitSceneContextKey(ctx?: WaitSceneContext): string {
  if (!ctx) return '';
  return [ctx.project, ctx.file, ctx.module, ctx.task, ctx.model, ctx.files ?? '']
    .map((v) => String(v ?? '').trim())
    .join('|');
}

/** Fill template; returns null if any required placeholder lacks context. */
export function fillWaitTemplate(template: string, ctx: WaitSceneContext): string | null {
  const slots = template.match(PLACEHOLDER_RE);
  if (!slots) return template;
  const values: Record<string, string> = {
    project: shortenWaitLabel(ctx.project) ?? '',
    file: shortenWaitLabel(ctx.file, MAX_LABEL_LEN, { asPath: true }) ?? '',
    module: shortenWaitLabel(ctx.module) ?? '',
    task: shortenWaitLabel(ctx.task, 40) ?? '',
    model: shortenWaitLabel(ctx.model) ?? '',
    files: ctx.files != null && ctx.files >= 0 ? String(ctx.files) : '',
  };
  for (const slot of slots) {
    const key = slot.slice(1, -1);
    if (!values[key]) return null;
  }
  return template.replace(PLACEHOLDER_RE, (_, key: string) => values[key]!);
}

export function buildContextualPool(
  phase: MultiAgentPhase | undefined,
  ctx?: WaitSceneContext
): string[] {
  const generic = phase ? [...getWaitMessagesForPhase(phase)] : [...DEFAULT_MESSAGES];
  if (!ctx || !Object.values(ctx).some((v) => v !== undefined && v !== '' && v !== 0)) {
    return generic;
  }
  const templates = phase
    ? (PHASE_CONTEXT_TEMPLATES[phase] ?? DEFAULT_CONTEXT_TEMPLATES)
    : DEFAULT_CONTEXT_TEMPLATES;
  const filled = templates
    .map((tpl) => fillWaitTemplate(tpl, ctx))
    .filter((m): m is string => Boolean(m));
  if (filled.length === 0) return generic;
  return [...shuffleArray(filled), ...shuffleArray(generic)];
}

export function buildWaitSceneContext(input: {
  projectTitle?: string | null;
  activeFile?: string | null;
  steps?: MultiAgentStepRecord[];
  modules?: string[];
  model?: string | null;
  writtenFiles?: string[];
}): WaitSceneContext {
  const active = input.steps
    ? [...input.steps].reverse().find((s) => s.status === 'active') ??
      input.steps[input.steps.length - 1]
    : undefined;
  const moduleFromBrief = input.modules?.find((m) => m.trim())?.trim();
  const modelRaw = active?.modelId ?? input.model ?? undefined;
  return {
    project: shortenWaitLabel(input.projectTitle ?? undefined),
    file: shortenWaitLabel(input.activeFile ?? undefined, MAX_LABEL_LEN, { asPath: true }),
    module: shortenWaitLabel(moduleFromBrief ?? undefined),
    task: shortenWaitLabel(active?.detail, 40),
    model: modelRaw ? shortModelLabel(modelRaw) : undefined,
    files: input.writtenFiles?.length,
  };
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function readSessionRecent(): string[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeSessionRecent(recent: string[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(recent.slice(-MAX_RECENT)));
  } catch {
    /* quota */
  }
}

function trimSessionRecent(recent: string[]): string[] {
  if (recent.length <= KEEP_AFTER_TRIM) return recent;
  return recent.slice(-KEEP_AFTER_TRIM);
}

function buildShuffledBag(pool: string[], exclude: Set<string>, avoidFirst?: string): string[] {
  if (pool.length === 0) return shuffleArray([...DEFAULT_MESSAGES]);
  let available = pool.filter((m) => !exclude.has(m));
  if (available.length < MIN_POOL_BEFORE_TRIM && exclude.size > 0) {
    const trimmed = new Set(trimSessionRecent([...exclude]));
    available = pool.filter((m) => !trimmed.has(m));
    if (available.length === 0) available = [...pool];
  }
  if (available.length === 1) return [...available];
  const bag = shuffleArray(available);
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
  reset(nextPhase?: MultiAgentPhase, ctx?: WaitSceneContext): void;
  setContext(ctx?: WaitSceneContext): void;
}

export function createWaitMessagePicker(
  initialPhase?: MultiAgentPhase,
  initialCtx?: WaitSceneContext
): WaitMessagePicker {
  let phase = initialPhase;
  let sceneCtx = initialCtx;
  let bag: string[] = [];
  let index = 0;
  let lastShown = '';
  let sessionRecent = readSessionRecent();

  const poolFor = (): string[] => buildContextualPool(phase, sceneCtx);

  const excludeSet = (): Set<string> => new Set([...sessionRecent, lastShown].filter(Boolean));

  const refill = (avoidLast?: string) => {
    bag = buildShuffledBag(poolFor(), excludeSet(), avoidLast);
    index = 0;
  };

  const remember = (msg: string) => {
    sessionRecent = [...sessionRecent, msg].slice(-MAX_RECENT);
    writeSessionRecent(sessionRecent);
  };

  const reset = (nextPhase?: MultiAgentPhase, ctx?: WaitSceneContext) => {
    phase = nextPhase;
    if (ctx !== undefined) sceneCtx = ctx;
    lastShown = '';
    refill();
  };

  const setContext = (ctx?: WaitSceneContext) => {
    sceneCtx = ctx;
    refill(lastShown || undefined);
  };

  const next = (): string => {
    if (bag.length === 0 || index >= bag.length) {
      refill(lastShown || undefined);
    }
    const msg = bag[index] ?? poolFor()[0] ?? DEFAULT_MESSAGES[0]!;
    index += 1;
    lastShown = msg;
    remember(msg);
    return msg;
  };

  refill();

  return { next, reset, setContext };
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

const COMPLETION_GLOW_RGB = '16, 185, 129';
const REVIEW_GLOW_RGB = '245, 158, 11';

export function getCompletionGlowFilter(needsReview = false): string {
  const rgb = needsReview ? REVIEW_GLOW_RGB : COMPLETION_GLOW_RGB;
  return buildGlowFilter(rgb, needsReview ? 25 : 75);
}

export function getCompletionGlowBoxShadow(needsReview = false): string {
  const rgb = needsReview ? REVIEW_GLOW_RGB : COMPLETION_GLOW_RGB;
  return `0 0 18px rgba(${rgb}, 0.55), 0 0 8px rgba(${rgb}, 0.35)`;
}

/** @internal test helper */
export const __testOnly = {
  SESSION_KEY,
  MAX_RECENT,
  readSessionRecent,
  writeSessionRecent,
  buildShuffledBag,
  DEFAULT_MESSAGES,
};
