# SEC-UI-ACCELERATOR-001 — Accelerator Electron invalid în smoke

| Câmp | Valoare |
|------|---------|
| ID | SEC-UI-ACCELERATOR-001 |
| Severitate | **Scăzut** |
| Status | **FINALIZAT** (2026-08-12) |
| Owner | Desktop / menu |
| Sprint | Post-Q1 |
| Depinde de | SEC-Q1-QUALITY-GATES-001 (**FINALIZAT**) |

## Problemă

Smoke Electron emitea `Invalid accelerator token: M CmdOrCtrl` din chord-ul invalid

`accelerator: "CmdOrCtrl+M CmdOrCtrl+Q"` (`Last Edit Location`).

Electron nu acceptă două acceleratoare separate prin spațiu.

## Remediere

- Shortcut: `CmdOrCtrl+Alt+Q`
- `/Invalid accelerator token/i` scos din allowlist; linia este **fatală** în smoke (regresie)
- Test: `tests/main/menu-accelerators.test.ts`

## Criteriu de acceptare

Smoke nu mai listează `Invalid accelerator token`. Allowlist: React DevTools + deprecarea `console-message`.
