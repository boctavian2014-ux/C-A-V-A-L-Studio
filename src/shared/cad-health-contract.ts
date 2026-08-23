/**
 * Narrow CAD health IPC contract — derived in main, never a forwarded /health body.
 */

export const CAD_HEALTH_STATES = ["healthy", "degraded", "unavailable"] as const;
export type CadHealthState = (typeof CAD_HEALTH_STATES)[number];

export const CAD_HEALTH_SNAPSHOT_KEYS = [
  "state",
  "ok",
  "openscadInstalled",
  "authRequired",
  "openRouterConfigured",
  "piapiConfigured",
  "meshyConfigured",
  "meshWorkerConfigured",
  "meshConfigured",
  "checkedAt",
] as const;

export type CadHealthSnapshot = {
  state: CadHealthState;
  /** Reachable (HTTP 200 + body.ok), not “fully configured”. */
  ok: boolean;
  openscadInstalled: boolean;
  authRequired: boolean;
  openRouterConfigured: boolean;
  piapiConfigured: boolean;
  meshyConfigured: boolean;
  meshWorkerConfigured: boolean;
  meshConfigured: boolean;
  checkedAt: string;
};

export type CadHealthProbeInput = {
  /** False for non-200, probe fail, timeout, invalid JSON, SSRF. */
  reachable: boolean;
  body?: unknown;
  now?: () => Date;
};

const FALSE_FLAGS = {
  openscadInstalled: false,
  authRequired: false,
  openRouterConfigured: false,
  piapiConfigured: false,
  meshyConfigured: false,
  meshWorkerConfigured: false,
  meshConfigured: false,
} as const;

function flag(raw: Record<string, unknown>, key: keyof typeof FALSE_FLAGS): boolean {
  return raw[key] === true;
}

function capabilityGap(raw: Record<string, unknown>): boolean {
  return (
    raw.openRouterConfigured === false ||
    raw.piapiConfigured === false ||
    raw.openscadInstalled === false ||
    raw.meshConfigured === false
  );
}

function unavailableSnapshot(checkedAt: string): CadHealthSnapshot {
  return {
    state: "unavailable",
    ok: false,
    ...FALSE_FLAGS,
    checkedAt,
  };
}

/** Pure mapper: probe outcome → allowlisted snapshot. `ok === (state !== "unavailable")`. */
export function mapCadHealthSnapshot(input: CadHealthProbeInput): CadHealthSnapshot {
  const checkedAt = (input.now ?? (() => new Date()))().toISOString();
  if (!input.reachable || input.body == null || typeof input.body !== "object") {
    return unavailableSnapshot(checkedAt);
  }
  const raw = input.body as Record<string, unknown>;
  if (raw.ok !== true) {
    return unavailableSnapshot(checkedAt);
  }
  const state: CadHealthState = capabilityGap(raw) ? "degraded" : "healthy";
  return {
    state,
    ok: true,
    openscadInstalled: flag(raw, "openscadInstalled"),
    authRequired: flag(raw, "authRequired"),
    openRouterConfigured: flag(raw, "openRouterConfigured"),
    piapiConfigured: flag(raw, "piapiConfigured"),
    meshyConfigured: flag(raw, "meshyConfigured"),
    meshWorkerConfigured: flag(raw, "meshWorkerConfigured"),
    meshConfigured: flag(raw, "meshConfigured"),
    checkedAt,
  };
}
