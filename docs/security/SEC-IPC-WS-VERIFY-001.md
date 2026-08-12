# Remediation backlog — Project Health / IPC security

## OPEN: `caval:workspace-verify` accepts renderer-supplied `workspaceRoot`

| Field | Value |
|-------|--------|
| **ID** | SEC-IPC-WS-VERIFY-001 |
| **Severitate** | **Mare** |
| **Status** | **Remediat (Lot B Faza 2)** — `assertTrustedSender` + bound root only; renderer `workspaceRoot` ignored |
| **Canal** | `caval:workspace-verify` (`src/main/model-handlers.ts`) |
| **Risc** | Renderer poate trimite un path arbitrar ca `workspaceRoot`; handler-ul nu apelează `assertTrustedSender` și nu folosește exclusiv `getBoundWorkspaceRoot`. Un sender compromis poate rula verificări / auto-fix pe un director ales de atacator (în limita allowlist-ului de comenzi din `workspace-verify`). |
| **Remediere propusă** | Same pattern ca Project Health: `assertTrustedSender(event)`; acțiune/opțiuni whitelist; `workspaceRoot` doar din `getBoundWorkspaceRoot(event.sender.id)`; fără `cwd`/`command` din renderer. |
| **Motiv amânare** | În afara scope-ului Feature Project Health Check; schimbarea afectează fluxul post-compose / agentic verify și necesită regresii separate pe `runWorkspaceVerify`. |
| **Owner** | Main IPC / security follow-up |
| **Related** | **SEC-IPC-WS-BINDING-001** (Critic) — binding-ul root-ului fără `assertTrustedSender` pe `caval:workspace-open` / `caval:workspace-sync` |
