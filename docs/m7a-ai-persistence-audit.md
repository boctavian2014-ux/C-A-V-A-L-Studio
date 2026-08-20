# M7a — Audit persistență AI

Audit de clasificare (fără feature code). Pattern: inventar → efemer vs persistent → stocare → gate → pași incrementali. Continuă din M5 (timeline) + M6 (editor writes pe același canal).

## Stare actuală (repo)

| Capacitate | Unde | Limitare |
|---|---|---|
| Threads / mesaje | `ai/composer/ai-store.ts` — Zustand `persist` → **localStorage** (renderer) | Nu trece prin main; fără redacție la write; un blob global; se umflă cu timeline + writtenFiles |
| Timeline | `src/main/ai/timeline-emit.ts` → chunk `timeline` pe stream → atașat pe `ChatMessage.timelineEvents` | Doar în memorie / localStorage după flush UI |
| Written files | `ChatMessage.writtenFiles?: string[]` (path-uri) | **Fără snapshot** de conținut — Revert istoric imposibil după restart |
| Proposed writes | `proposed-writes-buffer` (main, in-memory) | Corect efemer până la Accept (6.4) |
| Audit IPC | `src/main/audit-log.ts` → `{workspace}/.cavalo/audit/` | Precedent de persistență main pe workspace; nu e chat |
| SQLite | `better-sqlite3` + `src/main/db/ai-persistence.ts` | ✅ 7a.1 — `{workspace}/.cavalo/ai/history.db` |

Concluzie: există deja „istoric” UI, dar e **renderer-local, nerelational, fără gate de redacție la persistență**. M7a mută sursa de adevăr în **main**, cu redacție + izolarea workspace.

## Ce se persistă

| Entitate | Conținut | Durata de viață |
|---|---|---|
| Conversații | `id`, `title`, `workspace_root`, `created_at`, `updated_at`, optional `ide_context_mode` | Permanent până la ștergere explicită |
| Mesaje | `role` (user/assistant), `content`, `created_at`, `stream_id`, optional `model` | Legat de conversație (CASCADE) |
| Timeline events | `TimelineEvent` sanitizat per mesaj assistant | Legat de mesaj (CASCADE) |
| Written files | `file_path` + **snapshot** la Accept (redactat, capped) | Legat de mesaj (CASCADE) — pentru Revert istoric |
| Export sesiune | JSON / Markdown generat la cerere | **Efemer** — nu se stochează în DB |

## Ce rămâne efemer (by design)

| Entitate | Motiv |
|---|---|
| Stream-uri active | `streamRoots`, buffere, abort tokens — cleanup ca în M5 smoke |
| `proposedWrites` | Doar după Accept → path (+ snapshot) în `written_files` |
| Explain / hover | Contextual, read-only (6.3) — nu intră în DB |
| Inline ghost text | Doar Tab-accept mută textul în document; fără rând separat în DB |
| Activity / multi-agent UI steps | Opțional omit în v1 (pot fi reconstruite din timeline); evită dublarea |

## Unde se stochează

| Opțiune | Pro | Contra | Decizie audit |
|---|---|---|---|
| **SQLite (`better-sqlite3`) în main** | Relațional, CASCADE, query pe workspace | Dependență nativă nouă + rebuild Electron | **Țintă preferată** dacă packaging-ul acceptă native addon |
| **JSONL / JSON per conversație** sub `.cavalo/ai/` | Zero deps noi; aliniat cu `audit-log` / pipeline | Fără SQL; export ușor; scale limitat | **Fallback v1** dacă native e prea greu |
| IndexedDB (renderer) | Nativ | Inaccesibil din main; dublează problema localStorage | **Nu** |
| Un singur DB global în `userData` | Centralizat | Mixaj greșit dacă filtrezi greșit pe `workspace_root` | Acceptabil doar cu gate strict pe root |

**Recomandare de locație fișier:**  
`{workspaceRoot}/.cavalo/ai/history.db` (sau `.jsonl` în fallback) — izolarea e pe filesystem + coloană `workspace_root` ca apărare în adâncime.  
Modul: `src/main/ai/ai-persistence.ts` (+ `migrations` co-locate). Nu există încă `src/main/db/`.

**Notă packaging:** înainte de 7a.1, verificați costul `better-sqlite3` pe Windows/Electron (electron-rebuild). Dacă blochează, începeți cu JSONL și păstrați același contract CRUD — schema SQL rămâne ținta, nu obligatoriu ziua 1.

## Schema propusă (SQLite)

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  workspace_root TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  stream_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE timeline_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  tool_name TEXT,
  file_path TEXT,
  success INTEGER  -- 0/1/NULL
);

CREATE TABLE written_files (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  snapshot TEXT NOT NULL,   -- conținut la Accept, redactat + capped
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_conversations_workspace ON conversations(workspace_root, updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
```

Indici: obligatorii pentru listă conversații + restore mesaje.

## Decizie de hook (important)

**Nu** persista orbește în `emitTimelineEvent` la fiecare emit mid-stream: mesajul assistant poate încă să nu existe, iar `message_id` e necunoscut.

| Moment | Ce se scrie |
|---|---|
| User send | Upsert conversație + INSERT mesaj `user` |
| Stream done (assistant final) | INSERT mesaj `assistant` + batch INSERT `timeline_events` din bufferul mesajului + `written_files` dacă Accept a avut loc |
| Accept ulterior (quick fix / chat apply / refactor) pe mesaj existent | UPDATE/INSERT `written_files` + eventual append timeline `file_write` deja pe UI — sync pe același `message_id` / `stream_id` |

`emitTimelineEvent` rămâne canalul de UI; persistența e **flush la final de operație**, nu side-effect pe fiecare chunk (evită half-writes și orfani).

## Gate-uri

| Gate | Implementare |
|---|---|
| Redacție la persistență | `content`, `detail`, `snapshot` trec prin `redactSensitiveCommandOutput` / sanitize existente **înainte de INSERT** (nu doar la export) |
| Cap dimensiune | Mesaj max **32 KB**; snapshot max **64 KB**; soft limit **1000** mesaje / conversație (trim sau refuz write cu eroare UI) |
| Cascade delete | Ștergere conversație → mesaje → timeline → written_files |
| Export redactat | JSON/MD regenerat din DB; re-aplică redacție; fără secrete; efemer pe disc (user alege path) |
| Workspace isolation | List/load doar pentru `workspace_root` bound (același principiu ca IPC M5); fără cross-project |
| Fără secrets storage | Nu persista API keys, `proposedWrites` raw, sau conținut `.env` |
| Path traversal | `file_path` relativ normalizat; ca la 6.1/6.5 |

## Puncte de integrare

| Capacitate | Unde | Rol în M7a |
|---|---|---|
| Timeline sanitize | `src/shared/ai-timeline-contract.ts`, `timeline-emit.ts` | Reutilizează `sanitizeTimelineEvent`; flush DB separat |
| Chat state | `ai/composer/ai-store.ts` (`ChatThread`, `ChatMessage`) | Sursă UI; după 7a.4: hydrate din main, localStorage rămâne cache opțional sau se depreciază |
| Stream completion | Final stream în composer / model-handlers path | Persist assistant + timeline batch |
| Accept writes | Quick fix / chat apply / refactor accept paths | Snapshot redactat → `written_files` |
| AIPanel / thread list | `ai/composer/AIPanel.tsx` | Listă conversații + restore |
| Export | Command palette / buton chat | Generează JSON/MD din DB |
| Precedent workspace files | `.cavalo/audit`, `.cavalo/pipeline` | Același root bound |

## Plan de pași

| Pas | Descriere |
|---|---|
| **7a.1** ✅ | Contract + SQLite store + CRUD conversații/mesaje (+ timeline/written_files API); gate redacție/caps/CASCADE/izolation. Smoke unit: `tests/main/db/ai-persistence.test.ts` |
| **7a.2** ✅ | Flush timeline la final de mesaj assistant (buffer pe `streamId`, nu mid-`emitTimelineEvent`). Abort/error → `clearTimelineBuffer`. Smoke: `tests/main/ai/timeline-persistence.test.ts` |
| **7a.3** ✅ | Persistență `written_files` cu snapshot la Accept (chat apply + quick fix / timelineFileWrite). Reject = zero INSERT. Smoke: `tests/main/ai/written-files-persistence.test.ts` |
| **7a.4** ✅ | Încărcare istoric în UI (listă + restore mesaje/timeline/writtenFiles + Revert istoric + delete cascade). IPC `caval:ai-history-*`. Smoke: `tests/renderer/ai-history-restore.test.ts`, `tests/e2e/m7a-history-smoke.test.ts` |
| **7a.5** | Export sesiune JSON/MD, redactat, efemer |
| **7a.x** | Smoke E2E: conversație → „restart” (reload store din disc) → istoric restaurat → export fără secrete → cleanup |

## Decizie 7a.1

**CRUD conversații/mesaje înainte de timeline/written_files.**

Motive:

1. Fără `conversation_id` / `message_id` stabile, timeline și snapshot-urile nu au unde să se lege.
2. Validează gate-urile de workspace + redacție pe cel mai mic subset.
3. UI restore (7a.4) poate începe pe text-only, apoi îmbogățit.

## Non-goals

- Fără sincronizare cloud.
- Fără full-text search pe istoric (candidat M7d).
- Fără persistență explain / inline ghost.
- Fără undo custom pe fișiere din snapshot (Revert istoric = restore din snapshot, separat de undo Monaco pe sesiunea curentă).
- Fără feature code în acest document.

## Risc / ordine față de M7e

M7a consolidează datele pe care UX-ul (M7e) le va expune. Polish pe localStorage-ul actual ar îngropa debt-ul — de aceea persistența în main vine înainte de onboarding/settings granulare.
