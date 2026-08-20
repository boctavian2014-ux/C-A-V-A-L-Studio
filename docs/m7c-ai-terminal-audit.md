# M7c — Audit AI în terminal

Continuă din M7d (workspace intelligence). Pattern: inventar → prioritate → pași incrementali + commit țintă.

**Ordine confirmată față de M7b:** **M7c** (mic, UX vizibil) → M7b (multi-agent avansat). M7c nu depinde de M7b; refolosește gate-urile M5/M6/M7e (explain, redacție, abort, timeline) și opțional contextul M7d.

## Inventar

| Capacitate | Descriere | Scrie? | Gate | Stare |
|---|---|---|---|---|
| Explain output | Explică selecție / ultimele linii din PTY | Nu | Read-only; redacție + caps; untrusted delimiters; abort | ❌ absent |
| Suggest commands | Propune comenzi din erori / output | Nu (până la confirmare) | Propose-only; allowlist înainte de insert/run; confirm | ❌ absent (precedent: debug/mobile) |
| Output / Problems → Chat | Draft în chat din panou | Nu | Truncate; path prin chat main | ✅ parțial |
| Interactive PTY | create / write / output | Process spawn | Trusted sender; cwd = workspace bound; shell din main | ✅ M3 |
| One-shot AI shell | `run_terminal` / tools | Allowlisted cmds | `assertShellCommandAllowed` + redacție | ✅ M5 |
| Editor Explain (6.3) | Hover / selecție | Nu | Pattern de reutilizat pentru 7c.1 | ✅ M6 |

## Ordine confirmată

1. **7c.1** — Explain terminal output (read-only)  
2. **7c.2** — Suggest commands (propose-only; insert doar cu confirm + allowlist)  
3. **7c.3** — Polish: menu/palette, redacție comună, UX debt (selection / `run-in-terminal`)  

## Gate-uri (obligatorii)

1. **Read-only pe explain** — nicio scriere pe disk / nicio comandă auto-executată din 7c.1.
2. **Redacție obligatorie** — orice blob PTY trece prin `redactSensitiveCommandOutput` înainte de model / timeline / draft chat.
3. **Untrusted delimiters** — output-ul e date, nu instrucțiuni (ca la explain editor / IDE context).
4. **Caps** — limită pe selecție / ultimele N linii / caractere (oglindă `EXPLAIN_MAX_*` / Output → Chat).
5. **Suggest ≠ execute** — sugestiile sunt text; insert în PTY doar după confirmare; auto-run doar pe allowlist.
6. **Abort** — același `streamId` / `caval:ai-stream-abort` ca la explain.
7. **Fără M7b** — single-shot pe chat stream existent; fără arena / multi-agent.
8. **Fără persistare explain în SQLite** — ephemeral (M7a non-goal pentru explain blobs).

## Puncte de integrare (repo)

| Element | Unde |
|---|---|
| Terminal panel (activ) | `src/renderer/components/terminal/TerminalPanel.tsx` (`TerminalSessions`) |
| Contract / IPC | `src/shared/terminal-contract.ts`, `terminal-ipc-channels.ts`, `terminal-handlers.ts` |
| Preload | `src/main/preload-terminal.ts` |
| Explain editor (reuse) | `src/main/ai/explain-runner.ts`, `src/shared/ai-explain-contract.ts`, `src/renderer/ai/explain-client.ts` |
| Redacție | `src/shared/command-output-redaction.ts` |
| Chat draft | `ai/composer/ai-store.ts` → `queueChatFromPanel` (Output/Problems deja) |
| Shell allowlist | `src/main/shell-security.ts`, `terminal-bridge.ts` |
| Timeline / abort | `timeline-emit.ts`, stream abort M5 |
| Context opțional (7c.2) | `enhanced-context.ts` (M7d) — keywords din erori |
| Precedent suggest | `caval:debug-suggest-fix`, `mobile/mobile-build-agent.ts` |

## Plan de pași

### 7c.1 — Explain terminal output

- Contract `src/shared/ai-terminal-contract.ts`
- Runner `src/main/ai/terminal-explain.ts` (output text, nu filePath)
- Client + popover în `TerminalPanel` / `TerminalSessions` (selecție, context menu, Ctrl+Shift+E când terminal are selecție)
- Wire pe canalul stream existent (`terminalExplain`, ca `explain`)
- Smoke: `tests/main/ai/terminal-explain.test.ts`
- Commit: `feat(ai): add terminal output explain with read-only gate`
- Stare: ✅

### 7c.2 — Suggest commands

- Contract + allowlist în `src/shared/ai-terminal-contract.ts`
- Runner `src/main/ai/terminal-suggest.ts` (propose-only)
- UI: `SuggestedCommandsCard` + insert în `TerminalInput` (fără Enter)
- Entry: Terminal „Suggest fix”, Tasks failed „Suggest fix”, chat shell fences
- Smoke: `tests/main/ai/terminal-suggest.test.ts`
- Commit: `feat(ai): add terminal command suggestions with allowlist gate`
- Stare: ✅

### 7c.3 — Polish + harden

- Menu / Command Palette: Explain Terminal Output, Suggest Command
- Formatter comun Output/Problems/Terminal → Chat cu redacție
- Decizie UI: selection pe `TerminalSessions` vs remount xterm (`TerminalSession.tsx` orphan)
- Commit: `feat(ui): wire terminal AI actions into menu and harden redaction`

## Non-goals (M7c)

- Multi-agent / arena (M7b)
- Auto-execuție free-form în PTY fără allowlist + confirm
- Inline completion / FIM în terminal (out of M6)
- Înlocuire `run_terminal` / MCP bridge
- Persistare explain/suggest în `history.db`
- Rewrite complet xterm ca scop primar

## Gaps / riscuri

| Risc | Mitigare |
|---|---|
| Fără selecție pe terminalul activ (div plain) | 7c.1: „last N lines” + selecție text minimală; xterm doar dacă e necesar |
| `run-in-terminal` nu scrie pe UI activ | Fix în 7c.2 |
| Secrete în scrollback | Redacție obligatorie + caps |
| Prompt injection din output | Untrusted wrappers |
| Dual UI (xterm orphan vs TerminalSessions) | 7c.3 decide; nu blochează 7c.1 |

## Stare

| Pas | Stare |
|---|---|
| Audit | ✅ acest document |
| 7c.1 Explain output | ✅ |
| 7c.2 Suggest commands | ✅ |
| 7c.3 Polish | ⏳ |
