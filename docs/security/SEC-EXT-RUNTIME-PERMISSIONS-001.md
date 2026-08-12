# SEC-EXT-RUNTIME-PERMISSIONS-001 — Extension runtime permission model

| Field | Value |
|-------|--------|
| **ID** | SEC-EXT-RUNTIME-PERMISSIONS-001 |
| **Severitate** | **High** (before activating any extension code) |
| **Status** | **Deschis** |
| **Related** | SEC-IPC-LOT-C-EXTENSIONS-001 (install integrity foundation — Lot C2) |
| **Componente afectate** | `src/extensions/extension-host.ts`, future extension runtime / sandbox, IPC enable/activate channels |
| **Context** | Lot C2 installs extensions as **installed + disabled** only. Artifacts are verified (allowlist + SHA-256 + zip/manifest gates) but **must not execute** until this ticket is closed. |

## Risc

Activating extension JavaScript/native code without a permission model would grant untrusted packages access to filesystem, network, terminal, secrets, or IPC — turning a supply-chain install into arbitrary code execution inside the IDE.

## Remediere propusă (obligatoriu înainte de enable)

1. **Sandbox** — run extension code out-of-process or in a restricted worker; no Node `fs`/`child_process`/`net` by default; no `nodeIntegration` / raw `ipcRenderer` / `process.env` secrets.
2. **Permission grants per extension + version** — explicit grants for filesystem, network, terminal, MCP, secrets; stored with publisher, version, and verified SHA-256; UI confirmation showing source/hash/permissions/trust level.
3. **Audit log** — record install, enable, grant, revoke, and privileged API use.
4. **Revocation** — disable instantly; revoke grants; block re-enable until user re-confirms.
5. **No automatic enable** — install remains disabled; enable is a separate trusted IPC with confirmation, never default-on.

## Criteriu de închidere

- No extension code runs unless explicitly enabled with recorded grants for that version hash.
- Enable API cannot bypass sandbox or escalate to secrets/terminal/fs without a grant.
- Tests cover deny-by-default, grant scoping, revoke, and audit events.

## Prioritate

**High — blocker** for any extension activation / `enable` IPC / loader that executes package entrypoints.

## Owner

Main IPC / extensions runtime
