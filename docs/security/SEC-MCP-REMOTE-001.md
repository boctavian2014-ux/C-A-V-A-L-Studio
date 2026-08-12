# SEC-MCP-REMOTE-001 — MCP remote transports (HTTP / SSE / WebSocket)

| Field | Value |
|-------|--------|
| **ID** | SEC-MCP-REMOTE-001 |
| **Severitate** | **High** (default until implementation risk is reassessed) |
| **Status** | **Open** — feature flag `MCP_REMOTE_ENABLED = false`; no callable remote endpoint |
| **Related** | Lot C3 (stdio trust/env), Lot C1 (`network-guard`), Lot C2 (supply chain) |

## Context

Lot C3 audit found **only** `StdioClientTransport` in CAVALLO. Remote MCP (HTTP/SSE/WebSocket) is **not implemented**.

## Policy until implemented

1. `MCP_REMOTE_ENABLED` remains hardcoded `false`.
2. Any config with `transport !== "stdio"` must fail explicitly (not silent no-op).
3. Do **not** add stub HTTP/SSE/WS connect paths.
4. When implementing later: reuse Lot C1 SSRF defenses, host allowlist, UI confirm, tokens only in main/safe storage, permission grants from Lot C3.

## Closing criteria

- [ ] Design review for remote transport threat model
- [ ] `safeFetch` / network-guard on remote URL
- [ ] Trust + confirm before first remote connect
- [ ] Feature flag gated rollout
- [ ] Tests without real network for redirect/SSRF/deny paths
