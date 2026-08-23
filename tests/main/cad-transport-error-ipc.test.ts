import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NetworkGuardError } from "../../src/main/network-guard";
import { containsCadTransportLeak } from "../../src/shared/cad-transport-error";
import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();
const safeFetchMock = vi.hoisted(() => vi.fn());

const CONFIGURED_HOST = "c-a-v-a-l-studio-production.up.railway.app";
const CONFIGURED_BASE = `https://${CONFIGURED_HOST}`;

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
    getPath: () => "C:\\tmp\\caval-cad-transport-test",
  },
}));

vi.mock("../../src/main/network-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/network-guard")>();
  return {
    ...actual,
    safeFetch: (...args: unknown[]) => safeFetchMock(...args),
  };
});

vi.mock("../../src/main/cad-local-server", () => ({
  ensureCadLocalServer: vi.fn().mockResolvedValue(false),
  localCadUrl: () => "http://127.0.0.1:8791",
}));

function healthOk(url: string) {
  return {
    ok: true,
    status: 200,
    buffer: Buffer.from(JSON.stringify({ ok: true, piapiConfigured: true })),
    headers: new Headers(),
    url,
    contentType: "application/json",
  };
}

function jsonFailure(url: string, status: number, body: Record<string, unknown>) {
  return {
    ok: false,
    status,
    buffer: Buffer.from(JSON.stringify(body)),
    headers: new Headers(),
    url,
    contentType: "application/json",
  };
}

function assertIpcErrorLeakFree(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(containsCadTransportLeak(serialized, CONFIGURED_HOST)).toBe(false);
  expect(serialized).not.toMatch(/https?:\/\//i);
  expect(serialized).not.toContain("railway.app");
  expect(serialized).not.toContain(CONFIGURED_HOST);
  expect(serialized).not.toContain("fetch failed");
  expect(serialized).not.toContain("host not allowed");
  expect(serialized).not.toContain("dns lookup failed");
}

describe("CAD transport IPC errors", () => {
  const prevEnv: Record<string, string | undefined> = {};
  const workspaceRoot = "C:\\tmp\\caval-cad-transport-ws";

  beforeEach(async () => {
    harness.reset();
    safeFetchMock.mockReset();
    for (const key of ["CAD_CLOUD_ONLY", "CAD_API_URL", "CAD_USE_LOCAL"]) {
      prevEnv[key] = process.env[key];
    }
    process.env.CAD_CLOUD_ONLY = "1";
    process.env.CAD_API_URL = CONFIGURED_BASE;
    process.env.CAD_USE_LOCAL = "1";

    safeFetchMock.mockImplementation(async (url: string) => healthOk(url));

    const { registerCadHandlers, resetCadBaseUrlCache } = await import(
      "../../src/main/cad-handlers.js"
    );
    resetCadBaseUrlCache();
    registerCadHandlers(() => workspaceRoot);
  });

  afterEach(async () => {
    const { releaseCadWorkspaceLock } = await import("../../src/main/cad-workspace-lock.js");
    releaseCadWorkspaceLock({ workspaceRoot, reason: "aborted" });
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("cad:plan returns generic errors for timeout, SSRF, invalid JSON, and non-2xx", async () => {
    const cases: Array<{ name: string; mock: () => void }> = [
      {
        name: "timeout",
        mock: () =>
          safeFetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/health")) return healthOk(url);
            throw new NetworkGuardError("timeout", "request timed out", url);
          }),
      },
      {
        name: "ssrf",
        mock: () =>
          safeFetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/health")) return healthOk(url);
            throw new NetworkGuardError("host", "host not allowed", url);
          }),
      },
      {
        name: "invalid-json",
        mock: () =>
          safeFetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/health")) return healthOk(url);
            return {
              ok: true,
              status: 200,
              buffer: Buffer.from("not-json"),
              headers: new Headers(),
              url,
              contentType: "application/json",
            };
          }),
      },
      {
        name: "non-2xx",
        mock: () =>
          safeFetchMock.mockImplementation(async (url: string) => {
            if (url.includes("/health")) return healthOk(url);
            return jsonFailure(url, 503, {
              error: `upstream failure at ${CONFIGURED_BASE}/cad/plan`,
            });
          }),
      },
    ];

    for (const testCase of cases) {
      safeFetchMock.mockReset();
      safeFetchMock.mockImplementation(async (url: string) => healthOk(url));
      testCase.mock();
      const result = await harness.invoke<{ ok: boolean; error?: string }>("cad:plan", {
        messages: [{ role: "user", content: "gear" }],
        latestUserText: "make a gear",
      });
      expect(result.ok, testCase.name).toBe(false);
      expect(result.error, testCase.name).toBeTruthy();
      assertIpcErrorLeakFree(result);
    }
  });

  it("cad:getJob returns generic transport and HTTP failures", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/health")) return healthOk(url);
      if (url.includes("/cad/jobs/job-1")) {
        throw new NetworkGuardError("dns", "dns lookup failed", url);
      }
      return healthOk(url);
    });
    const transport = await harness.invoke<{ ok: boolean; error?: string }>("cad:getJob", {
      jobId: "job-1",
    });
    expect(transport.ok).toBe(false);
    assertIpcErrorLeakFree(transport);

    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/health")) return healthOk(url);
      if (url.includes("/cad/jobs/job-2")) {
        return jsonFailure(url, 502, {
          error: `bad gateway ${CONFIGURED_BASE}`,
        });
      }
      return healthOk(url);
    });
    const http = await harness.invoke<{ ok: boolean; error?: string }>("cad:getJob", {
      jobId: "job-2",
    });
    expect(http.ok).toBe(false);
    assertIpcErrorLeakFree(http);
  });

  it("cad:createJob returns generic transport failures", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/health")) return healthOk(url);
      if (url.includes("/cad/jobs") && !url.includes("/cad/jobs/")) {
        throw new NetworkGuardError("timeout", "request timed out", url);
      }
      return healthOk(url);
    });

    const result = await harness.invoke<{ ok: boolean; error?: string }>("cad:createJob", {
      prompt: "make a bracket",
      workspaceRoot,
    });
    expect(result.ok).toBe(false);
    assertIpcErrorLeakFree(result);
  });

  it("cad:cancelJob and cad:cancelJobs return generic failures", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/health")) return healthOk(url);
      if (url.includes("/cad/jobs/")) {
        return jsonFailure(url, 500, {
          error: `cancel failed at https://${CONFIGURED_HOST}`,
        });
      }
      return healthOk(url);
    });

    const single = await harness.invoke<{ ok: boolean; error?: string }>("cad:cancelJob", {
      jobId: "job-cancel-1",
      workspaceRoot,
    });
    expect(single.ok).toBe(false);
    assertIpcErrorLeakFree(single);

    const batch = await harness.invoke<{
      ok: boolean;
      results?: Array<{ error?: string }>;
    }>("cad:cancelJobs", {
      jobIds: ["job-cancel-2"],
      workspaceRoot,
    });
    expect(batch.ok).toBe(false);
    assertIpcErrorLeakFree(batch);
  });

  it("cad:getJobLogs returns generic failures", async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/health")) return healthOk(url);
      if (url.includes("/logs")) {
        throw new NetworkGuardError("host", "host not allowed", url);
      }
      return healthOk(url);
    });

    const result = await harness.invoke<{ ok: boolean; error?: string }>("cad:getJobLogs", {
      jobId: "job-logs-1",
    });
    expect(result.ok).toBe(false);
    assertIpcErrorLeakFree(result);
  });

  it("rejects an untrusted sender before probing transport", async () => {
    const originalGetUrl = harness.sender.getURL;
    harness.sender.getURL = () => "https://evil.example/renderer";
    try {
      await expect(
        harness.invoke("cad:getJob", { jobId: "job-trust" })
      ).rejects.toThrow(/Untrusted IPC sender/);
    } finally {
      harness.sender.getURL = originalGetUrl;
    }
  });
});
