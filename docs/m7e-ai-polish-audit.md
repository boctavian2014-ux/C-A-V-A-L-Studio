# M7e — Audit AI Polish

Audit UX (fără feature code dincolo de plan). Continuă din M7a (persistență SQLite + istoric + export). Pattern: inventar → prioritate → pași incrementali + commit țintă.

## Inventar de zone

| Zonă | Risc scriere | Dependințe | Note |
|---|---|---|---|
| Onboarding AI | Zero | Independent | Empty state + tip-uri prim-use; state UI în localStorage |
| Feedback 👍/👎 | Mic (coloană/tabel pe `messages`) | 7a.1 persistence | Nu scrie fișiere proiect |
| Setări granulare | Zero (config) | Tool-uri M5/M6, redacție | Preferințe locale / settings file |
| Performanță istoric | Zero | AIPanel history (7a.4) | Lazy / virtualizare |
| A11y timeline | Zero | `ChatUnifiedTimeline` (5.4) | Keyboard + ARIA |

Toate sunt **low-risk** față de M5/M6: nicio suprafață nouă de scriere AI → **fără** gate-uri diff/undo. Focusul auditului e prioritate UX, nu clasificare de siguranță.

## Ordine confirmată

1. **7e.1** — Onboarding AI  
2. **7e.2** — Feedback 👍/👎  
3. **7e.3** — Setări granulare  
4. **7e.4** — Performanță istoric + A11y timeline  

## Gate-uri (7e.1)

1. **Fără DB AI** — onboarding / „seen features” rămân în `localStorage`, separate de `{workspace}/.cavalo/ai/history.db`.
2. **Non-intrusiv** — tip-uri o singură dată per feature, dismissible.
3. **Empty state** — doar pe chat gol (`messages.length === 0`); nu înlocuiește istoricul restaurat.
4. **Fără emoji-uri decorative** în UI IDE — label-uri text, aliniate cu densitatea AIPanel.

## Puncte de integrare (repo)

| Element | Unde |
|---|---|
| Empty chat | `ai/composer/AIPanel.tsx` (zona messages) |
| Quick fix preview | `src/renderer/components/editor/QuickFixDiffPreview.tsx` |
| Explain panel | `src/renderer/components/editor/ExplainSelectionPanel.tsx` |
| Refactor preview | `src/renderer/components/editor/RefactorDiffPreview.tsx` |
| Inline accept | `src/renderer/components/editor/MonacoEditor.tsx` (`caval.inlineCompletion.accept`) |
| Safe tools (copy) | `get_problems`, `git_status`, `run_task`, `open_preview` (M5.3) |

## Plan de pași

### 7e.1 — Onboarding AI

- Empty state: capabilități + prompt suggestions + expand „tools”.
- Tip prim-use: quick-fix / explain / refactor / inline (localStorage).
- Smoke: `tests/renderer/ai-onboarding.test.tsx`.
- Commit: `feat(ui): add AI onboarding empty state and feature tooltips`

### 7e.2 — Feedback 👍/👎

- Tabel `message_feedback` (UNIQUE message_id, CASCADE).
- IPC `caval:ai-history-*-feedback`; UI pe MessageBubble (assistant, după stream).
- Aliniere id: `assistantMessageId` la persist + fallback pe `streamId`.
- Smoke: `tests/main/db/ai-persistence-feedback.test.ts`, `tests/renderer/message-feedback.test.tsx`.
- Commit: `feat(ai): add thumbs up/down feedback on assistant messages`

### 7e.3 — Setări granulare

- `{workspace}/.cavalo/ai/settings.json` (nu history.db).
- Toggle tools / redaction level / caps / timeline detail.
- Gate în `executeAiTool`; caps + redaction în persistență.
- UI: `AiSettingsPanel` din AIPanel (⚙).
- Smoke: `tests/main/ai/ai-settings.test.ts`, `tests/main/ai/tool-registry-settings-gate.test.ts`.
- Commit: `feat(ai): add granular settings for tools, redaction, and caps`

### 7e.4 — Performanță + A11y

- Paginare `listConversations` (limit/offset) + index `idx_conversations_workspace_updated`.
- Infinite scroll istoric (`HistoryList` + IntersectionObserver, fără dependință nouă).
- `getMessageDetails` pentru lazy per-mesaj; restore conversație rămâne pe `getConversation` (doar la select).
- Timeline: `role="log"`, `aria-live`, `aria-label`, Tab + Enter/Space pe detalii.
- Smoke: `tests/main/db/ai-persistence-pagination.test.ts`, `tests/renderer/history-list-infinite-scroll.test.tsx`, `tests/renderer/timeline-a11y.test.tsx`.
- Commit: `perf(ai): paginate history list and harden timeline accessibility`

## Non-goals

- Fără migrare onboarding în SQLite.
- Fără tour modal full-screen.
- Fără schimbare de policy pe tool-uri (doar explicații UX).

## Stare

| Pas | Stare |
|---|---|
| Audit | ✅ acest document |
| 7e.1 Onboarding | ✅ empty state + tip-uri prim-use (localStorage) |
| 7e.2 Feedback 👍/👎 | ✅ `message_feedback` + IPC + UI pe assistant bubbles |
| 7e.3 Setări granulare | ✅ settings.json + tool gate + caps/redaction/timeline |
| 7e.4 Perf + A11y | ✅ paginare istoric + infinite scroll + timeline a11y |
