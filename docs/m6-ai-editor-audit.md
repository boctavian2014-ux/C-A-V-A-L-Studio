# M6 — Audit AI în editor

Audit de clasificare (fără feature code). Pattern: suprafețe după risc → gate clar → implementare incrementală. Continuă din M5 (context IDE, safe tools, timeline, writtenFiles).

## Inventar de suprafețe

| Operație | Scrie? | Gate | Stare actuală (repo) |
|---|---|---|---|
| Explain / hover | Nu | Safe direct, fără confirmare | ✅ 6.3 |
| Inline completion | Doar la Tab | Safe — user acceptă fiecare inserție | ✅ 6.2 |
| Quick fix pe diagnostics | Da, mic, localizat | Diff preview + undo nativ Monaco | ✅ 6.1 |
| Refactor multi-fișier | Da, larg | Confirmare explicită + diff complet + undo | ✅ 6.5 |
| Apply din chat | Da | writtenFiles + timeline (M5) | ✅ 6.4 |

## Clasificare de siguranță (rezumat)

- **Read-only** → fără confirmare (Explain / hover).
- **Inserție inline acceptată de user (Tab)** → fără diff separat; undo Monaco acoperă revertul.
- **Orice altă scriere** → diff preview obligatoriu; nicio editare silențioasă în afara selecției / zonei vizibile.
- **Refactor larg / multi-fișier** → confirmare explicită + diff complet.

## Principii de gate (obligatorii)

1. **Undo nativ Monaco** pentru orice edit AI — fără undo custom.
2. **Diff preview** pentru orice scriere dincolo de inserție inline acceptată cu Tab.
3. **Niciun edit silent** în afara selecției sau zonei vizibile.
4. **Timeline unificat**: orice edit AI emite `file_write` pe canalul din 5.4 — editorul și chat-ul văd aceeași realitate.
5. **Reutilizare**: diagnostics din Problems; validare / redacție ca la safe-tools (5.3).

## Puncte de integrare

| Capacitate | Unde | Rol în M6 |
|---|---|---|
| Problems / diagnostics | `src/renderer/store/problems-store.ts`, `ProblemsPanel`, `revealProblem`, tool `get_problems` (5.3) | Sursă de adevăr pentru quick fix; fără pipeline paralel de erori |
| Monaco editor | `src/renderer/components/editor/MonacoEditor.tsx` | Apply edit + undo nativ; stub inline deja prezent |
| ToolRegistry / safe tools | `ai/tools/tool-registry.ts`, `src/main/ai/ai-tools-executor.ts`, contract 5.3 | Orice tool nou de edit rămâne pe același registry + validare/redacție |
| writtenFiles | Composer / completion path (M5) | Apply din chat deja pe acest canal |
| Timeline | `src/shared/ai-timeline-contract.ts`, `timeline-emit`, `ChatUnifiedTimeline` | `file_write` la fiecare edit AI acceptat din editor |
| Smoke M5 | `tests/e2e/m5-ai-unified-smoke.test.ts` | Extensibil pentru 6.x (fixture Problems → fix → timeline → undo) |

## Plan de pași

### 6.1 — Quick fix pe diagnostics ✅

Implementat: canal stream existent (`quickFix` / `quickFixAccept`), validare zonă ±5 + caps, diff preview Monaco, `executeEdits` + undo stops, timeline `tool_call → tool_result → file_write` (file_write doar la Accept). Entry: ProblemsPanel „Fix AI” + lightbulb CodeAction. Smoke: `tests/e2e/m6-quick-fix-smoke.test.ts`.

Out of scope 6.1: multi-fișier, rename simbol, extract, free-form refactor.

### 6.2 — Inline completion (harden stub) ✅

Implementat: debounce 300 ms + `CancellationToken`, context ±20 linii redactat/untrusted, cap 10 linii, accept doar Tab (`command` pe item) → `timelineFileWrite` / `file_write`. Main `caval:autocomplete` redactează + sanitizează sugestia. Smoke: `tests/ai/inline-completion-harden.test.ts`.

Out of scope 6.2: multi-line agresive, FIM avansat, completion în terminal/diff.

### 6.3 — Explain / hover (read-only) ✅

Implementat: stream `explain` (fără IPC nou), context ±10 linii redactat/untrusted, selecție max 2 KB, explicație max 4 KB, debounce hover 500 ms + cancel, UI hover Monaco + panou selecție / acțiune „Explain with AI”. Timeline: `tool_call → tool_result` **fără** `file_write`. Smoke: `tests/ai/explain-read-only.test.ts`.

### 6.4 — Apply din chat ↔ editor parity ✅

Implementat: scaffold chat → `proposedWrites` (fără disc), card Accept/Reject + Monaco diff, apply pe disc + undo Monaco pentru tab deschis, Revert pentru fișiere noi, `file_write` doar la Accept. Pipeline arena/verify pe disc e amânat până după Accept. Smoke: `tests/ai/chat-apply-parity.test.ts`.

### 6.5 — Refactor multi-fișier (gated) ✅

Implementat: stream `refactor` (fără IPC nou), max 5 fișiere / 10 edituri / 16 KB, path + redacție, prompt context mărginit, **fără** write pe disc în main. Diff unificat (taburi Monaco) Accept all / Reject all; apply cu undo Monaco pe tab deschis + write/delete pe disc; Revert pentru new/deleted; `file_write` per fișier la Accept. Entry: context menu / Ctrl+Shift+R „Refactor with AI”. Smoke: `tests/ai/refactor-gated.test.ts`.

### 6.x — Smoke / E2E editor AI ✅

Implementat: `tests/e2e/m6-editor-ai-unified-smoke.test.ts` — un workspace, fără Playwright / LLM live. Traseu: quick fix → inline Tab → explain → chat apply → refactor; timeline per `streamId`, undo/Revert, redacție secrete, cleanup fără orfani.

## Decizie 6.1

**Quick fix pe diagnostics înainte de inline completion.**

Motive:

1. Validează primul gate de **scriere** (diff + undo + timeline), nu doar acceptarea unei inserții.
2. Reutilizează Problems + `get_problems` — fundație M5 deja smoke-uită.
3. Inline are deja un stub; harden-ul (6.2) e natural după ce fluxul de apply/diff e stabil.

Inline completion rămâne al doilea pas de implementare, nu primul.

## Non-goals (audit)

- Fără feature code în acest document.
- Fără tool-uri de write nesigure (ex. `git_commit`, PTY liber) — rămân în afara M6, ca la 5.3.
- Fără undo custom și fără panel timeline nou — doar canalul 5.4.
