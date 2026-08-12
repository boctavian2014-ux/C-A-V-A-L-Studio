# SEC-IPC-LOT-C-EXTENSIONS-001 — Extension install registry / URL / integrity

| Field | Value |
|-------|--------|
| **ID** | SEC-IPC-LOT-C-EXTENSIONS-001 |
| **Severitate** | **High** |
| **Status** | **Mitigat — security gate implementat; funcționalitatea de instalare remote rămâne blocată până când registry-ul publică metadata verificabilă: artifact URL allowlisted, SHA-256 real și VSIX disponibil.** Code execution still disabled (see SEC-EXT-RUNTIME-PERMISSIONS-001). |
| **Related** | Lot A: path sandbox + zip-slip under `.cavalo/extensions`. Lot C1: `network-guard` / `safeFetch`. Follow-up: `SEC-EXT-RUNTIME-PERMISSIONS-001` (High) before activation. |
| **Componente afectate** | `src/main/extension-handlers.ts`, `src/main/open-vsx-client.ts`, `src/main/extension-install-secure.ts`, `src/main/extension-registry.ts`, `src/main/network-guard.ts` (mode `marketplace`), preload / `global.d.ts` |

## Status clarificare

- **Vector critic închis:** URL arbitrar, host arbitrar, instalare fără verificare de hash.
- **Blocaj funcțional (produs, nu vulnerabilitate nouă):** registry-ul trebuie să publice metadata reală (URL allowlisted, SHA-256 real, VSIX disponibil) pentru ca instalările remote să poată reuși; până atunci sunt corect respinse.

## Remediere aplicată (Lot C2)

1. **`extensions:install`** — renderer may send only `extensionId` (`publisher.extension`). `baseUrl` / `downloadUrl` / any URL fields are rejected. Main resolves marketplace base + metadata exclusively from allowlisted registry (`getMarketplaceBaseUrl` + host allowlist). All fetches use `safeFetch` (mode `marketplace`).
2. **`openvsx:install`** — only `namespace` + `name`. Metadata/download/sha256 URLs revalidated against OpenVSX allowlist (`open-vsx.org`, `openvsx.eclipsecontent.org`, …). Redirects revalidated by network-guard. External hosts → reject.
3. **SHA-256** — OpenVSX: `files.sha256` from trusted API, fetched via safeFetch, compared in main before extract. Marketplace: requires valid 64-hex `sha256` in registry metadata; otherwise error `Registry-ul nu oferă metadata de integritate verificabilă pentru această extensie`. Renderer hash never accepted.
4. **Secure install** — temp/staging under `.cavalo/extensions`, size limits, hash before unzip, zip-slip + entry/uncompressed limits, manifest gate (entrypoint, lifecycle scripts, native binaries), atomic move, rollback of previous version, temp cleanup on failure.
5. **Status** — installed extensions marked `status: "installed"`, `enabled: false`. No enable/activate IPC that runs code. Ticket: `docs/security/SEC-EXT-RUNTIME-PERMISSIONS-001.md`.

## Criteriu de închidere

| Criteriu | Stare |
|----------|--------|
| Unlisted / renderer URL rejected | **Da** |
| Redirect to non-allowlisted / private IP rejected | **Da** |
| Tampered / wrong hash rejected + temps cleaned | **Da** |
| Install path sandboxed (Lot A regression) | **Da** |
| Extensions not executable by default | **Da** (disabled; runtime ticket open) |

## Teste

`tests/security/lot-c2-extensions-install.test.ts` (fixtures/mocks — no real network).

## Risc rămas / follow-up

- Extension **activation / enable** blocked until **SEC-EXT-RUNTIME-PERMISSIONS-001**.
- Local VSIX import via dialog not in Lot C2 controlled scope (still absent).
- CAVALLO marketplace seed (`sha256: "seed"`) correctly fails integrity until real package hashes/artifacts are published.
- OpenVSX search/popular also use `safeFetch` (hardening beyond install-only).

## Prioritate

Security gate pentru download/install: **mitigat**. Instalarea remote rămâne blocată funcțional până la metadata/VSIX reale pe registry. Următorul blocker runtime: **SEC-EXT-RUNTIME-PERMISSIONS-001**.
