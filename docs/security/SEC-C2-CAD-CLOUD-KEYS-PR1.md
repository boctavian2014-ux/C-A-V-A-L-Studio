# SEC-C2 PR1 — CAD identity, provider profiles, legacy flag

**Status:** backend implemented, **not** ticket-complete. Desktop `attachMainCadSecrets` is unchanged.

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
- Legacy path (flag on): existing `openRouterApiKey` / `meshApiKey` / `piapiApiKey` still accepted. `request_class=legacy` in logs, no payload.

## Database

Migration: `supabase/migrations/007_provider_profiles.sql`

- RLS on; `anon`/`authenticated` revoked from the table; authenticated may SELECT metadata columns only (`auth.uid() = account_id`).
- `service_role` full access for the CAD server.
- Unique active profile per `(account_id, provider)`.
- Index `(account_id, status)`.

## Environment (names only)

| Name | Role |
|------|------|
| `CAD_JWT_SECRET` / `SUPABASE_JWT_SECRET` | Verify Bearer JWT |
| `CAD_PROFILE_ENCRYPTION_KEY` | 32-byte AES-256-GCM master key (64 hex or base64) |
| `CAD_PROFILE_ENCRYPTION_KEY_VERSION` | Integer `keyVersion` (default 1) |
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
