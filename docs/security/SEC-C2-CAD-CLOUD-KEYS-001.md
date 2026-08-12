# SEC-C2-CAD-CLOUD-KEYS-001 — Keys in main→CAD cloud HTTP body

| Field | Value |
|-------|--------|
| **ID** | SEC-C2-CAD-CLOUD-KEYS-001 |
| **Severitate** | **Medie** |
| **Status** | **Deschis / Mitigat** — PR1 ([#3](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/3)) este **BACKEND FINALIZAT**, nu Remediat. Desktop încă trimite chei (`attachMainCadSecrets`). |
| **Owner** | CAD / platform |
| **Sprint** | PR1 merged on `main`; PR2 desktop după observație telemetry, nu imediat |
| **Related** | Lot C2 renderer isolation (done); Lot C5.6 analysis; [CI-EXPO-TSCONFIG-BASE-001](../ci/CI-EXPO-TSCONFIG-BASE-001.md) (CI cloud separat) |

## Context

After C2, the renderer no longer receives/sends API keys. `cad-handlers.ts` still attaches `OPENROUTER_API_KEY` / `MESHY_API_KEY` / `PIAPI` into the outbound JSON body toward the CAD cloud (`attachMainCadSecrets`) because the **current CAD cloud contract expects those fields**.

## PR1 (backend) — BACKEND FINALIZAT

Merged: [PR #3](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/3). Local gates (2026-08-12): typecheck, lint, **1025 passed / 2 skipped / 226 files**, build, `git diff --check`. Cloud GitHub Actions `test` remains red on a **pre-existing** `expo/tsconfig.base` miss — see [CI-EXPO-TSCONFIG-BASE-001](../ci/CI-EXPO-TSCONFIG-BASE-001.md); local green does not replace that gate.

Until a desktop client emits `providerProfileId`, CAD logs will show `request_class=legacy` only. That is expected, not a backend defect.

- JWT Bearer (`sub`) is the only accountId for provider profiles.
- `x-caval-user-id` never beats JWT and cannot access profiles.
- `provider_profiles` stores AES-256-GCM ciphertext only.
- `POST /cad/jobs` and `POST /cad/plan` accept `providerProfileId`.
- `CAD_LEGACY_CLIENT_SECRET_PAYLOAD` defaults on; legacy body keys still work.
- `CAD_ALLOW_ANONYMOUS=1` fails boot in production (except `CAD_USE_LOCAL=1`).

See [SEC-C2-CAD-CLOUD-KEYS-PR1.md](./SEC-C2-CAD-CLOUD-KEYS-PR1.md).

## Lot C5.6 decision

**Do not remove BYOK/API keys from the desktop body yet** — PR2 after telemetry observation (`request_class=profile` vs `legacy`). Absence of profile traffic before PR2 is expected.

### Contract for true remediation (PR2 + E2E)

1. Desktop sends JWT + `providerProfileId` only.
2. Main payload has no `openRouterApiKey` / `meshApiKey` / `piapiApiKey`.
3. E2E asserts outbound CAD JSON has no secret fields.
4. Then mark this ticket **Remediat**.

## Closing criteria

| Criteriu | Stare |
|----------|--------|
| CAD cloud reads keys from per-account vault | **PR1 BACKEND FINALIZAT** (profile path) |
| Main body contains no BYOK/API key fields | Pending PR2 desktop |
| E2E: outbound CAD JSON has no API-key patterns | Pending after PR2 |
| `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=false` without regression | Pending after profile adoption |
| Mark this ticket **Remediat** | Only after the three rows above |
