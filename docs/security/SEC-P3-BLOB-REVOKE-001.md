# SEC-P3-BLOB-REVOKE-001 — Revoke determinist Blob URL CAD

| Câmp | Valoare |
|------|---------|
| ID | SEC-P3-BLOB-REVOKE-001 |
| Severitate | **Scăzut** |
| Status | **Deschis** |
| Owner | Platform / Engineering CAD |
| Sprint | Post-P3 (nu blochează merge P3) |
| Depinde de | SEC-P3-CAD-ANTI-DUP-001 (**FINALIZAT CU LIMITĂRI** — Δ6) |

## Problemă

După clear terminal, revoke pentru URL-urile Blob STL/preview rămâne **best-effort**; poate lăsa memorie nedealocată până la închiderea ferestrei.

Nu blochează corectitudinea jobului CAD sau securitatea IPC.

## Remediere

- Registry de object URLs per `jobId` / `operationId`
- Revoke exact-once la replace, terminal clear, unmount și window close
- Test cu mock `URL.createObjectURL` / `URL.revokeObjectURL`

## Criteriu de acceptare

Fiecare URL creat este revocat **exact o dată**, inclusiv după cancel, error, retry și schimbare de preview.
