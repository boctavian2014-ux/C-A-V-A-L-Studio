# SEC-UI-ACCELERATOR-001 — Accelerator Electron invalid în smoke

| Câmp | Valoare |
|------|---------|
| ID | SEC-UI-ACCELERATOR-001 |
| Severitate | **Scăzut** |
| Status | **Deschis** |
| Owner | Desktop / menu |
| Sprint | Post-Q1 (nu blochează quality gates) |
| Depinde de | SEC-Q1-QUALITY-GATES-001 (**FINALIZAT**) |

## Problemă

Smoke Electron emite:

`Invalid accelerator token: M CmdOrCtrl`

Sursa probabilă: chord-ul din meniul Go,

`accelerator: "CmdOrCtrl+M CmdOrCtrl+Q"` (`Last Edit Location` în `src/main/electron-main.ts`).

Electron/Chromium nu acceptă două acceleratoare separate prin spațiu; token-ul `M` este parsat greșit. Warning-ul este în allowlist-ul temporar de smoke (`scripts/electron-smoke-env.ts`) ca să nu eșueze boot-ul, dar **nu trebuie să rămână permanent** — poluează logurile și poate masca warning-uri reale.

## Remediere

- Înlocuiește chord-ul cu un accelerator valid (ex. `CmdOrCtrl+Alt+Q`) sau elimină shortcut-ul dacă nu e folosit.
- Scoate `/Invalid accelerator token/i` din `ELECTRON_SMOKE_WARNING_ALLOWLIST`.
- Confirmă `npm run smoke:electron` fără acel warning.

## Criteriu de acceptare

Smoke nu mai listează `Invalid accelerator token`. Allowlist-ul rămâne doar pentru React DevTools (opțional) și deprecarea `console-message` până la migrarea API-ului Electron.
