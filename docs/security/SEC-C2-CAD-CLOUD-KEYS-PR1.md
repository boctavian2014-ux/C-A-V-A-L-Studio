# SEC-C2 PR1 — CAD identity, provider profiles, legacy flag

**Status:** **BACKEND FINALIZAT** (PR [#3](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/3)). Ticket remains **Deschis / Mitigat**. Observation window: [SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md](./SEC-C2-CAD-CLOUD-KEYS-OBSERVATION.md). Desktop `attachMainCadSecrets` is unchanged.

## API contract

### Identity

| Request | Authz |
|---------|--------|
| `Authorization: Bearer <JWT>` valid | `accountId = JWT.sub` only. `x-caval-user-id` is telemetry, never wins. |
| No JWT + `x-caval-user-id` | Legacy CAD jobs/plan/poll/cancel only. **No profiles.** |
| No JWT + anonymous flag (non-production) | Legacy CAD as `anonymous`. **No profiles.** |
| Invalid JWT | 401 always |

### Provider profiles (JWT required)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/cad/profiles` | — | `{ ok, profiles[] }` metadata only |
| POST | `/cad/profiles` | `{ provider, secret, capabilities? }` | `{ ok, profile }` 201 |
| POST | `/cad/profiles/:id/rotate` | `{ secret }` | `{ ok, profile }` |
| POST | `/cad/profiles/:id/revoke` | — | `{ ok, profile }` |

`provider`: `openrouter` \| `meshy` \| `piapi`.  
Public profile fields: `id`, `provider`, `capabilities`, `status`, `createdAt`, `updatedAt`, `revokedAt`. Never ciphertext, IV, tag, keyVersion, length, or prefix.

### CAD

`POST /cad/jobs` and `POST /cad/plan` accept optional `providerProfileId` (UUID).

- Profile path: JWT + ownership + `status=active`, then decrypt in memory, strip client key fields, pass plaintext only to the worker/provider.
- Retry: send the same `providerProfileId` again; do not send key fields.
- Revoke: new jobs/plan on that profile return **403** `Provider profile is revoked`. A job already queued/running keeps the secret already resolved in RAM and is not cancelled.
- Legacy path (flag on): existing `openRouterApiKey` / `meshApiKey` / `piapiApiKey` still accepted. `request_class=legacy` in logs, no payload.

## Telemetry

`cadLog` writes to the CAD process stdout/stderr only (Railway logs). There is no Datadog/Sentry/PostHog hook on this path. `accountId` in those lines is internal operations identity, not an external analytics event. Payload bodies and secrets are not logged.

Daily observation query: `"requestClass":"legacy"` vs `"requestClass":"profile"`. Until PR2, expect **only legacy**. Missing profile traffic is not a backend defect.

## Encryption key rotation

New ciphertext uses `CAD_PROFILE_ENCRYPTION_KEY` + `CAD_PROFILE_ENCRYPTION_KEY_VERSION`. Rows with an older `key_version` decrypt with `CAD_PROFILE_ENCRYPTION_KEY_Vn`. Bumping the version without keeping `KEY_Vn` fails closed. Optional later: re-encrypt via rotate-secret; not required to read old rows.

## JWT source of truth

`CAD_JWT_SECRET` wins exclusively. `SUPABASE_JWT_SECRET` is used only when `CAD_JWT_SECRET` is empty. Verification is a single `jwt.verify` with `algorithms: ["HS256"]` — tokens signed with the unused secret are rejected (no confusion attack).

## Database

Migration: `supabase/migrations/007_provider_profiles.sql`

- RLS on; `anon`/`authenticated` revoked from the table; authenticated may SELECT metadata columns only (`auth.uid() = account_id`).
- `service_role` full access for the CAD server.
- Unique active profile per `(account_id, provider)`.
- Index `(account_id, status)`.

## Environment (names only)

| Name | Role |
|------|------|
| `CAD_JWT_SECRET` | Exclusive JWT verify secret when set. HS256 only. |
| `SUPABASE_JWT_SECRET` | Fallback verify secret **only if** `CAD_JWT_SECRET` is unset. Never tried in parallel. |
| `CAD_PROFILE_ENCRYPTION_KEY` | 32-byte AES-256-GCM master key for the **current** `keyVersion` (64 hex or base64) |
| `CAD_PROFILE_ENCRYPTION_KEY_VERSION` | Integer current `keyVersion` (default 1). New encrypts use this. |
| `CAD_PROFILE_ENCRYPTION_KEY_Vn` | Decrypt-only previous key, e.g. `CAD_PROFILE_ENCRYPTION_KEY_V1` after bumping to version 2. No re-encrypt script required for reads. |
| `CAD_LEGACY_CLIENT_SECRET_PAYLOAD` | Default true. `false`/`0`/`off` rejects legacy key fields |
| `CAD_ALLOW_ANONYMOUS` | Test/dev only. Production boot fails if set (unless `CAD_USE_LOCAL=1`) |
| `CAD_API_KEY` | Optional service gate (unchanged) |

## Legacy sunset (not hardcoded)

1. Flag on (now): telemetry `profile` vs `legacy`.
2. After desktop PR2 ships: wait until **≥95% profile requests for 14 days**, then announce.
3. **30 days after announce:** set `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=false`. Old desktops get the upgrade error.

Anonymous/header clients never get profiles. They may keep shared tenant env keys only.

## Rollback

1. Keep `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=true` (default).
2. Stop creating profiles; desktop still uses body keys.
3. Leave the table in place (ciphertext unused is harmless).
4. Do not drop `007` until PR2 has fully sunset.

## Tests

- `tests/security/lot-c2-cad-cloud-keys-pr1.test.ts`
- `tests/engineering/provider-profiles-crypto.test.ts`
- `tests/engineering/provider-profiles-migration.test.ts`
- Existing `tests/engineering/cad-server.test.ts` (legacy header path)

## PR2 desktop (remaining)

- Send `Authorization: Bearer` + `providerProfileId`.
- Remove `attachMainCadSecrets` from create/plan/retry.
- Enable profile contract only after `/health` shows `profileVaultConfigured` (and deployed JWT).
- E2E: CAD request body has no API-key patterns → then mark the ticket **Remediat**.
