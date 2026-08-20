# M7d — Audit Workspace Intelligence

Continuă din M7e (polish). Pattern: inventar → prioritate → pași incrementali + commit țintă.

**Ordine recomandată față de M7b/M7c:** M7c (mic) → **M7d** (fundație) → M7b (beneficiază de index). Acest milestone pornește cu **7d.1** la cerere explicită.

## Inventar

| Capacitate | Descriere | Scrie? | Gate |
|---|---|---|---|
| Indexare fișiere | Scan workspace: simboluri / importuri / exporturi | Nu (doar `.cavalo/ai/workspace-index.json`) | Read-only pe surse; exclude `node_modules`, `.git`, binare, secrete |
| Căutare semantică | Query natural → fișiere/simboluri relevante | Nu | Peste index; fără execuție |
| Context îmbunătățit | Chat include fișiere relevante automat | Nu | Caps pe tokeni; redacție existentă M5/M7e |

## Ordine confirmată

1. **7d.1** — Indexare fișiere (simboluri + structură + watcher)  
2. **7d.2** — Căutare peste index (nume/simboluri; embeddings opțional ulterior)  
3. **7d.3** — Context AI îmbunătățit din index  

## Gate-uri (7d.1)

1. **Read-only pe surse** — indexerul nu modifică fișierele proiectului.
2. **Fără corp de funcții în index** — doar nume/kind/linie + importuri/exporturi.
3. **Exclude** — `node_modules/`, `.git/`, `dist/`, `build/`, `.cavalo/`, binare, `.env*`, peste cap dimensiune.
4. **Cap fișiere** — scan limitat (ex. 5000); nu blochează UI (fire-and-forget la open).
5. **Debounce watcher** — re-index incremental pe path, nu la fiecare eveniment imediat.
6. **Persistență regenerabilă** — JSON la `{workspace}/.cavalo/ai/workspace-index.json`, nu SQLite.

## Puncte de integrare (repo)

| Element | Unde |
|---|---|
| Open workspace | `src/main/electron-main.ts` (`bindWorkspace` / `openFolder` / `sendWorkspaceToRenderer`) |
| Context Engine existent | `context-engine/` — semantic docs; **complementar**, nu înlocuit în 7d.1 |
| Symbol walk existent | `context-engine/symbol-index.ts` — search UI; indexul M7d e structură per-fișier persistată |
| AI settings / history | `.cavalo/ai/` — același folder, fișier separat |

## Plan de pași

### 7d.1 — Indexare fișiere

- Contract `src/shared/workspace-index-contract.ts`
- `workspace-indexer.ts` (regex parse, walk nativ — fără `glob`/`chokidar`)
- `workspace-index-store.ts` (JSON)
- `file-watcher.ts` (`fs.watch` recursive + debounce)
- Service + wire la open workspace; IPC status opțional
- Smoke: `tests/main/workspace/*.test.ts`
- Commit: `feat(ai): add workspace file indexer for symbols and structure`

### 7d.2 — Căutare

- Matching pe simboluri/path/importuri; embeddings doar dacă e nevoie fără a bloca.

### 7d.3 — Context chat

- Injectare fișiere relevante în prompt (caps + redaction).

## Non-goals (7d.1)

- Fără embeddings / model extern.
- Fără folosire activă în prompt (pregătire pentru 7d.3).
- Fără dependință nouă (`chokidar` / `glob` / `ts-morph`).
- Fără înlocuire Context Engine.

## Stare

| Pas | Stare |
|---|---|
| Audit | ✅ acest document |
| 7d.1 Indexare | ✅ scan + JSON + watcher + IPC status |
| 7d.2 Căutare | ⏳ |
| 7d.3 Context AI | ⏳ |
