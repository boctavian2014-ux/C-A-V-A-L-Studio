import { ipcMain, type IpcMainInvokeEvent } from "electron";

import { loadCavalConfig } from "../../ai/config/caval-config";
import { mcpManager } from "../../ai/mcp/mcp-client";
import {
  aggregateConnectionHealth,
  evaluateMcpHealth,
  evaluateRailwayHealth,
  type ConnectionHealthSnapshot,
  type McpHealthServerInput,
  type RailwayHealthSignals,
} from "../shared/connection-health-contract";
import type { BoundWorkspaceRootGetter } from "./bound-workspace";
import { resolveCadBaseUrl } from "./cad-handlers";
import { assertTrustedSender } from "./ipc-trust";
import { NETWORK_GUARD_DEFAULTS, safeFetch } from "./network-guard";

const CHANNEL = "caval:connection-health";
const RAILWAY_HEALTH_TIMEOUT_MS = 2_500;
const HEALTH_JSON_MAX_BYTES = 16 * 1024;

const CONFIGURED_KEYS = [
  "openRouterConfigured",
  "piapiConfigured",
  "meshyConfigured",
  "meshWorkerConfigured",
  "meshConfigured",
] as const;

function pickRailwaySignals(body: unknown): RailwayHealthSignals | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const raw = body as Record<string, unknown>;
  const signals: RailwayHealthSignals = {};
  if (typeof raw.ok === "boolean") {
    signals.ok = raw.ok;
  }
  for (const key of CONFIGURED_KEYS) {
    if (typeof raw[key] === "boolean") {
      signals[key] = raw[key];
    }
  }
  if (typeof raw.openscadInstalled === "boolean") {
    signals.openscadInstalled = raw.openscadInstalled;
  }
  if (typeof raw.authRequired === "boolean") {
    signals.authRequired = raw.authRequired;
  }
  return signals;
}

function snapshotOf(input: {
  workspaceBound: boolean;
  railway: ConnectionHealthSnapshot["railway"];
  mcp: ConnectionHealthSnapshot["mcp"];
  checkedAt: number;
}): ConnectionHealthSnapshot {
  const aggregated = aggregateConnectionHealth(input);
  return {
    overall: aggregated.overall,
    railway: aggregated.railway,
    mcp: aggregated.mcp,
    checkedAt: aggregated.checkedAt,
  };
}

/** Mirrors cad-handlers probeHealth: GET /health via safeFetch, 2.5s timeout. */
async function probeRailwayHealth(): Promise<ConnectionHealthSnapshot["railway"]> {
  try {
    const base = await resolveCadBaseUrl();
    const result = await safeFetch(`${base.replace(/\/+$/, "")}/health`, {
      mode: "cad-base",
      cadBaseUrl: base,
      timeoutMs: RAILWAY_HEALTH_TIMEOUT_MS,
      maxBytes: Math.min(NETWORK_GUARD_DEFAULTS.JSON_MAX_BYTES, HEALTH_JSON_MAX_BYTES),
      allowedContentTypes: null,
    });
    if (!result.ok) {
      return "unavailable";
    }
    const body: unknown = JSON.parse(result.buffer.toString("utf8"));
    return evaluateRailwayHealth(pickRailwaySignals(body));
  } catch {
    return "unavailable";
  }
}

async function probeMcpHealth(workspaceRoot: string): Promise<ConnectionHealthSnapshot["mcp"]> {
  try {
    const config = await loadCavalConfig(workspaceRoot);
    mcpManager.loadFromConfig(config, workspaceRoot);
    const listed = new Map(mcpManager.list().map((server) => [server.id, server.running === true]));
    const servers: McpHealthServerInput[] = (config.mcp?.servers ?? []).map((server) => {
      const transport = (server as { transport?: unknown }).transport;
      return {
        enabled: server.enabled === true,
        running: listed.get(server.id) === true,
        transport: typeof transport === "string" ? transport : undefined,
      };
    });
    return evaluateMcpHealth(servers);
  } catch {
    return "unavailable";
  }
}

export function registerConnectionHealthHandlers(
  getBoundWorkspaceRoot: BoundWorkspaceRootGetter
): void {
  ipcMain.handle(CHANNEL, async (event: IpcMainInvokeEvent): Promise<ConnectionHealthSnapshot> => {
    assertTrustedSender(event);
    const checkedAt = Date.now();
    const railway = await probeRailwayHealth();
    const root = getBoundWorkspaceRoot(event.sender.id)?.trim();
    if (!root) {
      return snapshotOf({
        workspaceBound: false,
        railway,
        mcp: "skipped",
        checkedAt,
      });
    }
    const mcp = await probeMcpHealth(root);
    return snapshotOf({
      workspaceBound: true,
      railway,
      mcp,
      checkedAt,
    });
  });
}
