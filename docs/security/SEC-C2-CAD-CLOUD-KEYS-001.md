# SEC-C2-CAD-CLOUD-KEYS-001 — Keys in main→CAD cloud HTTP body

| Field | Value |
|-------|--------|
| **ID** | SEC-C2-CAD-CLOUD-KEYS-001 |
| **Severitate** | **Medie** |
| **Status** | **Mitigat / Deschis** — client redacts logs/errors; **keys still sent in HTTPS body** to CAD cloud when required by current server contract |
| **Owner** | CAD / platform |
| **Sprint** | Next server-side CAD auth sprint |
| **Related** | Lot C2 renderer isolation (done); Lot C5.6 analysis |

## Context

After C2, the renderer no longer receives/sends API keys. `cad-handlers.ts` still attaches `OPENROUTER_API_KEY` / `MESHY_API_KEY` / `PIAPI` into the outbound JSON body toward the CAD cloud (`attachMainCadSecrets`) because the **current CAD cloud contract expects those fields**.

## Lot C5.6 decision

**Do not remove BYOK/API keys from the body yet** — that would break CAD cloud jobs without a server-side vault/profile.

### Contract for true remediation (server-side)

1. CAD cloud loads provider keys from its own env/vault/profile keyed by `cavalId` / tenant.
2. Main sends job payload **without** `openRouterApiKey` / `meshApiKey` / `piapiApiKey`.
3. Automated test asserts outbound CAD JSON has no secret fields.
4. Then mark this ticket **Remediat**.

Until then: status stays **Mitigat/Deschis** — not “Remediat”.

## Client mitigations already in place

- Renderer cannot supply keys (C2).
- CAD outbound uses `safeFetch` + origin-gated auth headers (C1).
- Errors/logs use `redactSensitiveText` (no body-with-keys logging found).

## Closing criteria

| Criteriu | Stare |
|----------|--------|
| CAD cloud reads keys server-side | Pending |
| Main body contains no BYOK/API key fields | Pending |
| Test proves payload without keys + CAD still works | Pending |
