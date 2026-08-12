# SEC-C2-CAD-CLOUD-KEYS-001 — Keys in main→CAD cloud HTTP body

| Field | Value |
|-------|--------|
| **ID** | SEC-C2-CAD-CLOUD-KEYS-001 |
| **Severitate** | **Medie** |
| **Status** | **PR1 backend implementat / Deschis** — identity JWT + provider profiles criptate + flag legacy. Desktop încă trimite chei (`attachMainCadSecrets`). Ticketul nu e Remediat. |
| **Owner** | CAD / platform |
| **Sprint** | PR1 backend (acest lot); PR2 desktop după merge + deploy |
| **Related** | Lot C2 renderer isolation (done); Lot C5.6 analysis |

## Context

After C2, the renderer no longer receives/sends API keys. `cad-handlers.ts` still attaches `OPENROUTER_API_KEY` / `MESHY_API_KEY` / `PIAPI` into the outbound JSON body toward the CAD cloud (`attachMainCadSecrets`) because the **current CAD cloud contract expects those fields**.

## PR1 (backend) — făcut

- JWT Bearer (`sub`) is the only accountId for provider profiles.
- `x-caval-user-id` never beats JWT and cannot access profiles.
- `provider_profiles` stores AES-256-GCM ciphertext only.
- `POST /cad/jobs` and `POST /cad/plan` accept `providerProfileId`.
- `CAD_LEGACY_CLIENT_SECRET_PAYLOAD` defaults on; legacy body keys still work.
- `CAD_ALLOW_ANONYMOUS=1` fails boot in production (except `CAD_USE_LOCAL=1`).

See [SEC-C2-CAD-CLOUD-KEYS-PR1.md](./SEC-C2-CAD-CLOUD-KEYS-PR1.md).

## Lot C5.6 decision

**Do not remove BYOK/API keys from the desktop body yet** — PR2 after this backend is deployed.

### Contract for true remediation (PR2 + E2E)

1. Desktop sends JWT + `providerProfileId` only.
2. Main payload has no `openRouterApiKey` / `meshApiKey` / `piapiApiKey`.
3. E2E asserts outbound CAD JSON has no secret fields.
4. Then mark this ticket **Remediat**.

## Closing criteria

| Criteriu | Stare |
|----------|--------|
| CAD cloud reads keys from per-account vault | **PR1** (profile path) |
| Main body contains no BYOK/API key fields | Pending PR2 |
| Test proves payload without keys + CAD still works | Pending E2E after PR2 |
