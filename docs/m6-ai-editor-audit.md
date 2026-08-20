# M6 — Audit AI în editor

Audit de clasificare (fără feature code). Pattern: suprafețe după risc → gate clar → implementare incrementală. Continuă din M5 (context IDE, safe tools, timeline, writtenFiles).

## Inventar de suprafețe

| Operație | Scrie? | Gate | Stare actuală (repo) |
|---|---|---|---|
| Explain / hover | Nu | Safe direct, fără confirmare | Nu există ca flow AI dedicat |
| Inline completion | Doar la Tab | Safe — user acceptă fiecare inserție | Stub `registerInlineCompletionsProvider` + `caval.autocomplete` în `MonacoEditor.tsx` (ghost text; fără timeline / gate explicit documentat) |
| Quick fix pe diagnostics | Da, mic, localizat | Diff preview + undo nativ Monaco | Lipsă; Problems există (`problems-store`, `ProblemsPanel`, `revealProblem`) |
| Refactor multi-fișier | Da, larg | Confirmare explicită + diff complet + undo | Lipsă ca surface editor AI |
| Apply din chat | Da | writtenFiles + timeline (M5) | Parțial acoperit (M5 / composer) |

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

### 6.3 — Explain / hover (read-only)

Simbol / selecție → explicație AI. Zero scriere. Poate reutiliza context IDE (5.2).

### 6.4 — Apply din chat ↔ editor parity

Închide golurile rămase față de writtenFiles + timeline: același `file_write`, același undo/diff unde e cazul, fără canal paralel.

### 6.5 — Refactor multi-fișier (gated)

Confirmare explicită + diff complet pe toate fișierele + undo. Doar după ce 6.1–6.2 au dovedit gate-ul pe scrieri mici.

### 6.x — Smoke / E2E editor AI

Extinde smoke-ul M5 (sau fixture dedicat): Problems → quick fix → timeline `file_write` → undo; optional Tab-accept pe inline. Fără Playwright / LLM live, același stil in-process ca 5.5.

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
