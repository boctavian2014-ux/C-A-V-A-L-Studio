import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONNECTION_HEALTH,
  aggregateConnectionHealth,
  evaluateMcpHealth,
  evaluateRailwayHealth,
  worstConnectionHealth,
} from "../../src/shared/connection-health-contract";

describe("connection health defaults", () => {
  it("is unknown before any check", () => {
    expect(DEFAULT_CONNECTION_HEALTH.overall).toBe("unknown");
    expect(DEFAULT_CONNECTION_HEALTH.railway).toBe("unknown");
    expect(DEFAULT_CONNECTION_HEALTH.mcp).toBe("unknown");
  });
});

describe("evaluateRailwayHealth", () => {
  it("maps CAD probe failure to unavailable", () => {
    expect(evaluateRailwayHealth(null)).toBe("unavailable");
    expect(evaluateRailwayHealth({ ok: false })).toBe("unavailable");
    expect(evaluateRailwayHealth({})).toBe("unavailable");
  });

  it("maps CAD ok with a capability gap to degraded", () => {
    expect(
      evaluateRailwayHealth({
        ok: true,
        openRouterConfigured: false,
        piapiConfigured: true,
        openscadInstalled: true,
      })
    ).toBe("degraded");
    expect(
      evaluateRailwayHealth({
        ok: true,
        openRouterConfigured: true,
        piapiConfigured: false,
        openscadInstalled: true,
      })
    ).toBe("degraded");
    expect(
      evaluateRailwayHealth({
        ok: true,
        openRouterConfigured: true,
        piapiConfigured: true,
        openscadInstalled: false,
      })
    ).toBe("degraded");
  });

  it("maps CAD ok without known gaps to healthy", () => {
    expect(evaluateRailwayHealth({ ok: true })).toBe("healthy");
    expect(
      evaluateRailwayHealth({
        ok: true,
        openRouterConfigured: true,
        piapiConfigured: true,
        openscadInstalled: true,
      })
    ).toBe("healthy");
  });
});

describe("evaluateMcpHealth", () => {
  it("is healthy when no servers are enabled", () => {
    expect(evaluateMcpHealth([])).toBe("healthy");
    expect(evaluateMcpHealth([{ enabled: false, running: false, transport: "http" }])).toBe(
      "healthy"
    );
  });

  it("is degraded when an enabled stdio server is stopped", () => {
    expect(
      evaluateMcpHealth([
        { enabled: true, running: false },
        { enabled: true, running: true },
      ])
    ).toBe("degraded");
  });

  it("is unavailable when an enabled remote transport is present", () => {
    expect(
      evaluateMcpHealth([
        { enabled: true, running: true },
        { enabled: true, running: true, transport: "http" },
      ])
    ).toBe("unavailable");
    expect(evaluateMcpHealth([{ enabled: true, running: false, transport: "sse" }])).toBe(
      "unavailable"
    );
  });

  it("is healthy when every enabled stdio server is running", () => {
    expect(
      evaluateMcpHealth([
        { enabled: true, running: true },
        { enabled: false, running: false, transport: "websocket" },
      ])
    ).toBe("healthy");
  });
});

describe("aggregateConnectionHealth", () => {
  it("uses Railway only and sets mcp skipped when no workspace is bound", () => {
    const healthy = aggregateConnectionHealth({
      workspaceBound: false,
      railway: "healthy",
      mcp: "unknown",
    });
    expect(healthy.mcp).toBe("skipped");
    expect(healthy.overall).toBe("healthy");
    expect(healthy.railway).toBe("healthy");

    const failed = aggregateConnectionHealth({
      workspaceBound: false,
      railway: "unavailable",
      mcp: "degraded",
    });
    expect(failed.mcp).toBe("skipped");
    expect(failed.overall).toBe("unavailable");
  });

  it("never lets skipped downgrade Railway, even if passed with a workspace", () => {
    const snap = aggregateConnectionHealth({
      workspaceBound: true,
      railway: "healthy",
      mcp: "skipped",
    });
    expect(snap.overall).toBe("healthy");
    expect(snap.mcp).toBe("skipped");
  });

  it("uses worst-wins when a workspace is bound", () => {
    expect(
      aggregateConnectionHealth({
        workspaceBound: true,
        railway: "healthy",
        mcp: evaluateMcpHealth([{ enabled: true, running: false }]),
      }).overall
    ).toBe("degraded");

    expect(
      aggregateConnectionHealth({
        workspaceBound: true,
        railway: "healthy",
        mcp: evaluateMcpHealth([{ enabled: true, running: true, transport: "http" }]),
      }).overall
    ).toBe("unavailable");
  });

  it("never reports healthy if MCP is unknown (not skipped) and Railway is healthy", () => {
    const snap = aggregateConnectionHealth({
      workspaceBound: true,
      railway: "healthy",
      mcp: "unknown",
    });
    expect(snap.overall).toBe("unknown");
    expect(snap.overall).not.toBe("healthy");
  });

  it("applies worst-wins order unavailable > degraded > unknown > healthy", () => {
    expect(worstConnectionHealth("unavailable", "degraded")).toBe("unavailable");
    expect(worstConnectionHealth("degraded", "unknown")).toBe("degraded");
    expect(worstConnectionHealth("unknown", "healthy")).toBe("unknown");
    expect(worstConnectionHealth("healthy", "healthy")).toBe("healthy");
  });
});

describe("false-green matrix", () => {
  const cases: Array<{
    name: string;
    workspaceBound: boolean;
    railway: "unknown" | "healthy" | "degraded" | "unavailable";
    mcp: "unknown" | "healthy" | "degraded" | "unavailable" | "skipped";
    overall: "unknown" | "healthy" | "degraded" | "unavailable";
  }> = [
    {
      name: "no workspace + Railway healthy → healthy via explicit MCP skip",
      workspaceBound: false,
      railway: "healthy",
      mcp: "unknown",
      overall: "healthy",
    },
    {
      name: "workspace + Railway healthy + MCP unknown → unknown, not healthy",
      workspaceBound: true,
      railway: "healthy",
      mcp: "unknown",
      overall: "unknown",
    },
    {
      name: "workspace + Railway healthy + MCP degraded → degraded",
      workspaceBound: true,
      railway: "healthy",
      mcp: "degraded",
      overall: "degraded",
    },
    {
      name: "workspace + Railway healthy + MCP unavailable → unavailable",
      workspaceBound: true,
      railway: "healthy",
      mcp: "unavailable",
      overall: "unavailable",
    },
    {
      name: "workspace + Railway degraded + MCP healthy → degraded",
      workspaceBound: true,
      railway: "degraded",
      mcp: "healthy",
      overall: "degraded",
    },
    {
      name: "skip is the only path to healthy without MCP verification",
      workspaceBound: false,
      railway: "healthy",
      mcp: "skipped",
      overall: "healthy",
    },
  ];

  it.each(cases)("$name", ({ workspaceBound, railway, mcp, overall }) => {
    const snap = aggregateConnectionHealth({ workspaceBound, railway, mcp });
    expect(snap.overall).toBe(overall);
    if (overall === "healthy" && mcp !== "skipped" && !workspaceBound) {
      expect(snap.mcp).toBe("skipped");
    }
    if (workspaceBound && mcp === "unknown") {
      expect(snap.overall).not.toBe("healthy");
    }
  });
});
