# SEC-C2-CAD-CLOUD-KEYS-001 — Keys in main→CAD cloud HTTP body

| Field | Value |
|-------|--------|
| **ID** | SEC-C2-CAD-CLOUD-KEYS-001 |
| **Severitate** | **Medie** |
| **Status** | **Deschis / Mitigat** — PR1 ([#3](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/3)) **BACKEND FINALIZAT**. Fereastră de observație [SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md](./SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md) pornită 2026-08-13. Desktop încă trimite chei (`attachMainCadSecrets`). Nu Remediat. |
| **Owner** | CAD / platform |
| **Sprint** | Observație zilnică 2026-08-13 → earliest 2026-08-20; PR2 doar după 7 zile fără incident **și** 6 confirmări țintă |
| **Related** | Lot C2 renderer isolation (done); [CI-EXPO-TSCONFIG-BASE-001](../ci/CI-EXPO-TSCONFIG-BASE-001.md) **Remediat** |

## Context

After C2, the renderer no longer receives/sends API keys. `cad-handlers.ts` still attaches `OPENROUTER_API_KEY` / `MESHY_API_KEY` / `PIAPI` into the outbound JSON body toward the CAD cloud (`attachMainCadSecrets`) because the **current CAD cloud contract expects those fields**.

## PR1 (backend) — BACKEND FINALIZAT

Merged: [PR #3](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/3).

## Observation window (start: 2026-08-13)

See [SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md](./SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md).

- Verifică siguranța și disponibilitatea infrastructurii backend, **nu** adopția profilelor. Script zilnic: `scripts/check-c2-railway-observation.mjs` (raport agregat, fără raw logs).
- `profile = 0` este așteptat până la PR2: desktop-ul folosește în continuare `attachMainCadSecrets`.
- Orice pattern de secret în CAD logs este incident de securitate și **blochează PR2**.
- PR2 (`security/sec-c2-cad-cloud-keys-001-pr2`) doar după fereastra de **7 zile** fără incident **și** cele șase confirmări **binare** din mediul țintă real.

- JWT Bearer (`sub`) is the only accountId for provider profiles.
- `x-caval-user-id` never beats JWT and cannot access profiles.
- `provider_profiles` stores AES-256-GCM ciphertext only.
- `POST /cad/jobs` and `POST /cad/plan` accept `providerProfileId`.
- `CAD_LEGACY_CLIENT_SECRET_PAYLOAD` defaults on; legacy body keys still work.
- `CAD_ALLOW_ANONYMOUS=1` fails boot in production (except `CAD_USE_LOCAL=1`).

See [SEC-C2-CAD-CLOUD-KEYS-PR1.md](./SEC-C2-CAD-CLOUD-KEYS-PR1.md).

## Lot C5.6 decision

**Do not remove BYOK/API keys from the desktop body yet** — PR2 after the observation window, as a separate desktop migration.

### Contract for true remediation (PR2 + E2E)

1. Desktop sends JWT + `providerProfileId` only.
2. Main payload has no `openRouterApiKey` / `meshApiKey` / `piapiApiKey`.
3. E2E asserts outbound CAD JSON has no secret fields.
4. Then mark this ticket **Remediat**.

## Closing criteria

| Criteriu | Stare |
|----------|--------|
| CAD cloud reads keys from per-account vault | **PR1 BACKEND FINALIZAT** |
| Observation start 2026-08-13; cadență zilnică; 7 zile fără incident (earliest 2026-08-20) | **In progress** |
| Șase confirmări **binare** în mediul țintă real înainte de PR2 | Pending |
| Main body contains no BYOK/API key fields | Pending PR2 (`security/sec-c2-cad-cloud-keys-001-pr2`) |
| E2E: outbound CAD JSON has no API-key patterns | Pending after PR2 |
| `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=false` without regression | Pending after profile adoption |
| Mark this ticket **Remediat** | Only after PR2 E2E without keys **and** legacy off without regression |
