# Quality gates (Q1)

PR and release share the same deterministic gates. Smoke Electron is release-required
and optional on pull requests when a headless display is unavailable.

## PR-blocking (`cicd:test`, `.github/workflows/test.yml`)

Runs in this order:

1. `npm run typecheck`
2. `npm run lint` (`--max-warnings 0`)
3. `npm test` (includes `tests/security/**` and P1/P2/P3/C1–C5)
4. `npm run build`
5. `npm run verify-runtime-assets`

These commands are defined once in `.cicd/scripts/quality-gates.ts` (`PR_QUALITY_GATES`).
`npm run cicd:test` and `npm run release:preflight` (default, no `--phase`) use that list.
Do not add a PR workflow that skips lint, test, or build.

## Release-only (`npm run release:preflight`, `release:win`)

In addition to the PR gates:

- File/icon/license/version checks (`.cicd/scripts/release-preflight.ts`)
- `npm run smoke:electron` — boot Electron with a temp workspace, no API keys, no CAD cloud, no live providers
- Windows signing remains a warning when certs are unset (does not publish, does not require API keys)

`--phase=pre` / `--phase=post-build` / `--files-only` run only the file checks (used by `release:win` after quality gates).

## Electron smoke

- Script: `npm run smoke:electron`
- Strips `*_API_KEY` / cloud URLs from the child env
- Allowlisted non-fatal warnings (temporar): React DevTools prompt; deprecated `console-message` arity; **Invalid accelerator token** → [SEC-UI-ACCELERATOR-001](../security/SEC-UI-ACCELERATOR-001.md) (Scăzut — scoate din allowlist după fix)
- Logs: `.cicd-artifacts/electron-smoke-stdout.txt` and `electron-smoke-stderr.txt` (redacted)
- GitHub PR job `smoke-electron` uses xvfb and `continue-on-error` **only** on `pull_request` (limitare temporară de infrastructură). Pe `push` la `main`/`develop` job-ul este blocant. Release preflight rulează smoke fără continue-on-error.

Cele 2 teste `it.skip`: vezi [skipped-tests.md](./skipped-tests.md).

`electron-stderr.txt` at the repo root is a **historic fixture** (2026-07 missing worker), not a live log.
