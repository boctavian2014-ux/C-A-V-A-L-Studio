# Release security status — post-remediere (2026-08-12)

**HEAD documentat:** `cc124d8` plus acest fișier pe `main`
**Baseline pre-remediere (nu descrie starea actuală):** `AUDIT-CAVALLO-COMPLET.md` (2026-07-19, commit `defb984`, **fără remedieri**). Nu intra în release; păstrează-l local ca referință istorică.

Acest document înlocuiește auditul vechi ca **sursă de adevăr pentru starea de securitate după loturile A–C5, P1–P3, Q1 și SEC-IPC-WS-BINDING-001**.

## Rezumat

Nu mai există riscuri **Critic** deschise în backlog-ul urmărit. Binding-ul de workspace cere sender de încredere și un director existent/normalizat înainte de `bindWorkspace`, astfel încât Lot A/B, Project Health, git, terminal și CAD nu mai moștenesc un root contaminat.

Quality gates (typecheck, lint `--max-warnings 0`, 1000 teste, build, `verify-runtime-assets`, smoke Electron fără chei/CAD cloud) sunt în `cicd:test` / `release:preflight` și blochează PR-ul.

## Închis în acest ciclu

| ID / lot | Severitate | Stare |
|----------|------------|-------|
| Lot A filesystem IPC | Critic/Mare | Remediat |
| Lot B command / git / terminal / env | Critic/Mare | Remediat |
| Lot C1 SSRF / network guard | Mare | Remediat |
| Lot C2 extensions install + secrets flags | Mare | Remediat / controlat |
| Lot C3 MCP local trust + egress | Mare | Remediat; remote rămâne OFF |
| Lot C4 external URL policy | Mare | Remediat |
| Lot C5 provider errors + retry | Medie | Remediat |
| P1 streaming UI | — | Remediat |
| P2 unified abort | — | Remediat |
| P3 CAD anti-dup / OpenSCAD kill | — | Remediat cu Δ6 ticketed |
| Q1 quality gates + Electron smoke | Medie (merge) | **FINALIZAT** |
| SEC-IPC-WS-BINDING-001 | Critic | **FINALIZAT** |
| SEC-IPC-WS-VERIFY-001 | Mare | Remediat (Lot B — bound root only) |

## Backlog urmărit (nu limitări informale)

| Ticket | Severitate | Ce lipsește |
|--------|------------|-------------|
| [SEC-EXT-RUNTIME-PERMISSIONS-001](./SEC-EXT-RUNTIME-PERMISSIONS-001.md) | Mare | Nu activa rularea extensiilor până există sandbox și permission grants |
| [SEC-MCP-REMOTE-001](./SEC-MCP-REMOTE-001.md) | Mare | MCP remote rămâne OFF până la transport, trust și egress controlate |
| [SEC-C2-CAD-CLOUD-KEYS-001](./SEC-C2-CAD-CLOUD-KEYS-001.md) | Medie | Mută BYOK CAD către vault/profile server-side; elimină cheia din body main → CAD cloud |
| [SEC-MCP-STDERR-REDACTION-001](./SEC-MCP-STDERR-REDACTION-001.md) | Medie | Redactare stderr MCP end-to-end înainte de UI/log |
| [SEC-P3-BLOB-REVOKE-001](./SEC-P3-BLOB-REVOKE-001.md) | Scăzut | `URL.revokeObjectURL` exact-once pentru preview STL |
| [SEC-UI-ACCELERATOR-001](./SEC-UI-ACCELERATOR-001.md) | Scăzut | Repară acceleratorul invalid; scoate warning-ul din allowlist-ul de smoke |

## Gate-uri de release

Vezi [docs/ci/quality-gates.md](../ci/quality-gates.md). Smoke pe PR: `continue-on-error` doar la `pull_request` (infrastructură xvfb). Pe `main` și în `release:preflight` smoke-ul este blocant.

Cele 2 teste skipped: [docs/ci/skipped-tests.md](../ci/skipped-tests.md) (fashion-fullstack legacy).
