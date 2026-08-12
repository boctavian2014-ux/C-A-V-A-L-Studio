/**
 * Lot C3 — MCP remote transport interfaces (NOT wired; flag OFF).
 * Do not import these into production connect paths until SEC-MCP-REMOTE-001 is implemented.
 */
import { MCP_REMOTE_ENABLED } from "./mcp-capabilities";

export type McpRemoteTransportKind = "http" | "sse" | "websocket";

export interface McpRemoteServerConfig {
  id: string;
  name: string;
  transport: McpRemoteTransportKind;
  /** Must be validated with network-guard before use. */
  url: string;
  enabled?: boolean;
}

export interface McpRemoteConnectResult {
  ok: false;
  error: string;
}

/** Always fails while remote MCP is disabled. */
export async function connectMcpRemote(
  _config: McpRemoteServerConfig
): Promise<McpRemoteConnectResult> {
  if (!MCP_REMOTE_ENABLED) {
    return {
      ok: false,
      error: "MCP remote transports are disabled (mcp.remote.enabled=false). See SEC-MCP-REMOTE-001.",
    };
  }
  return {
    ok: false,
    error: "MCP remote transports are not implemented.",
  };
}

export { MCP_REMOTE_ENABLED };
