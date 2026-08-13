# SEC-C2 observation window — profile vs legacy telemetry

**Status:** **Deschis** (observație). Ticket [SEC-C2-CAD-CLOUD-KEYS-001](./SEC-C2-CAD-CLOUD-KEYS-001.md) rămâne **Deschis / Mitigat**. Nu este Remediat.

| Câmp | Valoare |
|------|---------|
| **Start observație** | **2026-08-13** (PR [#6](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/6) pe `main`; criterii de ieșire PR [#7](https://github.com/boctavian2014-ux/C-A-V-A-L-Studio/pull/7)) |
| **Cadență** | **Zilnică** (manuală sau scriptată). Nu este opțională și nu este „când îmi amintesc”. |
| **Durată minimă** | Cel puțin **7 zile** de trafic real legacy **fără incident** |
| **Cea mai devreme dată suficientă** | **2026-08-20** (doar dacă cele 7 zile sunt complete și fără incident) |
| Mediu | CAD cloud (Railway logs, `service: cad`) — **mediul țintă real**, nu local/staging simulat |
| Ce verifică | Siguranța și disponibilitatea infrastructurii backend, **nu** adopția profilelor |
| PR2 | Blocat până la **(A)** fereastra de 7 zile fără incident **și** **(B)** cele șase confirmări binare din mediul țintă. Branch: `security/sec-c2-cad-cloud-keys-001-pr2` |

## Notă de start (2026-08-13)

PR1 backend este **BACKEND FINALIZAT** (PR #3). Desktop-ul continuă să folosească `attachMainCadSecrets`.

**`requestClass=profile` = 0 este comportament așteptat până la PR2.** Absența traficului profile nu este defect de backend și nu măsoară adopție.

Observația confirmă că infrastructura (JWT, vault, flag legacy, redactare, joburi legacy) este sigură și disponibilă.

## Script zilnic

`scripts/check-c2-railway-observation.mjs` citește **deploy stdout** Railway (`railway logs --json`, serviciul CAD). Persistă **doar** raportul agregat în `artifacts/c2-observation/YYYY-MM-DD.json` (gitignored). **Nu** scrie raw Railway logs pe disk sau în Git — păstrează accesul la Railway Logs pentru RCA. Retenția Railway e limitată după plan; notează în jurnal `service`, `environment` și `deploymentIds` din raport.

```bash
npm install -g @railway/cli
railway login
set RAILWAY_CAD_SERVICE=cad
set RAILWAY_ENVIRONMENT=production
set C2_SINCE=24h
set C2_LOG_LINES=5000
node scripts/check-c2-railway-observation.mjs
```

PowerShell:

```powershell
$env:RAILWAY_CAD_SERVICE = "cad"
$env:RAILWAY_ENVIRONMENT = "production"
$env:C2_SINCE = "24h"
$env:C2_LOG_LINES = "5000"
node scripts/check-c2-railway-observation.mjs
```

| Rezultat | Acțiune |
|----------|---------|
| `status: "OK"`, `profile: 0`, `legacy > 0` | Comportament așteptat înainte de PR2; notează rezultatul în jurnal |
| `status: "OK"`, `legacy: 0` | Nu demonstrează sănătatea fluxului legacy; marchează „fără trafic” și **nu** considera ziua drept dovadă de trafic real |
| `profile > 0` înainte de PR2 | Investighează imediat; desktop-ul curent nu ar trebui să trimită `providerProfileId` |
| `secretPatternHits > 0` (`status: "INCIDENT"`, exit 2) | Incident: oprește fereastra, **resetează cele 7 zile la zero**, păstrează doar metadata redactată, RCA **imediat** (nu la finalul zilei). Nu începe PR2. |
| `cad_request > 0`, dar nici `job_completed`, nici eroare de domeniu | Investighează joburile rămase în curs înainte de a marca ziua OK |

## Cadență de monitorizare

Verificare **zilnică** (poate fi manuală sau scriptată) a:

1. `requestClass=legacy` vs `requestClass=profile`
2. absența pattern-urilor de secret în CAD logs
3. `cad_request` → `job_completed` pe fluxul legacy (sau eroare de domeniu, nu vault/decrypt 500)

Durată minimă înainte de a considera fereastra suficientă: cel puțin **7 zile de trafic real legacy fără incident**.

**Incident:** orice apariție de pattern de secret în logs → **stop**, tratează ca incident de securitate, **nu continua spre PR2** până la remediere și RCA. Reluarea ferestrei începe după RCA; cele 7 zile se numără din nou fără incident.

Interogare loguri CAD (`requestClass` camelCase):

```text
"requestClass":"legacy"
"requestClass":"profile"
```

Pattern-uri de secret urmărite: `sk-or-v1-`, `openRouterApiKey`, `meshApiKey`, `piapiApiKey`, `ghp_`, `Bearer eyJ`.

| Check | Pass |
|-------|------|
| Counts profile vs legacy | Profile=0 expected. Documentează counts. |
| Pattern-uri de secret | **Zero.** Orice match este **incident de securitate și blochează PR2**. |
| Legacy jobs | `cad_request` + `requestClass:legacy` → `job_completed` **sau** eroare de domeniu. Nu vault/decrypt 500. |

## Jurnal zilnic

Completează fiecare rând în ziua verificării. Gol = verificare neefectuată (fereastra nu avansează).

| Dată | service / env / deployment | legacy | profile | secrete (0 = pass) | `cad_request` → `job_completed` sau eroare domeniu | Incident / note |
|------|----------------------------|--------|---------|--------------------|-----------------------------------------------------|-----------------|
| 2026-08-13 | | | | | | |
| 2026-08-14 | | | | | | |
| 2026-08-15 | | | | | | |
| 2026-08-16 | | | | | | |
| 2026-08-17 | | | | | | |
| 2026-08-18 | | | | | | |
| 2026-08-19 | | | | | | |
| 2026-08-20 | | | | | | Earliest window-sufficient dacă 7 zile fără incident |

## Gate binar înainte de PR2 — șase confirmări în mediul țintă

Acestea sunt **condiții obligatorii (AND)**, nu sugestii. Toate șase trebuie verificate în **mediul țintă real** (nu doar local/staging simulat). Fals pe oricare = PR2 rămâne blocat.

| # | Criteriu | Stare |
|---|---------|-------|
| 1 | JWT configurat și acceptat de CAD backend (`CAD_JWT_SECRET` exclusiv când e setat) | Pending |
| 2 | `/cad/profiles` răspunde autentificat și **nu** expune material criptat sau secrete | Pending |
| 3 | `CAD_PROFILE_ENCRYPTION_KEY` și cheia activă versionată sunt configurate server-side | Pending |
| 4 | `CAD_LEGACY_CLIENT_SECRET_PAYLOAD=true` rămâne activ în această etapă | Pending |
| 5 | CAD logs redactează **toate** pattern-urile de secret urmărite | Pending |
| 6 | Un flux legacy real produce `cad_request` → `job_completed` sau eroare de domeniu, **nu** vault/decrypt 500 | Pending |

Doar după **fereastra de 7 zile fără incident** **și** aceste șase confirmări, deschide `security/sec-c2-cad-cloud-keys-001-pr2`. Ticketul C2 rămâne **Deschis / Mitigat** până când PR2 demonstrează E2E că payload-ul CAD nu conține chei **și** până când flag-ul legacy poate fi dezactivat fără regresie.
