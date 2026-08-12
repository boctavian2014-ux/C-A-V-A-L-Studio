# SEC-Q1-QUALITY-GATES-001 — Quality gates globale

| Câmp | Valoare |
|------|---------|
| ID | SEC-Q1-QUALITY-GATES-001 |
| Severitate | Medie (merge/release) |
| Status | **FINALIZAT** — Faza 2 Q1-B…Q1-F |
| Owner | Platform / CI |
| Sprint | Q1 |
| Depinde de | P3 FINALIZAT CU LIMITĂRI; Δ6 → SEC-P3-BLOB-REVOKE-001 (Deschis, Scăzut) |

## Comenzi rulate (2026-08-12, Faza 2)

| Comandă | Exit | Rezumat |
|---------|------|---------|
| `npm run typecheck` | **0** | Curat |
| `npm run lint` | **0** | `--max-warnings 0`; 0 problems |
| `npm test` | **0** | 222 files / **1000 passed** / 2 skipped; security + P1/P2/P3/C1–C5 incluse |
| `npm run build` | **0** | webpack production + CSS + copy-renderer-static |
| `npm run verify-runtime-assets` | **0** | workers + renderer assets prezente; fără path-uri locale absolute în dist |
| `npm run smoke:electron` | **0** | main/preload/renderer ready; fără chei; închidere curată |
| `npm run releasepreflight` | **0** | aceleași gate-uri PR + file checks + smoke |
| `git diff --check` | **0** | Warning-uri LF→CRLF (working copy Windows) |
| `git status --short` | **0** | Working tree murdar (lots A–Q1 uncommitted) |

## Q1-C — clasificare fail-uri (înainte de fix)

| test/suite | cauză | clasificare | schimbare minimă |
|------------|--------|-------------|------------------|
| `project-health-ipc` untrusted | Fixture `https://evil.example/` este untrusted; catch mapa la `provider_error` | **regresie** | `safeErrorMessageForUi` păstrează mesajele IPC/trust |
| `lot-b-command-ipc` untrusted | același sender untrusted | **regresie** | idem; testul rămâne pe `/Untrusted IPC sender/` |
| `mcp-ipc` start/stop | `confirmMcpTrust` cere `dialog.showMessageBox`; mock electron fără `dialog` | **mock invalid** | mock `dialog.showMessageBox` → `{ response: 0 }` (Allow) |
| `mcp-ipc` `mcp:fetch:get` | trust pending fără start; gate C3 corect | **test depășit** | start cu Allow, apoi execute; deny rămâne mesajul real de rețea, nu slăbire C1 |
| `model-retry` 429 | `toSafeProviderError` mapa 429 → `provider_unavailable` | **regresie C5** | detectează 429 înainte de transient generic; assert pe tentative numărate |
| `model-retry` auth text | reason C5.1 este `never retry`, nu `not retryable` | **test depășit** | assert `retrySameModel/switchModel === false` + `/never retry/i`; 401/403 fără retry |
| `tool-sandbox` metachar | `SAFE_SCRIPT` respinge `build; rm -rf /` înainte de check metachar | **test depășit** | expect `Invalid npm script name`; allowlist neschimbat |
| `scad-runner` PATH gol | `discoverOpenScadBinary` găsește install Windows | **mediu / test** | `setOpenScadBinaryForTests(null)`; fără OpenSCAD local |
| `arena-transformer-mix` 15s | `runParallelArenaScans(process.cwd())` pe repo uriaș | **mediu / fixture** | workspace temp gol; timeout neschimbat |

## Gate-uri PR vs release

**Blochează PR** (`cicd:test`, `.github/workflows/test.yml`): typecheck → lint → test → build → verify-runtime-assets.

**Blochează numai release** (`release:preflight` default, `release:win`): aceleași gate-uri PR + file/icon/license/version + `smoke:electron`. Signing Windows rămâne warning fără certificat. Nu publică, nu cere chei/API.

Smoke pe PR: job separat xvfb, `continue-on-error` doar pe `pull_request`.

Detalii: `docs/ci/quality-gates.md`.

`electron-stderr.txt` este fixture istoric (2026-07, worker lipsă), nu log curent.
