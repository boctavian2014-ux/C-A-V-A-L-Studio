# SEC-C2 observation window — profile vs legacy telemetry

**Status:** **Deschis** (observație). Ticket [SEC-C2-CAD-CLOUD-KEYS-001](./SEC-C2-CAD-CLOUD-KEYS-001.md) rămâne **Deschis / Mitigat**. Nu este Remediat.

| Câmp | Valoare |
|------|---------|
| **Start observație** | **2026-08-13** (PR [#6](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/6) pe `main`) |
| Mediu | CAD cloud (Railway logs, `service: cad`) |
| Ce verifică | Siguranța și disponibilitatea infrastructurii backend, **nu** adopția profilelor |
| PR2 | Blocat până la cele șase confirmări din mediul țintă. Branch: `security/sec-c2-cad-cloud-keys-001-pr2` |

## Notă de start (2026-08-13)

PR1 backend este **BACKEND FINALIZAT** (PR #3). Desktop-ul continuă să folosească `attachMainCadSecrets`.

**`requestClass=profile` = 0 este comportament așteptat până la PR2.** Absența traficului profile nu este defect de backend și nu măsoară adopție.

Observația confirmă că infrastructura (JWT, vault, flag legacy, redactare, joburi legacy) este sigură și disponibilă.

## Criterii zilnice

Interogare loguri CAD (`requestClass` camelCase):

```text
"requestClass":"legacy"
"requestClass":"profile"
```

| Check | Pass |
|-------|------|
| Counts profile vs legacy | Profile=0 expected. Documentează counts. |
| Pattern-uri de secret | **Zero.** Orice match (`sk-or-v1-`, `openRouterApiKey`, `meshApiKey`, `piapiApiKey`, `ghp_`, `Bearer eyJ`) este **incident de securitate și blochează PR2**. |
| Legacy jobs | `cad_request` + `requestClass:legacy` → `job_completed` **sau** eroare de domeniu. Nu vault/decrypt 500. |

## Condiție de ieșire — șase confirmări în mediul țintă

Înainte de a deschide `security/sec-c2-cad-cloud-keys-001-pr2`, toate trebuie să fie adevărate:

1. JWT-ul este configurat și acceptat de CAD backend (`CAD_JWT_SECRET` exclusiv când e setat).
2. `/cad/profiles` răspunde autentificat și nu expune material criptat sau secrete.
3. `CAD_PROFILE_ENCRYPTION_KEY` și cheia activă versionată sunt configurate server-side.
4. `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=true` rămâne activ în această etapă.
5. CAD logs redactează toate pattern-urile urmărite.
6. Un flux legacy real produce `cad_request` → `job_completed` sau o eroare de domeniu, nu un vault/decrypt 500.

Doar după aceste șase confirmări, deschide branch-ul desktop. Ticketul C2 rămâne **Deschis / Mitigat** până când PR2 demonstrează E2E că payload-ul CAD nu conține chei **și** până când flag-ul legacy poate fi dezactivat fără regresie.
