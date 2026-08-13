# SEC-C2 observation window — profile vs legacy telemetry

**Status:** **Deschis** (observație). Ticket [SEC-C2-CAD-CLOUD-KEYS-001](./SEC-C2-CAD-CLOUD-KEYS-001.md) rămâne **Deschis / Mitigat**. PR2 desktop **nu** pornește în această fereastră.

| Câmp | Valoare |
|------|---------|
| Start | 2026-08-13 |
| Mediu | CAD cloud (Railway logs, `service: cad`) |
| Owner | CAD / platform |
| PR2 | Blocat până JWT, `/cad/profiles` și logurile backend sunt live în mediul țintă |

## Notă de start (2026-08-13)

PR1 backend este **BACKEND FINALIZAT** pe `main` (PR #3). Desktop-ul curent încă apelează `attachMainCadSecrets` și trimite `openRouterApiKey` / `meshApiKey` / `piapiApiKey`.

**Așteptare în fereastră:** `requestClass=legacy` dominant; `requestClass=profile` ≈ **zero**. Absența traficului profile **nu** este defect de backend.

## Criterii verificabile (zilnic)

Interogare loguri CAD (stdout JSON, câmp camelCase `requestClass`):

```text
"requestClass":"legacy"
"requestClass":"profile"
```

| Check | Cum | Pass |
|-------|-----|------|
| Mix profile vs legacy | Count pe `cad_request` / `provider_profile_used` | Documentează counts. Profile=0 este **expected** până la PR2. |
| Fără secrete în body/erori | Grep loguri: `sk-or-v1-`, `openRouterApiKey`, `meshApiKey`, `piapiApiKey`, `ghp_`, `Bearer eyJ` | Zero match-uri pe payload; `cadLog` redactează înainte de emit. |
| Legacy completează joburi | După `cad_request` + `requestClass:legacy`, există `job_completed` (sau eroare de domeniu, nu 500 generic de vault) | Joburile legacy continuă să finalizeze. |

Nu interpreta spike-uri de 401 pe `/cad/profiles` de la clienți fără JWT ca regresii PR1.

## Condiții înainte de PR2

Nu deschide PR2 desktop până sunt adevărate **toate**:

1. Identitate JWT verificabilă în mediul țintă (`CAD_JWT_SECRET` exclusiv, sau fallback `SUPABASE_JWT_SECRET` dacă CAD este unset).
2. Endpoint-uri profile live: `GET/POST /cad/profiles`, rotate, revoke.
3. Logurile backend (`cadLog` pe Railway) interogabile pentru `requestClass`.

## La finalul ferestrei

Documentează observația: **zero profile expected, deoarece desktop-ul curent nu trimite încă `providerProfileId`**. Apoi deschide PR2 ca migrare desktop **separată** (Bearer JWT + `providerProfileId`, `attachMainCadSecrets` doar dacă `/health` semnalează legacy și userul nu are profil).
