/**
 * Lot C3 — MCP server capability classes for defaults + permission grants.
 */

export type McpCapability =
  | "filesystem:read"
  | "filesystem:write"
  | "network"
  | "exec"
  | "git"
  | "secrets"
  | "browser";

export type McpSafetyClass = "LOCAL_SAFE" | "NETWORK_OR_WRITE";

export interface McpServerCapabilityProfile {
  id: string;
  safety: McpSafetyClass;
  capabilities: McpCapability[];
  /** Default enabled in DEFAULT_CAVAL_CONFIG */
  defaultEnabled: boolean;
}

/**
 * Built-in profiles for known server ids.
 * LOCAL_SAFE: no network, no destructive write — may default enabled without trust prompt.
 * NETWORK_OR_WRITE: requires explicit workspace trust before start/tool use.
 */
export const MCP_SERVER_PROFILES: Record<string, McpServerCapabilityProfile> = {
  memory: {
    id: "memory",
    safety: "LOCAL_SAFE",
    capabilities: [],
    defaultEnabled: true,
  },
  semgrep: {
    id: "semgrep",
    safety: "LOCAL_SAFE",
    capabilities: ["filesystem:read"],
    defaultEnabled: true,
  },
  trivy: {
    id: "trivy",
    safety: "LOCAL_SAFE",
    capabilities: ["filesystem:read"],
    defaultEnabled: true,
  },
  filesystem: {
    id: "filesystem",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["filesystem:read", "filesystem:write"],
    defaultEnabled: false,
  },
  git: {
    id: "git",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["git", "filesystem:read", "filesystem:write"],
    defaultEnabled: false,
  },
  fetch: {
    id: "fetch",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["network"],
    defaultEnabled: false,
  },
  firecrawl: {
    id: "firecrawl",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["network", "secrets"],
    defaultEnabled: false,
  },
  postgres: {
    id: "postgres",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["network", "secrets"],
    defaultEnabled: false,
  },
  github: {
    id: "github",
    safety: "NETWORK_OR_WRITE",
    capabilities: ["network", "secrets", "exec"],
    defaultEnabled: false,
  },
};

export function getMcpServerProfile(serverId: string): McpServerCapabilityProfile {
  return (
    MCP_SERVER_PROFILES[serverId] ?? {
      id: serverId,
      safety: "NETWORK_OR_WRITE",
      capabilities: ["exec", "network", "filesystem:write"],
      defaultEnabled: false,
    }
  );
}

export function isLocalSafeMcpServer(serverId: string): boolean {
  return getMcpServerProfile(serverId).safety === "LOCAL_SAFE";
}

/** Feature flag — remote MCP transports are not implemented. */
export const MCP_REMOTE_ENABLED = false as const;
