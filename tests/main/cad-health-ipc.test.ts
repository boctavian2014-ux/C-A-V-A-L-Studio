import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CAD_HEALTH_SNAPSHOT_KEYS,
  mapCadHealthSnapshot,
  type CadHealthSnapshot,
} from "../../src/shared/cad-health-contract";
import { NetworkGuardError } from "../../src/main/network-guard";
import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();
const safeFetchMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  ipcMain: harness.ipcMain,
  dialog: {
    showMessageBox: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => undefined),
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getPath: () => "C:\\tmp\\caval-cad-health-test",
  },
}));

vi.mock("../../src/main/network-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/network-guard")>();
  return {
    ...actual,
    safeFetch: (...args: unknown[]) => safeFetchMock(...args),
  };
});

const ALLOWLIST = [...CAD_HEALTH_SNAPSHOT_KEYS].sort();
const DENYLIST = [
  "url",
  "body",
  "headers",
  "error",
  "llmModel",
  "cloudOnly",
  "service",
  "allowFallback",
  "anonymousAllowed",
  "legacyClientSecretPayload",
  "supabaseConfigured",
  "profileVaultConfigured",
] as const;

const PLANTED_SERVER_CHECKED_AT = "2000-01-01T00:00:00.000Z";

function fatHealthBody(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    url: "https://should-not-leak.example/health",
    llmModel: "openai/should-not-leak",
    service: "cad",
    allowFallback: true,
    anonymousAllowed: true,
    legacyClientSecretPayload: true,
    supabaseConfigured: true,
    profileVaultConfigured: true,
    checkedAt: PLANTED_SERVER_CHECKED_AT,
    openRouterConfigured: true,
    piapiConfigured: true,
    meshyConfigured: true,
    meshWorkerConfigured: true,
    meshConfigured: true,
    openscadInstalled: true,
    authRequired: true,
    ...overrides,
  };
}

function jsonResult(body: unknown) {
  return {
    ok: true,
    buffer: Buffer.from(JSON.stringify(body)),
  };
}

function assertAllowlisted(snapshot: CadHealthSnapshot) {
  expect(Object.keys(snapshot).sort()).toEqual(ALLOWLIST);
  for (const key of DENYLIST) {
    expect(snapshot).not.toHaveProperty(key);
  }
  expect(snapshot.ok).toBe(snapshot.state !== "unavailable");
  expect(snapshot.checkedAt).not.toBe(PLANTED_SERVER_CHECKED_AT);
  expect(Number.isNaN(Date.parse(snapshot.checkedAt))).toBe(false);
}

describe("mapCadHealthSnapshot", () => {
  const now = () => new Date("2026-08-23T12:00:00.000Z");

  it("keeps ok === (state !== unavailable) for healthy, degraded, and unavailable", () => {
    const healthy = mapCadHealthSnapshot({
      reachable: true,
      body: fatHealthBody(),
      now,
    });
    expect(healthy.state).toBe("healthy");
    expect(healthy.ok).toBe(true);

    const degraded = mapCadHealthSnapshot({
      reachable: true,
      body: fatHealthBody({ meshConfigured: false }),
      now,
    });
    expect(degraded.state).toBe("degraded");
    expect(degraded.ok).toBe(true);

    const unavailable = mapCadHealthSnapshot({ reachable: false, now });
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.ok).toBe(false);
  });

  it("does not treat missing optional flags as a capability gap", () => {
    const snap = mapCadHealthSnapshot({
      reachable: true,
      body: { ok: true },
      now,
    });
    expect(snap.state).toBe("healthy");
    expect(snap.ok).toBe(true);
  });
});

describe("cad:health IPC payload", () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    harness.reset();
    safeFetchMock.mockReset();
    for (const key of ["CAD_CLOUD_ONLY", "CAD_API_URL", "CAD_USE_LOCAL"]) {
      prevEnv[key] = process.env[key];
    }
    process.env.CAD_CLOUD_ONLY = "1";
    process.env.CAD_API_URL = "https://example.up.railway.app";
    delete process.env.CAD_USE_LOCAL;

    const { registerCadHandlers, resetCadBaseUrlCache } = await import(
      "../../src/main/cad-handlers.js"
    );
    resetCadBaseUrlCache();
    registerCadHandlers(() => undefined);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns only the allowlisted snapshot on success and drops planted server fields", async () => {
    safeFetchMock.mockResolvedValue(jsonResult(fatHealthBody()));
    const snapshot = await harness.invoke<CadHealthSnapshot>("cad:health");
    assertAllowlisted(snapshot);
    expect(snapshot.state).toBe("healthy");
    expect(snapshot.openRouterConfigured).toBe(true);
    expect(snapshot.meshConfigured).toBe(true);
  });

  it("maps probe failure to unavailable without url or error text", async () => {
    safeFetchMock.mockResolvedValue({ ok: false, buffer: Buffer.from("") });
    const snapshot = await harness.invoke<CadHealthSnapshot>("cad:health");
    assertAllowlisted(snapshot);
    expect(snapshot.state).toBe("unavailable");
    expect(snapshot.ok).toBe(false);
  });

  it("maps timeout to unavailable without transport text", async () => {
    safeFetchMock.mockRejectedValue(
      new NetworkGuardError("timeout", "request timed out", "https://example.up.railway.app/health")
    );
    const snapshot = await harness.invoke<CadHealthSnapshot>("cad:health");
    assertAllowlisted(snapshot);
    expect(snapshot.state).toBe("unavailable");
  });

  it("maps invalid JSON to unavailable", async () => {
    safeFetchMock.mockResolvedValue({
      ok: true,
      buffer: Buffer.from("not-json{"),
    });
    const snapshot = await harness.invoke<CadHealthSnapshot>("cad:health");
    assertAllowlisted(snapshot);
    expect(snapshot.state).toBe("unavailable");
  });

  it("maps SSRF-blocked fetch to unavailable without NetworkGuardError fields", async () => {
    safeFetchMock.mockRejectedValue(
      new NetworkGuardError("host", "host not allowed", "https://evil.example/health")
    );
    const snapshot = await harness.invoke<CadHealthSnapshot>("cad:health");
    assertAllowlisted(snapshot);
    expect(snapshot.state).toBe("unavailable");
    expect(JSON.stringify(snapshot)).not.toContain("evil.example");
    expect(JSON.stringify(snapshot)).not.toContain("host not allowed");
  });

  it("rejects an untrusted sender before probing", async () => {
    const originalGetUrl = harness.sender.getURL;
    harness.sender.getURL = () => "https://evil.example/renderer";
    try {
      await expect(harness.invoke("cad:health")).rejects.toThrow(/Untrusted IPC sender/);
      expect(safeFetchMock).not.toHaveBeenCalled();
    } finally {
      harness.sender.getURL = originalGetUrl;
    }
  });
});
