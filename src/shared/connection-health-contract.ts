/**
 * Railway / MCP connection health — pure aggregation, no I/O.
 *
 * MCP `skipped` is used only when no workspace is bound: the check does not
 * apply, so it must never participate in worst-wins.
 */

export const CONNECTION_HEALTH_STATES = [
  "unknown",
  "healthy",
  "degraded",
  "unavailable",
] as const;

export type ConnectionHealthState = (typeof CONNECTION_HEALTH_STATES)[number];

/** MCP-only: check does not apply (no workspace). Never a worst-wins input. */
export type McpConnectionHealthState = ConnectionHealthState | "skipped";

/** Worst-wins order: unavailable > degraded > unknown > healthy. */
export const CONNECTION_HEALTH_WORST_RANK: Record<ConnectionHealthState, number> = {
  unavailable: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

export interface ConnectionHealthSnapshot {
  overall: ConnectionHealthState;
  railway: ConnectionHealthState;
  mcp: McpConnectionHealthState;
  checkedAt: number;
}

export const DEFAULT_CONNECTION_HEALTH: ConnectionHealthSnapshot = {
  overall: "unknown",
  railway: "unknown",
  mcp: "unknown",
  checkedAt: 0,
};

/** Fields parsed from CAD GET /health — never includes url or secrets. */
export interface RailwayHealthSignals {
  ok?: boolean;
  openRouterConfigured?: boolean;
  piapiConfigured?: boolean;
  meshyConfigured?: boolean;
  meshWorkerConfigured?: boolean;
  meshConfigured?: boolean;
  openscadInstalled?: boolean;
  authRequired?: boolean;
}

export interface McpHealthServerInput {
  enabled: boolean;
  running: boolean;
  /** Absent or `stdio` = local stdio. Any other value is remote (unprobed). */
  transport?: string;
}

export function isRemoteMcpTransport(transport?: string): boolean {
  const kind = transport?.trim().toLowerCase();
  return Boolean(kind) && kind !== "stdio";
}

export function worstConnectionHealth(
  left: ConnectionHealthState,
  right: ConnectionHealthState
): ConnectionHealthState {
  return CONNECTION_HEALTH_WORST_RANK[left] <= CONNECTION_HEALTH_WORST_RANK[right]
    ? left
    : right;
}

/**
 * Railway: probe failure / !ok → unavailable.
 * Reachable with a known capability gap → degraded.
 * Missing optional flags are not treated as a gap (no invented failure).
 */
export function evaluateRailwayHealth(signals: RailwayHealthSignals | null): ConnectionHealthState {
  if (!signals || signals.ok !== true) {
    return "unavailable";
  }
  const capabilityGap =
    signals.openRouterConfigured === false ||
    signals.piapiConfigured === false ||
    signals.openscadInstalled === false;
  return capabilityGap ? "degraded" : "healthy";
}

/**
 * Enabled servers only. Disabled remotes are excluded.
 * Enabled remote (non-stdio) → unavailable.
 * Enabled stdio not running → degraded.
 * Zero enabled servers → healthy (config verified, nothing to run).
 */
export function evaluateMcpHealth(servers: readonly McpHealthServerInput[]): McpConnectionHealthState {
  const enabled = servers.filter((server) => server.enabled);
  if (enabled.length === 0) {
    return "healthy";
  }
  if (enabled.some((server) => isRemoteMcpTransport(server.transport))) {
    return "unavailable";
  }
  if (enabled.some((server) => !server.running)) {
    return "degraded";
  }
  return "healthy";
}

export function aggregateConnectionHealth(input: {
  workspaceBound: boolean;
  railway: ConnectionHealthState;
  mcp: McpConnectionHealthState;
  checkedAt?: number;
}): ConnectionHealthSnapshot {
  const railway = input.railway;
  const checkedAt = input.checkedAt ?? 0;

  if (!input.workspaceBound) {
    return {
      overall: railway,
      railway,
      mcp: "skipped",
      checkedAt,
    };
  }

  const mcp = input.mcp;
  if (mcp === "skipped") {
    return {
      overall: railway,
      railway,
      mcp: "skipped",
      checkedAt,
    };
  }

  return {
    overall: worstConnectionHealth(railway, mcp),
    railway,
    mcp,
    checkedAt,
  };
}
