# SEC-P3-CAD-ANTI-DUP-001 — Anti-dublu job CAD (+ moștenire P2)

| Câmp | Valoare |
|------|---------|
| ID | SEC-P3-CAD-ANTI-DUP-001 |
| Severitate | Medie–Ridicată (cost cloud, race, UX cancel) |
| Status | **FINALIZAT CU LIMITĂRI** — lock atomic per workspace + M1–M4; Δ6 → [SEC-P3-BLOB-REVOKE-001](./SEC-P3-BLOB-REVOKE-001.md) |
| Owner | Platform / Engineering CAD |
| Sprint | P3 |
| Depinde de | SEC-P2-UNIFIED-ABORT-001 (**închis definitiv**; nu redeschide) |

## Scop principal

Prevenirea job-urilor CAD duplicate / orphan (create concurrent, supersede, retry, batch) și sincronizarea cu lock / ownership din P2.

## Proces obligatoriu

1. **Faza 1** — audit read-only (inventar + severități reale).
2. Planul se confirmă cu owner **înainte** de Faza 2 (implementare).
3. Nu presupune că limitările P2 sunt „deja rezolvate”.

---

## Faza 1 — MOȘTENIRE DIN P2 (de investigat, nu de presupus rezolvat)

Aceste patru puncte sunt **input obligatoriu** din auditurile P2 / limitările documentate. Fiecare rând trebuie auditat separat în tabelul Faza 1, cu severitate măsurată pe comportamentul actual al codului.

| # | Punct | Ce verifică auditul | Severitate inițială (de confirmat în Faza 1) | Nu presupune |
|---|--------|---------------------|-----------------------------------------------|--------------|
| M1 | **OpenSCAD mid-kill** | Dacă un proces OpenSCAD local poate fi omorât la jumătatea execuției fără fișiere temporare orfane sau file handles deschise; dacă `cancelOperation` / cancel CAD din P2 oprește efectiv procesul copil sau doar marchează jobul `cancelled` în state. | **Ridicată** (resurse / cost / rezultat `done` după cancel) | P2 nu a claim-uit kill pe `execFile(openscad)` |
| M2 | **CadActions Stop când `cadBusy`** | Dacă butonul Stop este disponibil și funcțional cât timp `cadBusy === true`, sau e disabled/absent exact când e nevoie; Stop doar pe AI `loading` / Preview cu `stlUrl` = regres UX. | **Medie** (UX cancel) | Unified Stop din P2 acoperă doar path-ul AI panel Stop |
| M3 | **Batch part DELETE** | Dacă ștergerea / anularea unui set de piese CAD este atomică sau poate lăsa state parțial când un job e activ concurrent; interacțiune cu lock-ul de job CAD din P3. | **Medie–Ridicată** (orphan jobs + state parțial) | `cancelCadJob` pe store `jobId` (adesea null în batch) anulează part-urile |
| M4 | **`clearCadPreview` fără ACK complet** | Dacă preview-ul local poate fi curățat înainte ca anularea remote să fie confirmată (UI gol, job remote încă activ); propune: curățare doar după ACK final (`ok`/`failed`/`skipped`) sau stare explicită `stale` până la ACK. | **Medie** (inconsistență UI↔remote; legat de supersede) | P2 ACK unificat pe Stop/unmount acoperă și `beginGenerate` → `clearCadPreview` |

### Checklist audit M1–M4 (Faza 1)

1. **OpenSCAD mid-kill**
   - Trace: `cancelCadJob` / `cancelOperation` → DELETE → `cancelCadJobProcessing` → `AbortController` registry → `scad-runner` / `execFile`.
   - Observă: kill real? tmp cleanup? handles? race `done` după cancel?
2. **CadActions Stop când cadBusy**
   - UI: `RoboticsResponseStage` CadActions, `EngineeringCadPreview`, `EngineeringAIPanel` Stop.
   - Matrice: AI loading / CAD busy / ambele / batch busy → Stop vizibil?
3. **Batch part DELETE**
   - `engineering-cad-batch.ts`: abort mid-part, double cancel, part `jobId` vs store `jobId`.
   - Atomicitate vs orphan + lock P3.
4. **clearCadPreview fără ACK**
   - `beginGenerate` → `clearCadPreview` / `clearCadJob` vs `cancelCadJob` + await remote.
   - Propunere sincronizare ACK / `stale` (nu implementa în Faza 1).

---

## Faza 1 — Scop anti-dublu (în plus față de M1–M4)

| Temă | Întrebări audit |
|------|-----------------|
| Gate `cadBusy` | Early-return vs coadă vs replace-with-cancel |
| Create mid-abort | Job creat după abort local → orphan? |
| Retry / new gen | Supersede explicit + ACK |
| Ownership / lock | Interacțiune cu `registerCadJobOwner` + `shouldIssueCadCancelOnce` |
| Concurrency | Double create, stale poll patch, epoch / `ownerStreamId` |

---

## Ieșire Faza 1 (before implement)

- Tabel inventar (fișier:linie) pentru anti-dublu **și** M1–M4.
- Severitate **reală** per rând (nu „P2 a rezolvat”).
- Plan Faza 2 propus → **stop** până la confirmare owner.

---

## Faza 1 — REZULTAT AUDIT (2026-08-12, read-only)

**Status ticket:** Deschis — audit Faza 1 **completat**; **așteaptă confirmare plan Faza 2**.
**P2:** rămâne închis. `operation-registry` **nu** previne create duplicate (doar owner + cancel-once după ce există `jobId`).

### Verdict scurt

| Zonă | Confirmat |
|------|-----------|
| Anti-dublu | Guard **doar renderer** (`cadBusy`); gap async la `preflightCadCloud`; **zero lock main** pe `cad:createJob` |
| `cadBusy` mid-batch | `syncLegacyFields` poate seta `cadBusy=false` când `phase→completed` la prima piesă, deși `batchBusy` rămâne true → create single poate porni în paralel cu batch |
| P2 registry | Nu e idempotency key pentru create; `workspaceRoot` adesea `""` la `registerCadJobOwner` (createJob din store **nu** trimite workspaceRoot) |
| M1 | Cancel = DELETE + AbortController registry; **`execFile(openscad)` fără signal** — timeout kill doar; `isJobAborted` **false** după cancel (entry ștearsă); `cancelCadJobProcessing` poate marca `cancelled` peste `done` |
| M2 | CadActions: **fără Stop**; Preview Stop doar cu `stlUrl` + submitting/processing; AI Stop doar `loading` — **nu** când doar `cadBusy` |
| M3 | Batch abort: skip rest + **fără** DELETE pe `part.jobId` activ; store `jobId` adesea null |
| M4 | `clearCadPreview`/`clearCadJob` = local only; AI gen nou orphan-uiește job remote |

### Tabel inventar (flux → remediere)

| Flux/punct | Fișier:linie | Identitate disponibilă | Guard UI | Guard main | Lock actual | Cursă/risc | Severitate confirmată | Remediere propusă | Test necesar |
|------------|--------------|------------------------|----------|------------|-------------|------------|----------------------|-------------------|--------------|
| CadActions Gen STL | `RoboticsResponseStage.tsx:582-599` | `projectPath`, prompt; **fără** operationId/streamId pe create | `disabled={busy\|\|!prompt}`; busy=`cadBusy\|\|batchBusy` | `assertTrustedSender` pe handle; **fără** anti-dup | Nu | Double-click în gap preflight → 2 IPC create | **Ridicată** | Lock main; UI disable imediat la click + ACK `cad_job_in_progress` | Două create simultane → 1 job |
| CadActions Batch | `RoboticsResponseStage.tsx:563-579` + store `863-929` | bom ids; part.jobId după create | `disabled={busy}` | Idem createJob N× | Nu (N job-uri) | N createJob secvențial; cancel nu DELETE part activ | **Ridicată** | Lock per workspace + policy batch cancel | Batch + cancel mid-part → 1 DELETE |
| CadActions Retry | `RoboticsResponseStage.tsx:647-657` + store `800-810` | `lastPlan` | Vizibil la `phase===failed` | Ca create | Nu | Retry+create overlap dacă cadBusy false | **Medie** | Același lock ca create | create+retry simultan |
| Preview Stop | `EngineeringCadPreview.tsx:53,142-157` | store.jobId | Stop **doar** dacă `stlUrl` **și** submitting/processing; altfel `return null` | cancel ownership P2 | cancel-once P2 | Stop **invizibil** pe tot processing tipic (fără STL) | **Medie (M2)** | Stop în CadActions când busy | Stop vizibil cu cadBusy, fără stlUrl |
| Preview Close | `EngineeringCadPreview.tsx:35-43` | — | confirm dacă editDirty | — | — | `clearCadJob` **fără** DELETE | **Medie (M4)** | Close mid-flight → cancel+ACK sau stale | Close mid-job → remote cancel |
| Store createCadJob | `engineering-cad-store.ts:536-797` | jobId după create; workspaceRoot local **nepassat** la IPC | `if (cadBusy) return` **înainte** de preflight | Nu anti-dup | Nu | (1) preflight async gap (2) abort după create fără DELETE `:763` (3) clearCadJob la start fără cancel | **Ridicată** | Acquire lock main; pe abort după jobId → cancel; supersede cu ACK | Abort mid-create → no orphan |
| Store retryCadJob | `engineering-cad-store.ts:800-810` | lastPlan | via createCadJob | — | — | Same as create | **Medie** | Same lock | — |
| Store pollCadJob | `engineering-cad-store.ts:431-534` | jobId capturat; pollToken singleton | token.aborted | — | — | Cross-talk job vechi/nou dacă token global | **Medie** | Bind poll la jobId/epoch | Stale poll nu patch job nou |
| Store cancelCadJob | `engineering-cad-store.ts:326-354` | jobId | — | owner + cancel-once | — | phase cancelled chiar dacă remote failed (mesaj local) | **Scăzută–Medie** (P2 partial) | Align cu cancelOperation ACK | Double cancel → 1 DELETE |
| Store clearCadJob/Preview | `engineering-cad-store.ts:315-324` | uită jobId | — | — | — | Orphan remote | **Medie (M4)** | Nu clear fără cancel/ACK/stale | clear ≠ orphan |
| syncLegacyFields cadBusy | `engineering-cad-store.ts:244-259,898-911` | — | CadActions busy | — | — | Mid-batch `phase=completed` → `cadBusy=false` deși `batchBusy` | **Ridicată** | `cadBusy \|= batchBusy` din state curent | Mid-batch create blocked |
| Batch runRoboticsCadBatch | `engineering-cad-batch.ts:161-314` | part.jobId | signal | N× createJob | Nu | Abort → skipped **fără** cancelJob(part.jobId) | **Ridicată (M3)** | DELETE part activ; queue/block policy | Abort mid-part → DELETE once |
| IPC cad:createJob | `cad-handlers.ts:485-561` | senderId; workspaceRoot opțional (deseori "") | — | trust + secrets; **acceptă orice create** | Nu | Duplicate IPC = duplicate cloud/local jobs | **Ridicată** | Atomic lock main; return existing op | IPC duplicate → same jobId |
| IPC cad:cancelJob | `cad-handlers.ts:585-595` | jobId, sender | — | assertCadJobOwnedBySender | cancel-once | OK P2 pentru single jobId | — | Păstrează; leagă de lock release | — |
| cancelCadJobRemote | `cad-handlers.ts:288-323` | jobId | — | shouldIssueCadCancelOnce | — | Nu kill OpenSCAD | vezi M1 | — | — |
| Preload cad.createJob | `preload.ts:862-880` | bridge | — | — | — | Orice renderer trusted | — | Tipuri + `cad_job_in_progress` | — |
| AI beginGenerate clear | `EngineeringAIPanel.tsx:220` | streamId separat | loading guard AI | — | — | clearCadPreview fără cancel remote | **Medie (M4)** | cancelOperation/cancelCadJob + ACK/stale înainte de clear | New AI gen cancels CAD |
| AI Stop | `EngineeringAIPanel.tsx:434-493,694-731` | streamId + jobId | Stop **doar** loading/aborting | cancelOperation | cancel-once | După plan + CAD busy: buton = Generează, nu Stop | **Medie (M2)** | Stop când `loading\|\|cadBusy\|\|batchBusy` | Stop cu doar cadBusy |
| AI unmount | `EngineeringAIPanel.tsx:60-105` | stream+job | — | best-effort cancelOperation | — | Fire-and-forget OK P2 | Scăzută | Păstrează | Unmount cleanup |
| Server cancel processing | `job-processor.ts:384-389` + `routes/jobs.ts:73-92` | jobId | — | cavalId ownership | registry AC | Suprascrie status inclusiv post-`done`; AC șters → `isJobAborted` false | **Ridicată (M1)** | No-op terminal; aborted-set persistent | Cancel after done no-op; cancel mid-run stays aborted |
| job-registry | `job-registry.ts:10-23` | jobId→AC | — | — | — | `cancel` delete → `isJobAborted` false; failIfAborted fragil | **Ridicată (M1)** | Păstrează aborted flag până clear | isJobAborted true după cancel |
| OpenSCAD render | `scad-runner.ts:80-116` | jobId tmp + mutex `cad:render:${jobId}` | — | timeout CAD_MAX_RENDER_MS | workspaceCadMutex per jobId | **Fără** AbortSignal; cancel nu kill mid-exec; finally rm tmp (dacă process iese) | **Ridicată (M1)** | spawn+kill tree; pass signal; cleanup pe kill | Mid-kill curăță tmp + lock |
| OpenSCAD install spawn | `openscad-install.ts` | winget/brew | — | mutex install | cad:installOpenScad | Nu pe cancel path job | Scăzută | Out of cancel-job scope | — |
| Mesh fetch | `mesh-client.ts:154+` | timeout AC | — | timeout | — | Job signal nelegat de fetch mesh | **Medie (M1-adj)** | Link job signal | Cancel mid-mesh aborts fetch |
| Mutex render | `workspace-execute-lock.ts` + scad-runner | per jobId key | — | exclusive | Da per render | Nu e lock create; nu e workspace-scoped create | — | Lock create separat workspace+sender | — |

### Matrice M2 — Stop vs phase / cadBusy

| Stare | cadBusy tipic | CadActions Stop | Preview Stop | AI Panel Stop |
|-------|---------------|-----------------|--------------|---------------|
| idle | false | absent | absent (`!stlUrl`) | Generează |
| submitting | true | absent (buton Gen disabled) | doar dacă stlUrl (rar) | doar dacă loading AI |
| processing / polling | true | absent | doar dacă stlUrl | doar dacă loading AI |
| batch running | batchBusy; cadBusy **poate false** mid-batch | absent | dacă stlUrl partial | nu |
| completed / failed | false | Retry pe failed | Close=clear local | Generează |
| cancelling | phase→cancelled | absent | — | Cancelling… pe AI path |

Double Stop Preview: `cancelCadJob` → main `shouldIssueCadCancelOnce` → al 2-lea DELETE skipped. UI nu arată ACK ok/failed/skipped pe CadActions (doar AI panel `cancelStatus`).

### Contract propus — Faza 2 (așteaptă confirmare)

**A. Lock atomic (main, obligatoriu)**
- Acquire **în main** înainte de orice `cad:createJob` / retry path.
- Cheie: `workspaceRoot + senderId` (dacă workspace gol: `senderId` + bound workspace din session).
- Duplicate → `{ ok:true, status:'cad_job_in_progress', jobId, operationId }` **fără** job nou.
- Retry folosește același lock (replace doar după cancel terminal sau policy supersede explicită).

**B. Lifecycle lock**
- Release **exact o dată** la: success / fail / cancel ACK / timeout / cleanup.
- Stale completion **nu** eliberează lock-ul unui job/operation nou (epoch / operationId).
- Lease/watchdog pentru job blocat (eliberare + status failed).

**C. OpenSCAD (M1)**
- Kill real child/process tree pe cancel (nu doar status).
- Cleanup tmp controlat; mutex release.
- `isJobAborted` persistent; no-op DELETE pe terminal; nu scrie `done` după abort.

**D. UI**
- Disable imediat create/retry la click (optimistic) + reconciliere pe `cad_job_in_progress`.
- **Stop vizibil** în CadActions (și panel) pentru toate stările busy (`cadBusy\|batchBusy`), nu doar Preview+stlUrl / AI loading.
- clear preview: după ACK terminal **sau** stare explicită `stale`/`cancelling`/`cancel_failed`.
- Mesaje ACK ok/failed/skipped pe path CAD Stop.

**E. Batch DELETE (M3)**
- Policy: **blochează** delete/clear total cât job part activ, **sau** cancel part + coadă; **sau** confirm dialog.
- La abort batch: `cancelJob(activePart.jobId)` once.
- Fără stare parțială tăcută (raport failed/skipped pe piese).

**F. Teste (mock, fără cloud/OpenSCAD real unde e posibil)**
1. Două create simultane → un singur job.
2. create + retry simultan → un singur job.
3. Policy workspace/sender.
4. Lock release pe success/fail/timeout/cancel.
5. Stale completion nu eliberează job nou.
6. Stop cu cadBusy; cancel trimis o dată.
7. Mid-kill OpenSCAD: tmp curat + lock free (unit cu mock spawn).
8. Batch delete/cancel cu job activ respectă policy.
9. Preview nu dispare prematur înainte de ACK (sau e `stale`).

### Explicit non-goals Faza 2 (dacă confirmi)

- Redeschiderea P2 / schimbarea contractului `cancelOperation` dincolo de hook-ul pe lock CAD.
- Auto-start CAD după AI.

### Consolidare audituri paralele (fără a redeschide Faza 1)

Surse: [Audit P3 CAD create paths](2b0093d5-46ca-4e41-ae35-113733462c0d), [Audit P3 M1-M4 CAD](6960385b-e96c-48bf-b206-9bfcdf55780c). Delta față de tabelul de mai sus — de inclus în Faza 2 dacă planul e confirmat:

| ID | Găsire | Severitate | Impact pe contract |
|----|--------|------------|-------------------|
| Δ1 | `bindCadJobToOperation` există dar **nu e apelat** nicăieri | Medie | Lock/operation: leagă `streamId`↔`jobId` la create sau scoate API mort |
| Δ2 | Retry CadActions (`Reîncearcă`) **fără** `disabled`/debounce pe `failed` | Ridicată | Acoperit de A (lock) + D (disable); test double-retry |
| Δ3 | `MAX_CREATE_RETRIES=3` + fallback IPC cloud→local pot dubla POST fără idempotency | Ridicată | A: același lock / idempotency pe POST; fallback nu creează al 2-lea dacă primul a reușit |
| Δ4 | Cancel → render continuă → `updateCadJob(done)` poate **suprascrie** `cancelled` | Critică (M1) | C: gate post-render pe `signal.aborted`; refuz cancelled→done |
| Δ5 | `clearLocalArtifacts(jobId)` neapelat la cancel | Medie (M1) | C: cleanup artifacts pe cancel |
| Δ6 | Blob URL-uri batch: revoke incomplet la `resetJobFields` | Medie (M3) | E: revoke la clear/cancel |
| Δ7 | `workspaceCadMutex` e per `jobId` render — **nu** anti-dup create | — | Confirmă A: lock create separat de mutex render |

**Stare:** Faza 1 audit închisă; Faza 2 **livrată** (vezi secțiunea Remediere).

---

## Faza 2 — Remediere livrată

### Contract implementat

| Bloc | Livrare |
|------|---------|
| A Lock | `src/main/cad-workspace-lock.ts` — cheie `cad:${realpath(workspaceRoot)}`; acquire înainte de orice POST în `cad:createJob`; duplicate → `cad_job_in_progress` (metadate sigure); senderId = ownership |
| B Lifecycle | bind jobId; release exact-once; heartbeat pe getJob/create; watchdog orphan pe heartbeat 120s + cancel best-effort |
| C M1 | `scad-runner` spawn + kill tree; `abortedJobIds` persistent; no `done` după cancel; terminal cancel no-op; `clearLocalArtifacts` |
| D M2 | CadActions Stop; AI Stop pe `cadBusy\|batchBusy`; `syncLegacyFields` păstrează `batchBusy`/`cancelling` |
| E M3 | Policy BLOCK pe clear/new gen; `cancelJobs` per part cu aggregate / `partiallyCancelled` |
| F M4 | phase `cancelling`/`stale`; preview păstrat până ACK; mesaj cancel neconfirmat |

### Δ1–Δ7 status

| ID | Status | Fișier:linie (ancoră) | Test |
|----|--------|----------------------|------|
| Δ1 bindCadJobToOperation | **Remediat** | `operation-registry.ts` `ensureCadOperationBound` + createJob wire | lot-p3-cad-workspace-lock + create path |
| Δ2 double-retry | **Remediat** | CadActions Retry `disabled={busy}`; lock main pe create | lot-p3 lock create+retry |
| Δ3 cloud→local double POST | **Remediat** | `cad-handlers` create: un singur success path, release pe fail | manual/IPC (lock + single post) |
| Δ4 cancel→done | **Remediat** | `job-processor.ts` gate înainte de `done`; registry aborted set | lot-p3-openscad-kill |
| Δ5 clearLocalArtifacts | **Remediat** | `cancelCadJobProcessing` / mark cancelled | lot-p3-openscad-kill |
| Δ6 blob revoke | **Ticketat** — [SEC-P3-BLOB-REVOKE-001](./SEC-P3-BLOB-REVOKE-001.md) (Deschis, Scăzut) | clear păstrează preview pe cancel; revoke pe clear terminal rămâne best-effort | mock createObjectURL / revokeObjectURL |
| Δ7 mutex ≠ create lock | **Documentat + remediat** | create lock separat de `workspaceCadMutex` render | lot-p3-cad-workspace-lock |

### Teste

- `tests/security/lot-p3-cad-workspace-lock.test.ts`
- `tests/security/lot-p3-openscad-kill.test.ts`
- `tests/security/lot-p2-unified-abort.test.ts` (regresie)

---

## După P3

P4 tab (dacă mai e nevoie) → P5 quality gates.
