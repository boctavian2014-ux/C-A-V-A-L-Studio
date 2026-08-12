# SEC-P2-UNIFIED-ABORT-001 — Anulare unificată AI + CAD

| Câmp | Valoare |
|------|---------|
| ID | SEC-P2-UNIFIED-ABORT-001 |
| Severitate | Medie (produs / corectitudine) |
| Status | **Remediat** (cu limitări minore de produs) |
| Owner | Platform / AI runtime |
| Sprint | P2 |

## Remediere livrată

1. Registry operații: `src/main/operation-registry.ts` (`operationId`, `streamId`, `cadJobId`, owner, status).
2. Ask-mode: `AbortController` per `streamId` + `signal` în `executeModelCompletion` / `ModelRouter.linkAbortWithTimeout`.
3. IPC `caval:cancel-operation` (trust + ownership); `caval:ai-stream-abort` apelează același abort de signal.
4. CAD: `registerCadJobOwner` la create; cancel cross-sender respins; DELETE o singură dată (`shouldIssueCadCancelOnce`).
5. UX Stop: `Cancelling…` → `Canceled` / `Could not cancel remotely`.

## Limitări rămase → handoff P3 (obligatoriu)

P2 este **închis definitiv**. Nu redeschide acest ticket pentru limitările de mai jos.
Ele intră formal ca **MOȘTENIRE DIN P2** în [SEC-P3-CAD-ANTI-DUP-001](./SEC-P3-CAD-ANTI-DUP-001.md) (Faza 1 audit), nu ca follow-up separat:

1. OpenSCAD mid-kill (proces copil vs doar status `cancelled`)
2. CadActions Stop când `cadBusy`
3. Batch part DELETE / orphan + lock
4. `clearCadPreview` fără ACK complet (UI vs remote)

Alte note (nu redeschid P2):

- Tool-loop / multi-agent păstrează map-ul separat; Robotics ask folosește registry-ul nou.
- Anularea remote CAD depinde de disponibilitatea API; poll local este mereu oprit.

## Teste

`tests/security/lot-p2-unified-abort.test.ts`
