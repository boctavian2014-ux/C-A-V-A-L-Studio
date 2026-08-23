import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcHarness } from "./ipc-harness";

const harness = createIpcHarness();

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
    getPath: () => "C:\\tmp\\caval-is-cloud-only-test",
  },
}));

const DENYLIST = ["defaultUrl", "url", "error", "headers", "ok"] as const;

function assertNarrow(result: { cloudOnly: boolean }) {
  expect(Object.keys(result).sort()).toEqual(["cloudOnly"]);
  for (const key of DENYLIST) {
    expect(result).not.toHaveProperty(key);
  }
  expect(JSON.stringify(result)).not.toMatch(/https?:\/\//);
  expect(JSON.stringify(result)).not.toMatch(/railway\.app/i);
}

describe("cad:isCloudOnly IPC payload", () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    harness.reset();
    for (const key of ["CAD_CLOUD_ONLY", "CAD_API_URL", "CAD_USE_LOCAL"]) {
      prevEnv[key] = process.env[key];
    }

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

  it("returns exactly { cloudOnly: true } when cloud-only mode is active", async () => {
    process.env.CAD_CLOUD_ONLY = "1";
    const result = await harness.invoke<{ cloudOnly: boolean }>("cad:isCloudOnly");
    assertNarrow(result);
    expect(result.cloudOnly).toBe(true);
  });

  it("returns exactly { cloudOnly: false } when local mode is allowed", async () => {
    process.env.CAD_CLOUD_ONLY = "0";
    const result = await harness.invoke<{ cloudOnly: boolean }>("cad:isCloudOnly");
    assertNarrow(result);
    expect(result.cloudOnly).toBe(false);
  });

  it("rejects an untrusted sender before responding", async () => {
    const originalGetUrl = harness.sender.getURL;
    harness.sender.getURL = () => "https://evil.example/renderer";
    try {
      await expect(harness.invoke("cad:isCloudOnly")).rejects.toThrow(/Untrusted IPC sender/);
    } finally {
      harness.sender.getURL = originalGetUrl;
    }
  });
});
