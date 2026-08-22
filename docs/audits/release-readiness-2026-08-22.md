# Caval Studio — Release Readiness Audit

**Date:** 2026-08-22  
**Auditor:** Cursor agent (automated investigation + local gate runs)  
**Repository:** `boctavian2014-ux/C-A-V-A-L-Studio`  
**Branch audited:** `docs/ci-expo-tsconfig-base-001`  
**HEAD SHA:** `db7b43c` (`feat(ai): show live coding activity in editor work canvas`)  
**Package:** `caval-studio@0.1.0` (Electron desktop IDE)

---

## 1. Executive status

### Verdict: **NO-GO**

Release from the current branch/state is **not recommended**. Core quality gate `npm test` fails (3 tests). The working tree is heavily dirty (~151 modified paths). The release branch is **~98 commits ahead** of its remote tracking branch and **~100 commits diverged** from `origin/main` without a merged release PR. Dependency audit reports **1 critical + 8 high** vulnerabilities.

A **conditional GO WITH WARNINGS** could apply only after: (a) all tests green, (b) branch merged/rebased onto `main` with CI green, (c) worktree clean or intentionally scoped, (d) npm audit triaged.

---

## 2. Scope and access limits

| Area | Access | Notes |
|------|--------|-------|
| Local filesystem / git | Full | Commands run on Windows dev machine |
| `npm` scripts | Full | typecheck, lint, test, build, verify-runtime-assets, smoke:electron, i18n:audit |
| GitHub CLI (`gh`) | Partial | Remote, recent workflow runs on `main`; **no runs found** for current branch |
| Railway CLI/API | **Not available** | No authenticated Railway session in this environment |
| Supabase dashboard/API | **Not available** | No authenticated Supabase session; local `.env` names only (values **not** recorded) |
| Manual UI click-through | **Not performed** | Functional matrix based on automated tests + static analysis |
| Secrets / `.env` values | **Redacted** | Only `missing` / `present` / `empty` / `unused` reported |

**Safety:** No deploy, push, reset, rebase, delete, or application code changes were made. Only this report file was created.

---

## 3. Inventory

### 3.1 Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 42.x (`dist/main/electron-main.js`) |
| UI | React 19 + Zustand |
| Editor | Monaco (`@monaco-editor/react`) |
| Build | Webpack 5 (main + renderer + node-services) |
| Tests | Vitest 3.x (337 test files, ~1677 tests) |
| Installer | electron-builder (NSIS Windows, DMG macOS, AppImage Linux) |
| Package manager | npm (`package-lock.json`) |
| Node | `>=20` (CI uses 20) |

### 3.2 Processes

| Process | Entry |
|---------|-------|
| Main | `src/main/electron-main.ts` → `dist/main/electron-main.js` |
| Preload | `src/main/preload.ts` → `dist/main/preload.js` |
| Renderer | `src/renderer/workbench-app.tsx` → `dist/renderer/` |
| CAD cloud (optional) | `engineering/cad-server/standalone.ts` (Railway Docker) |
| Billing (optional) | `billing/standalone.ts` |
| Marketplace (optional) | `marketplace/server/standalone.ts` |

### 3.3 npm scripts (release-relevant)

| Script | Purpose |
|--------|---------|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings 0` |
| `npm test` | `vitest run` |
| `npm run build` | clean + webpack production + CSS + static copy |
| `npm run verify-runtime-assets` | Runtime asset integrity |
| `npm run smoke:electron` | Headless Electron boot smoke |
| `npm run release:preflight` | Pre/post build checks + PR quality gates + smoke |
| `npm run dist` / `dist:win` | electron-builder installers |
| `npm run cicd:test` | CI test runner wrapper |

### 3.4 Environments

| Environment | Definition | Evidence |
|-------------|------------|----------|
| **Local dev** | `npm run dev` + `npm start` | README, webpack watch |
| **Test** | Vitest jsdom/node | `vitest.config.ts`, 337 test files |
| **CI** | GitHub Actions Ubuntu | `.github/workflows/test.yml` |
| **Preview** | Electron dev / built `dist/` | `npm start`, preview loopback |
| **Production (desktop)** | Signed NSIS/DMG/AppImage | `installer/config/electron-builder.yml` |
| **Production (CAD cloud)** | Railway Docker | `railway.toml`, `engineering/cad-server/Dockerfile` |
| **Production (billing)** | Optional Node server + Supabase | `billing/`, env-gated |

### 3.5 External services detected

| Service | Used by | Evidence |
|---------|---------|----------|
| **GitHub** | Source, CI, releases | `origin` remote, `.github/workflows/test.yml` |
| **Railway** | CAD cloud backend only | `railway.toml`, `CAD_API_URL`, `network-guard.ts` allowlist |
| **Supabase** | Billing + CAD persistence (server-side) | `supabase/migrations/`, `billing/supabase/`, `@supabase/supabase-js` |
| **Stripe** | Billing webhooks | `billing/`, env vars |
| **OpenRouter / Ollama / custom providers** | AI inference | `ai/providers/`, settings UI |
| **Vercel** | **NOT APPLICABLE** | No `vercel.json`, no deploy scripts; only generic references |
| **Docker** | CAD server + mesh worker images | `engineering/cad-server/Dockerfile`, `engineering/mesh-worker/Dockerfile` |

### 3.6 CI/CD layout

- `.github/workflows/test.yml` — push to `main`/`develop`, all PRs
- `.cicd/scripts/` — quality gates, release preflight, signing, publish
- `installer/` — electron-builder, NSIS, signing config
- `.cicd/docs/cicd.md` — pipeline documentation

---

## 4. GitHub / Repository

| Control | Result | Notes |
|---------|--------|-------|
| Remote configured | **PASS** | `origin` → GitHub repo (URL not repeated here) |
| Current branch | **WARN** | `docs/ci-expo-tsconfig-base-001`, **ahead 98** of remote tracking |
| Tracking vs `main` | **FAIL** | ~100 commits ahead of `origin/main`; not release-aligned |
| Working tree clean | **FAIL** | **~151** modified paths; large uncommitted delta |
| Stash | **WARN** | `stash@{0}: arena WIP` on same branch — known failing arena tests when popped |
| Latest commit | **PASS** | `db7b43c` — AI Work Canvas (committed) |
| `main` branch exists | **PASS** | Local `main` exists; **behind origin by 1** |
| Tags / GitHub Releases | **WARN** | `gh release list` returned no recent releases in this session |
| CI workflow present | **PASS** | `.github/workflows/test.yml` |
| CI on current branch | **FAIL** | `gh run list --branch docs/ci-expo-tsconfig-base-001` — **no runs**; workflow triggers `main`/`develop` only |
| Last CI on `main` | **PASS** | Success 2026-08-13 (multiple green runs via `gh run list`) |
| Branch protection | **WARN** | `gh api …/branches/main/protection` → **404 Branch not protected** |
| Dependabot | **WARN** | No `.github/dependabot.yml` found |
| `.gitignore` — `.env` | **PASS** | `.env` ignored (`git check-ignore` confirmed) |
| `.gitignore` — `node_modules`, `dist` | **PASS** | Ignored |
| `.gitignore` — `release/` artifacts | **WARN** | `release/`, `release-fixed/` exist untracked; **not** in `.gitignore` |
| `.gitignore` — credentials patterns | **PASS** | `*.pem`, `*.key`, `*.pfx`, etc. listed |
| `.env.example` | **WARN** | **Missing** — operators lack documented env template |

---

## 5. Railway

### Status: **PARTIAL — CAD backend only (NOT the Electron app)**

### Evidence searched

- `railway.toml` (root) — **found**
- `railway.json`, root `Procfile` — **not found**
- `engineering/cad-server/Dockerfile` — **found**
- README, settings UI placeholder for Railway URL — **found**
- `src/main/network-guard.ts` — allowlist includes `*.up.railway.app`

### Configuration (non-secret)

```toml
# railway.toml summary
builder = DOCKERFILE → engineering/cad-server/Dockerfile
healthcheckPath = /health
healthcheckTimeout = 120
watchPatterns = cad-server, billing/supabase, package.json
```

Health route implemented: `engineering/cad-server/routes/health.ts` → JSON with `supabaseConfigured`, provider flags, **no secret values**.

### Verification matrix

| Control | Result | Notes |
|---------|--------|-------|
| Railway used at all | **PASS** (scoped) | CAD cloud service only |
| Electron app on Railway | **NOT APPLICABLE** | Desktop app; not container-deployed |
| Service linkage / last deploy | **CANNOT VERIFY** | No Railway CLI auth in audit environment |
| Health endpoint defined | **PASS** | `/health` in config + code |
| Env vars on Railway | **CANNOT VERIFY** | Requires Railway dashboard/CLI |
| Deploy target correctness | **WARN** | Local `CAD_API_URL` env name **present**; production linkage **manual check required** |

---

## 6. Supabase

### Status: **APPLICABLE — server-side (billing + CAD persistence)**

### Evidence searched

- `supabase/migrations/` — **7 SQL migrations** (`001`–`007`)
- `billing/supabase/client.ts`, `repository.ts`
- `engineering/cad-server/storage/` (persistence helpers)
- `@supabase/supabase-js` dependency
- Renderer grep for `supabase` / `SUPABASE_` — **0 matches** ✅
- `tests/supabase/rls-policies.test.ts` — static RLS SQL checks
- `tests/billing/supabase-repository.test.ts`

### Tables / features (from migrations + code)

- Billing: `subscriptions`, `billing_events`, users/plan RLS fixes
- CAD: `cad_generations`, private storage, provider profiles
- Auth/storage: service-role admin client in **Node only** (`getSupabaseAdmin()`)

### Verification matrix

| Control | Result | Notes |
|---------|--------|-------|
| Supabase in desktop renderer | **PASS** | No client imports in `src/renderer` or `ai/` |
| Service role key exposure | **PASS** (static) | `SUPABASE_SERVICE_ROLE_KEY` in `secrets-metadata` forbidden from renderer settings |
| Migrations present | **PASS** | 7 files under `supabase/migrations/` |
| RLS policy tests | **PASS** (static) | Migration content asserted in tests |
| Local vs prod schema drift | **CANNOT VERIFY** | No Supabase MCP/dashboard access |
| Local env var names | **WARN** | Local `.env`: `SUPABASE_URL` **present**, `SUPABASE_SERVICE_ROLE_KEY` **present**, `SUPABASE_ANON_KEY` **present** — values **not audited/logged** |
| Production Supabase project health | **CANNOT VERIFY** | Manual dashboard check required |
| Stripe integration env | **WARN** | Local `.env`: `STRIPE_*` keys **empty/missing** — billing webhooks not configured locally |

---

## 7. Quality gates

Commands run locally on 2026-08-22 (Windows, existing `node_modules` — **no `npm ci`** re-run).

| # | Command | Exit | Result | Notes |
|---|---------|------|--------|-------|
| 1 | `npm run typecheck` | 0 | **PASS** | ~15s |
| 2 | `npm run lint` | 0 | **PASS** | ESLint `--max-warnings 0`, ~9s |
| 3 | `npm test` | 1 | **FAIL** | 1672 pass, **3 fail**, 2 skip / 337 files / ~109s |
| 4 | `npm run build` | 0 | **PASS** | webpack production ~259s |
| 5 | `npm run verify-runtime-assets` | 0 | **PASS** | ~1.5s |
| 6 | `npm run smoke:electron` | 0 | **PASS** (warn) | Completes `[electron-smoke] ok`; renderer logs **Unhandled promise rejection** (non-fatal) |
| 7 | `npm run release:preflight` | 1 | **FAIL** | ~504s (run 1): `npm test` + transient `verify-runtime-assets` miss; ~426s (run 2): **build + verify-runtime-assets PASS**, **`npm test` FAIL** (3 tests) — preflight blocker = tests only when build succeeds |
| 8 | `npm audit --audit-level=high` | 1 | **FAIL** | 15 vulns: 1 critical, 8 high, 5 moderate, 1 low (`undici` chain) |
| 9 | `npm run i18n:audit` | 0 | **PASS** (warn) | 6 hardcoded UI strings remain |

### Failing tests (pre-existing / known — not masked)

| Test file | Test name | Likely cause |
|---------|-----------|--------------|
| `tests/ai/live-ai-edits.test.ts` | `peekStreamingScaffoldPath` | Imports `peekStreamingScaffoldPath` from `scaffold-parser` — **export missing** (only `parseStreamingScaffold` exists) |
| `tests/ai/arena-transformer-mix.test.ts` | complexity routing / fast pipeline | Arena WIP routing regression (matches stashed WIP) |
| `tests/ai/complex-prompt-overrides.test.ts` | long kids-game spec fast pipeline | Same arena/routing area |

**Regression note:** Failures are **not** introduced by AI Work Canvas commit alone; they align with known arena WIP stash and scaffold-parser drift.

---

## 8. Functional matrix

Legend: **T** = automated test exists · **M** = manual only · **S** = static/code review

| Feature | Source / route | Expected behavior | Evidence | Result | Severity | Remediation |
|---------|----------------|-------------------|----------|--------|----------|-------------|
| Open folder / project | `WelcomeWorkspacePanel`, IPC workspace | Bind workspace, load tree | T: `welcome-workspace-panel`, `desktop-project` | **PASS** | — | — |
| Auto-create project (no folder) | AI scaffold / fallback | Create runnable web scaffold | T: `fallback-scaffold`, `fashion-matching` | **PASS** | — | — |
| Coding Arena chat | `AIPanel`, `ai-store` | Stream, modes, cancel | T: `ai-store`, e2e `m5-ai-unified-smoke` | **WARN** | high | 3 arena tests failing; stash WIP |
| Agentic / Code / Debug modes | `agent-modes`, mode router | Route to correct pipeline | T: `agent-modes`, `mode-router` | **PASS** | — | — |
| Cancel / stop stream | `stopStreaming` | Abort stream, keep last tab | T: `chat-stop-intent`, `abort-wiring`; Work Canvas keeps preview on stop | **WARN** | medium | Manual verify stop UX |
| Live file cards | `LiveAiFileCards` | waiting/writing/done/error, click open | T: `live-ai-file-cards`, `live-ai-edits` | **PASS** | — | — |
| AI Work Canvas | `AiWorkCanvas`, `MonacoEditor` | Progress when no file; then live editor | T: `ai-work-canvas.test.tsx` (11 tests) | **PASS** | — | Manual UI verify recommended |
| Follow AI | `use-ai-work-canvas`, `TabBar` | Auto-follow; off on manual tab | T: `work-canvas-store`, controller tests | **PASS** | — | — |
| Editor tabs / save | `editor-store`, `MonacoEditor` | Open, edit, Ctrl+S | T: `m6-editor-ai-unified-smoke` | **PASS** | — | — |
| Editor load timeout + Retry | `MonacoEditor` | Error after 12s, retry button | S: implemented; **no dedicated test** | **WARN** | medium | Add renderer test |
| Explain code | `explain-controller` | Selection → chat explain | T: `explain-read-only`; uncommitted fixes exist | **WARN** | high | Merge/fix explain WIP; manual retest |
| Terminal | `TerminalPanel`, IPC | Open, run, output | T: `TerminalPanel.test`, `terminal-ipc` | **PASS** | — | — |
| Preview launch / port | `preview-handlers`, `PreviewContentPanel` | Dynamic port, health, errors | T: `preview-launcher`, `preview-dev-url`, e2e smoke | **PASS** | — | — |
| Git panel | `GitPanel` | Status, diff, commit UI | T: `GitPanel.test`, `git-service` | **PASS** | — | — |
| AI providers / Ollama | Settings, `local-ai-setup` | Install, test connection | T: `local-ai-*`, `ai-providers-panel` | **PASS** | — | — |
| Chat persistence / export | SQLite + export handlers | Restore threads, JSON/MD export | T: `ai-persistence`, `m7a-*-smoke` | **PASS** | — | — |
| i18n EN/RO | `ai/i18n/locales` | Parity keys | T: `i18n-contract`, `i18n-foundation` | **WARN** | low | 6 hardcoded strings (`i18n:audit`) |
| Settings / accounts / credits | `SettingsPanel`, header globe | Provider keys, account entry | T: `i18n-settings-polish`; billing partial | **WARN** | medium | Stripe env empty locally |
| Activity bar icons | `ActivityBar`, `CavaloIcons` | 3D icons wired | T: `activity-bar-*` | **PASS** | — | — |
| Sidebar: Explorer/Search/Git/Marketplace | Activity bar + panels | Navigate, toggle | T: `activity-bar-layout`, `explorer-no-preview` | **PASS** | — | — |
| Engineering / Robotics AI | `EngineeringAIPanel` | CAD handoff, streaming | T: `engineering-*`, `p1-streaming-ui` | **PASS** | — | — |
| Connection status dot | `ConnectionStatusIndicator` | Online indicator in status bar | S: component exists; **limited test** | **WARN** | low | Manual + unit test |
| Windows installer / signing | `electron-builder.yml` | NSIS build; signing optional | T: `release-preflight` pre phase; signing **warn** if env missing | **WARN** | high | Configure `CAVAL_WIN_CERT_*` for signed release |

---

## 9. Broken / dead UI controls

| Control / area | File | Finding | Confidence | Result |
|----------------|------|---------|------------|--------|
| `peekStreamingScaffoldPath` test | `tests/ai/live-ai-edits.test.ts` | References non-exported function | **high** | **FAIL** (test broken, not necessarily UI) |
| Explain Code quick action | `explain-controller`, toolbar | Uncommitted fixes; user reported failures | **medium** | **WARN** |
| Mixed EN/RO placeholders | `QuickOpen.tsx` L130 | `'Go to file'` vs `'Deschide un folder'` | **high** | **WARN** |
| Engineering prompt placeholder | `EngineeringAIPanel.tsx` L710 | Hardcoded RO string | **high** | **WARN** |
| Terminal font size aria labels | `TerminalPanel.tsx` L523–537 | Hardcoded EN (not i18n) | **high** | **WARN** |
| Empty `onClick` / permanent `disabled` | repo-wide grep | **None found** in renderer | **medium** | **PASS** |
| Activity bar Preview (legacy WEB SIDEBAR.png) | assets | Old asset still on disk; code uses `IconPreview` | **high** | **WARN** (orphan asset, not broken UI) |

No high-confidence **broken buttons with zero handler** were found in static scan of renderer components.

---

## 10. Duplications and potentially orphan artifacts

| Item | Type | Confidence | Notes |
|------|------|------------|-------|
| `assets/icons/3d/png_256/WEB SIDEBAR.png` (+ `.jpg`) | Orphan asset | **high** | Replaced by `icon_preview_rail.png` in committed code |
| `release/`, `release-fixed/` directories | Untracked build output | **high** | Should be gitignored; risk of accidental commit |
| `parseStreamingScaffold` vs `peekStreamingScaffoldPath` | API/test drift | **high** | Test expects symbol that was never exported or was removed |
| Duplicate `live-ai-edits-store.ts` paths in grep | Path casing (Windows) | **low** | Same file, not duplicate logic |
| `xterm` + `@xterm/xterm` dependencies | Package duplication | **medium** | Both in `package.json`; verify which is active |
| Arena routing tests vs stashed WIP | Logic duplication / conflict | **high** | Stash `arena WIP` overlaps failing tests |

**Not flagged as orphan (loaded dynamically):** Electron main/preload workers, webpack entries, `.cicd/scripts/*`, vitest fixtures, CAD Docker contexts.

---

## 11. Security / configuration findings

| Finding | Result | Severity |
|---------|--------|----------|
| Renderer isolation (`contextIsolation`, no `nodeIntegration`) | **PASS** | — |
| CSP + navigation guard | **PASS** | `renderer-security.ts` |
| Secret metadata never exposes values to renderer | **PASS** | `secrets-metadata.ts`, T: `secrets-renderer-isolation` |
| SUPABASE service role server-only | **PASS** (static) | No renderer imports |
| Local `.env` gitignored | **PASS** | Verified |
| No `.env.example` for operators | **WARN** | medium |
| npm audit critical/high | **FAIL** | high |
| Branch not protected on `main` | **WARN** | medium |
| Electron smoke unhandled promise rejections | **WARN** | medium |
| Windows code signing not configured locally | **WARN** | high for signed release |
| MCP remote disabled by policy | **PASS** | Documented in security status |
| Network guard SSRF allowlists | **PASS** | T: `lot-c1-ssrf-network-guard` |

**Local secrets inventory (names only, no values):**

| Variable group | Local status |
|----------------|--------------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | **present** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | **empty/missing** |
| `BILLING_API_KEY`, `BILLING_ADMIN_KEY` | **empty/missing** |
| `OPENROUTER_API_KEY` | **present** |
| `CAD_API_URL` | **present** |
| `CAVAL_CLOUD_API_KEY` | **not checked** (may be absent) |

---

## 12. Remediation backlog

### P0 — Blocks release

| ID | Item | Action |
|----|------|--------|
| P0-1 | `npm test` 3 failures | Fix or revert arena WIP; export or remove `peekStreamingScaffoldPath` test |
| P0-2 | Branch not release-ready | Merge/rebase to `main` via PR; get CI green on target branch |
| P0-3 | Dirty worktree (~151 files) | Commit intentionally or stash/reset before release cut |
| P0-4 | npm audit 1 critical + 8 high | Triage `undici`/transitive deps; `npm audit fix` where safe |
| P0-5 | CI not run on release branch | Open PR to trigger workflow; do not tag until green |

### P1 — Before public release

| ID | Item | Action |
|----|------|--------|
| P1-1 | Branch protection | Enable required checks on `main` (GitHub settings) |
| P1-2 | `.env.example` | Add template with variable names only |
| P1-3 | `release/` gitignore | Add `release/`, `release-fixed/`, `.cicd-artifacts/` if not already |
| P1-4 | Explain Code flow | Land uncommitted explain fixes; manual QA |
| P1-5 | Windows signing | Set `CAVAL_WIN_CERT_SHA1` or `CAVAL_WIN_CERT_FILE` for signed builds |
| P1-6 | Stash `arena WIP` | Pop, fix 3 tests, or discard before merge |
| P1-7 | Electron smoke rejections | Investigate renderer `[object Event]` unhandled rejections |
| P1-8 | Dependabot | Add `.github/dependabot.yml` for npm |

### P2 — Post-release / planned

| ID | Item | Action |
|----|------|--------|
| P2-1 | i18n hardcoded strings (6) | Run through `t()` |
| P2-2 | Orphan sidebar PNG/JPG assets | Archive or delete after confirmation |
| P2-3 | Editor load timeout test | Add unit test for retry UI |
| P2-4 | Connection status indicator test | Add small renderer test |
| P2-5 | GitHub Releases workflow | Automate release notes + artifacts |
| P2-6 | Stripe/billing prod env | Configure production webhooks when billing launches |

---

## 13. Manual verification checklist (you)

Because CLI/API access was unavailable in this audit:

### GitHub
- [ ] Open PR: `docs/ci-expo-tsconfig-base-001` → `main`; confirm **Test** workflow green
- [ ] Enable branch protection + required status checks on `main`
- [ ] Confirm no secrets in PR diff (especially `.env`, keys, `release/` dumps)
- [ ] Create draft release / tag only after CI green

### Railway (CAD cloud)
- [ ] Log into Railway dashboard → service linked to this repo
- [ ] Confirm latest deployment **Success** and `/health` returns 200
- [ ] Verify env vars **present** (names): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `CAD_*`, JWT/encryption keys — **do not paste values into chat**
- [ ] Confirm health JSON: `supabaseConfigured: true`, `openscadInstalled: true` (if required)

### Supabase
- [ ] Dashboard → confirm migrations applied (compare to `supabase/migrations/`)
- [ ] RLS enabled on billing/CAD tables
- [ ] Rotate service role if ever exposed locally
- [ ] Confirm anon key is **not** bundled in Electron renderer (static audit already PASS)

### Desktop smoke (manual)
- [ ] Open folder → generate project in Coding Arena → Follow AI + Work Canvas
- [ ] Preview web app after scaffold
- [ ] Explain selection with code selected
- [ ] `npm run dist:win` on clean tree → install NSIS → launch

---

## Appendix A — Commands executed

```
git remote -v
git branch -vv
git log -1 --oneline
git status --short | Measure-Object
git stash list
git rev-list --count origin/main..HEAD
gh run list --limit 5
gh api repos/.../branches/main/protection
npm run typecheck
npm run lint
npm test
npm run build
npm run verify-runtime-assets
npm run smoke:electron
npm audit --audit-level=high
npm run i18n:audit
git check-ignore -v .env release/ node_modules/ dist/
```

---

*End of report.*
